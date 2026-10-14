/**
 * vision.js —— 皮肤视觉分析引擎（纯计算，无 DOM 依赖）
 *
 * 流程：
 *   1. 逐像素转 CIE-Lab，并构建皮肤掩膜（YCbCr + HSV + 通道序，深浅肤色通用）
 *   2. 形态学开运算去噪 → 降采样连通域 → 最大连通域即人脸大致区域
 *   3. 用行/列皮肤覆盖率收紧包围盒（自动裁掉头发、背景）
 *   4. 按人脸比例划分解剖学 ROI（额头/眉间/眼周/颧颊/T 区/鼻部/鱼尾/法令纹/下巴）
 *   5. 在 ROI 内计算色彩、纹理、高频、边缘等原始指标与可视化热力图
 *
 * 输出的是"原始测量值"，评分与建议由 scoring.js 负责。
 */

import {
  rgbToLab,
  isSkinPixel,
  clamp,
  mean,
  median,
  std,
  percentile,
  boxBlur,
  erode,
  dilate,
} from './color.js';

/** ROI 定义，坐标为相对人脸包围盒的比例 [x0,y0,x1,y1] */
export const ROI_DEFS = {
  forehead: [0.22, 0.02, 0.78, 0.24],
  glabella: [0.42, 0.22, 0.58, 0.33],
  eyeLeft: [0.16, 0.30, 0.42, 0.44],
  eyeRight: [0.58, 0.30, 0.84, 0.44],
  underEyeLeft: [0.18, 0.38, 0.42, 0.48],
  underEyeRight: [0.58, 0.38, 0.82, 0.48],
  crowLeft: [0.05, 0.28, 0.22, 0.46],
  crowRight: [0.78, 0.28, 0.95, 0.46],
  cheekLeft: [0.12, 0.46, 0.40, 0.70],
  cheekRight: [0.60, 0.46, 0.88, 0.70],
  nose: [0.42, 0.34, 0.58, 0.60],
  perioral: [0.34, 0.62, 0.66, 0.74],
  chin: [0.34, 0.74, 0.66, 0.97],
  nasolabialLeft: [0.28, 0.56, 0.44, 0.78],
  nasolabialRight: [0.56, 0.56, 0.72, 0.78],
  face: [0.12, 0.02, 0.88, 0.97],
};

/** 用于分组统计的区域组合 */
const GROUPS = {
  cheeks: ['cheekLeft', 'cheekRight'],
  underEyes: ['underEyeLeft', 'underEyeRight'],
  crows: ['crowLeft', 'crowRight'],
  tzone: ['forehead', 'glabella', 'nose'],
  nasolabial: ['nasolabialLeft', 'nasolabialRight'],
  lines: ['forehead', 'glabella', 'crowLeft', 'crowRight'],
  pores: ['nose', 'cheekLeft', 'cheekRight'],
};

/**
 * 单帧完整分析
 * @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} imageData
 * @returns {object} 分析结果（ok=false 时附带 reason）
 */
export function analyzeFrame(imageData) {
  if (!imageData || typeof imageData !== 'object') return { ok: false, reason: 'invalid_frame' };
  const { data, width: W, height: H } = imageData;
  const N = W * H;
  if (!data || !Number.isFinite(W) || !Number.isFinite(H) || data.length < N * 4 || W < 32 || H < 32) {
    return { ok: false, reason: 'invalid_frame' };
  }

  /* ---------- 1. 逐像素 Lab + 皮肤掩膜 ---------- */
  const L = new Float32Array(N);
  const A = new Float32Array(N);
  const B = new Float32Array(N);
  const lum = new Float32Array(N);
  const lumHist = new Uint32Array(256);
  let rawSkin = new Uint8Array(N);
  let lowLight = 0;
  let clipped = 0;

  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const lab = rgbToLab(r, g, b);
    L[i] = lab[0];
    A[i] = lab[1];
    B[i] = lab[2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = y;
    lumHist[y < 0 ? 0 : y > 255 ? 255 : y | 0]++;
    if (y < 14) lowLight++;
    if (y > 248) clipped++;
    rawSkin[i] = isSkinPixel(r, g, b) ? 1 : 0;
  }

  // 全画面曝光中位数：与肤色明暗无关的曝光判据
  let acc = 0;
  let frameLum = 0;
  for (let v = 0; v < 256; v++) {
    acc += lumHist[v];
    if (acc >= N / 2) {
      frameLum = v;
      break;
    }
  }

  /* ---------- 2. 形态学开运算 → 最大连通域 ---------- */
  const skin = dilate(erode(rawSkin, W, H), W, H);
  const blob = largestBlob(skin, W, H, 4);
  if (!blob || blob.count < 24) {
    return { ok: false, reason: 'no_face', lowLightRatio: lowLight / N };
  }

  /* ---------- 3. 收紧包围盒 ---------- */
  const box = refineBox(skin, W, H, blob);
  if (!box) return { ok: false, reason: 'no_face' };

  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  if (bw < 32 || bh < 32) return { ok: false, reason: 'face_too_small' };

  /* ---------- 4. ROI ---------- */
  const rois = {};
  for (const [name, [a, b, c, d]] of Object.entries(ROI_DEFS)) {
    const x0 = clamp(Math.round(box.x0 + a * bw), 0, W - 1);
    const y0 = clamp(Math.round(box.y0 + b * bh), 0, H - 1);
    const x1 = clamp(Math.round(box.x0 + c * bw), x0 + 1, W);
    const y1 = clamp(Math.round(box.y0 + d * bh), y0 + 1, H);
    rois[name] = { x0, y0, x1, y1 };
  }

  const idxCache = new Map();
  /** 把组名（如 cheeks）展开成基础 ROI 名 */
  const expand = (names) => {
    const out = [];
    for (const nm of names) out.push(...(GROUPS[nm] || [nm]));
    return out;
  };
  const idxOf = (names) => {
    const full = expand(names);
    const key = full.join('|');
    if (idxCache.has(key)) return idxCache.get(key);
    const arr = [];
    for (const nm of full) {
      const r = rois[nm];
      for (let y = r.y0; y < r.y1; y++) {
        const row = y * W;
        for (let x = r.x0; x < r.x1; x++) {
          const i = row + x;
          if (skin[i]) arr.push(i);
        }
      }
    }
    idxCache.set(key, arr);
    return arr;
  };

  const areaOf = (names) => {
    let area = 0;
    for (const nm of expand(names)) {
      const r = rois[nm];
      area += (r.x1 - r.x0) * (r.y1 - r.y0);
    }
    return area;
  };

  const statsOf = (names) => {
    const idx = idxOf(names);
    const area = areaOf(names);
    const s = { n: idx.length, area, fill: area ? idx.length / area : 0, available: false, px: idx };
    if (idx.length < 80) return s;

    // 注意：先把 L/a/b 抽成数值数组，再交给统计函数；
    // 直接把索引数组传进去会算成"索引的统计量"。
    const n = idx.length;
    const Lv = new Float64Array(n);
    const Av = new Float64Array(n);
    const Bv = new Float64Array(n);
    let sL = 0;
    let sA = 0;
    let sB = 0;
    let sC = 0;
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      Lv[k] = L[i];
      Av[k] = A[i];
      Bv[k] = B[i];
      sL += L[i];
      sA += A[i];
      sB += B[i];
      sC += Math.hypot(A[i], B[i]);
    }
    s.Lmean = sL / n;
    s.Amean = sA / n;
    s.Bmean = sB / n;
    s.chroma = sC / n;
    s.Lmed = median(Lv);
    s.Amed = median(Av);
    s.Bmed = median(Bv);
    s.Lstd = std(Lv, null, s.Lmean);
    s.Lp90 = percentile(Lv, 0.9);
    s.Ap90 = percentile(Av, 0.9);
    s.available = s.fill >= 0.2 && n >= 120;
    return s;
  };

  const S = {};
  for (const name of Object.keys(ROI_DEFS)) S[name] = statsOf([name]);
  for (const [g, list] of Object.entries(GROUPS)) S[g] = statsOf(list);

  if (!S.face.available) return { ok: false, reason: 'face_occluded' };

  /* ---------- 5. 全局基线与频域特征 ---------- */
  const faceIdx = idxOf(['face']);
  const faceLmed = S.face.Lmed;
  const faceAmed = S.face.Amed;

  // ★ 尺度归一化：所有滤波半径按"人脸宽度"等比缩放，基准为 200px 脸宽。
  //   否则同一张脸用 480p 和 1080p 摄像头拍出来，纹理/毛孔数值会差好几倍，
  //   跨设备的历史趋势就完全不可比了。
  const faceW = Math.max(64, box.x1 - box.x0);
  const scale = faceW / 200;
  const R = (base) => Math.max(1, Math.round(base * scale));

  const blurFine = boxBlur(L, W, H, R(2)); // 细纹理基线
  const blurCoarse = boxBlur(L, W, H, R(6)); // 局部亮度基线（找高光 / 带通参考）
  const blurLocal = boxBlur(L, W, H, R(18)); // 局部肤色基线（色斑检测；半径须明显大于斑块）
  const blurMin = boxBlur(L, W, H, R(1)); // 最小尺度，用于估计传感器噪声
  const blurAMin = boxBlur(A, W, H, R(1));
  const blurALocal = boxBlur(A, W, H, R(12));
  // 带通响应：凸起为正、凹陷为负，细尺度模糊已滤除传感器噪点
  const band = new Float32Array(N);
  for (let i = 0; i < N; i++) band[i] = blurFine[i] - blurCoarse[i];

  // 传感器噪声底噪：|信号 - blur(1)| 的中位数。所有阈值都对它自适应，
  // 否则噪点多的摄像头会把"纹理""皱纹""色斑"全部误判出来。
  const noiseSamples = new Float64Array(faceIdx.length);
  const noiseASamples = new Float64Array(faceIdx.length);
  for (let k = 0; k < faceIdx.length; k++) {
    const i = faceIdx[k];
    noiseSamples[k] = Math.abs(L[i] - blurMin[i]);
    noiseASamples[k] = Math.abs(A[i] - blurAMin[i]);
  }
  const noiseFloor = median(noiseSamples);
  const noiseAFloor = median(noiseASamples);

  // Sobel 梯度（幅度 + 方向）：横向线条（抬头纹/法令纹）的梯度以垂直分量为主
  const gradMag = new Float32Array(N);
  const gradHoriz = new Float32Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx =
        -L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1] + L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1];
      const gy =
        -L[i - W - 1] - 2 * L[i - W] - L[i - W + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1];
      const mag = Math.hypot(gx, gy) / 4;
      gradMag[i] = mag;
      gradHoriz[i] = mag > 1e-6 ? Math.abs(gy) / Math.hypot(gx, gy) : 0;
    }
  }

  /* ---------- 6. 热力图与指标 ---------- */
  const mkMap = () => new Uint8Array(N);
  const mapRedness = mkMap();
  const mapShine = mkMap();
  const mapSpot = mkMap();
  const mapPore = mkMap();
  const mapLine = mkMap();
  const mapBlemish = mkMap();

  // 面部"内侧"区域（颧颊/额头/鼻/下巴）：避开面缘的光线衰减与嘴唇、眉毛
  const interiorIdx = idxOf(['cheeks', 'forehead', 'nose', 'chin']);

  const redThr = faceAmed + 10;
  // 色斑：相对【局部】肤色基线（半径 10 的模糊）的暗对比。
  // 不能用全脸基线 —— 色斑自身会把基线拉低，从而"自我掩盖"。
  const spotThr = Math.max(6, 3.5 * noiseFloor);
  // 痘印/丘疹：相对局部基线的红度突起
  const blemishThr = Math.max(5, 3.5 * noiseAFloor);
  // 油光阈值：亮度明显高于全脸基线，且色度被镜面反射"冲淡"
  const shineLThr = faceLmed + 14;
  const chromaThr = Math.max(12, S.face.chroma * 0.65);
  const isShine = (i) => {
    if (lum[i] >= 250) return false;
    const chroma = Math.hypot(A[i], B[i]);
    if (L[i] > shineLThr && chroma < chromaThr) return true; // 大面积油光（整个 T 区发亮）
    return L[i] - blurCoarse[i] > 12 && chroma < chromaThr * 1.5; // 点状镜面高光
  };
  // 纹路阈值与毛孔阈值都随噪声自适应；梯度是"每像素的 L* 变化量"，
  // 图像越大同一道纹路跨越的像素越多、梯度越小，所以要按 scale 反向缩放。
  const lineThr = clamp(4.5 / Math.max(0.5, scale) + 5 * noiseFloor, 4, 22);
  const poreThr = clamp(1.6 + 1.2 * noiseFloor, 2, 5);
  const isLineH = (i) => gradMag[i] > lineThr && gradHoriz[i] > 0.62; // 横向线条
  const isLineAny = (i) => gradMag[i] > lineThr;
  const isSpot = (i) => blurLocal[i] - L[i] > spotThr;
  const isBlemish = (i) => A[i] - blurALocal[i] > blemishThr;

  // 逐像素分类
  let redCount = 0;
  let shineCount = 0;
  let poreCount = 0;
  let lineCount = 0;
  let spotCount = 0;
  let blemishCount = 0;
  let detailSum = 0;
  let detailSum2 = 0;

  const isCheekOrForehead = new Uint8Array(N);
  for (const nm of ['cheekLeft', 'cheekRight', 'forehead', 'nose', 'chin']) {
    const r = rois[nm];
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) isCheekOrForehead[y * W + x] = 1;
    }
  }

  for (const i of faceIdx) {
    if (A[i] > redThr) {
      mapRedness[i] = 255;
      redCount++;
    }
    if (isShine(i)) {
      mapShine[i] = 255;
      shineCount++;
    }
    if (isCheekOrForehead[i] && isSpot(i) && A[i] <= redThr) {
      mapSpot[i] = 255;
      spotCount++;
    }
    if (isCheekOrForehead[i] && isBlemish(i)) {
      mapBlemish[i] = 255;
      blemishCount++;
    }
    // 毛孔/粗糙：中尺度带通响应的绝对值（毛孔、黑头、小凸起）
    const hf = L[i] - blurFine[i];
    if (isCheekOrForehead[i] && Math.abs(band[i]) > poreThr) {
      mapPore[i] = 255;
      poreCount++;
    }
    if (isLineAny(i)) {
      mapLine[i] = 255;
      lineCount++;
    }
    detailSum += Math.abs(hf);
    detailSum2 += hf * hf;
  }

  const faceN = faceIdx.length;
  const interiorN = interiorIdx.length || 1;

  // 均匀度专用统计：剔除镜面高光像素。
  // 否则"出油反光"会推高亮度离散度，被错误地算成"肤色不均"。
  const matteL = new Float64Array(faceN);
  const matteC = new Float64Array(faceN);
  let matteN = 0;
  for (const i of faceIdx) {
    if (isShine(i)) continue;
    matteL[matteN] = L[i];
    matteC[matteN] = Math.hypot(A[i], B[i]);
    matteN++;
  }
  const matteLstd = matteN > 50 ? std(matteL.subarray(0, matteN), null, mean(matteL.subarray(0, matteN))) : S.face.Lstd;
  const matteCstd = matteN > 50 ? std(matteC.subarray(0, matteN), null, mean(matteC.subarray(0, matteN))) : 0;

  const ratioIn = (group, pred) => {
    const idx = idxOf([group]);
    if (!idx.length) return 0;
    let c = 0;
    for (const i of idx) if (pred(i)) c++;
    return c / idx.length;
  };

  const shineIn = (group) => ratioIn(group, isShine);

  const lineDensity = (group, horizOnly = false) =>
    ratioIn(group, horizOnly ? isLineH : isLineAny);

  const textureOf = (group) => {
    const idx = idxOf([group]);
    if (!idx.length) return 0;
    let s = 0;
    for (const i of idx) s += Math.abs(L[i] - blurFine[i]);
    const base = Math.max(20, S[group] ? S[group].Lmed : faceLmed);
    // 扣除传感器噪声底噪，避免"摄像头噪点多"被误判为"皮肤粗糙"
    return (100 * Math.max(0, s / idx.length - 0.6 * noiseFloor)) / base;
  };

  const poreDensityOf = (group) => {
    const idx = idxOf([group]);
    if (!idx.length) return 0;
    let c = 0;
    for (const i of idx) if (Math.abs(band[i]) > poreThr) c++;
    return c / idx.length;
  };

  /* ---------- 7. 组装原始指标 ---------- */
  const undereyeL = S.underEyes.available ? S.underEyes.Lmed : NaN;
  const cheekL = S.cheeks.available ? S.cheeks.Lmed : NaN;

  const tone = classifyTone(S.face.Lmed, S.face.Bmed);

  const metrics = {
    // 色彩
    faceL: S.face.Lmed,
    faceLstd: S.face.Lstd,
    faceA: S.face.Amed,
    faceB: S.face.Bmed,
    faceChroma: S.face.chroma,

    // 泛红 / 敏感
    rednessRatio: redCount / faceN,
    cheekA: S.cheeks.available ? S.cheeks.Amed : faceAmed,
    rednessContrast: (S.cheeks.available ? S.cheeks.Amed : faceAmed) - faceAmed,
    cheekRednessRatio: shineSafe(() => ratioIn('cheeks', (i) => A[i] > redThr), 0),

    // 油光 / 水油平衡
    shineRatio: shineCount / faceN,
    tzoneShine: shineIn('tzone'),
    cheekShine: shineIn('cheeks'),
    foreheadShine: shineIn('forehead'),

    // 纹理 / 毛孔
    textureCheek: textureOf('cheeks'),
    textureFace: (100 * Math.max(0, detailSum / faceN - 0.6 * noiseFloor)) / Math.max(20, faceLmed),
    poreDensity: poreDensityOf('pores'),
    roughness: Math.sqrt(Math.max(0, detailSum2 / faceN - Math.pow(0.8 * noiseFloor, 2))),

    // 色斑 / 均匀度（分母为面部内侧可检测区域的皮肤面积）
    spotRatio: spotCount / interiorN,
    blemishRatio: blemishCount / interiorN,
    pigmentationStd: S.face.Lstd,
    faceLstdMatte: matteLstd,
    chromaStd: std(faceIdx.map((i) => Math.hypot(A[i], B[i])), null),
    chromaStdMatte: matteCstd,

    // 皱纹 / 纹路
    lineDensityForehead: lineDensity('forehead', true),
    lineDensityCrow: lineDensity('crows'),
    lineDensityNasolabial: lineDensity('nasolabial'),
    lineDensityOverall: lineCount / faceN,

    // 黑眼圈
    undereyeL: undereyeL,
    undereyeDelta: Number.isFinite(undereyeL) && Number.isFinite(cheekL) ? cheekL - undereyeL : NaN,

    // 光泽 / 暗沉
    radianceL: S.face.Lmed,
    sallowness: S.face.Bmed,

    // 图像质量
    sharpness: detailSum / faceN,
    frameLum,
    noiseFloor,
    lowLightRatio: lowLight / N,
    clipRatio: clipped / N,
    faceFill: blob.count / ((blob.maxX - blob.minX + 1) * (blob.maxY - blob.minY + 1)),
    faceWidthRatio: bw / W,
    faceAspect: bh / bw,
    skinCoverage: faceN / N,
  };

  return {
    ok: true,
    width: W,
    height: H,
    box,
    rois,
    metrics,
    tone,
    thresholds: { redThr, spotThr, shineLThr, chromaThr, lineThr, poreThr, scale },
    quality: assessQuality(metrics),
    maps: {
      redness: mapRedness,
      shine: mapShine,
      spot: mapSpot,
      pore: mapPore,
      line: mapLine,
      blemish: mapBlemish,
    },
    centers: roiCenters(rois),
  };
}

/* ---------------------------------------------------------------- */
/* 内部工具                                                          */
/* ---------------------------------------------------------------- */

/** 安全取值：NaN / undefined 时返回默认值 */
const nz = (v, d = 0) => (Number.isFinite(v) ? v : d);

function shineSafe(fn, fallback) {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 轻量人脸定位（实时预览引导用）
 * 只做 YCbCr 皮肤掩膜 + 降采样连通域，不做 Lab 转换，比 analyzeFrame 快约一个数量级。
 * @returns {{ok:boolean, box?:object, lum:number, skinRatio:number, fill?:number}}
 */
export function quickFaceBox(imageData) {
  if (!imageData || !imageData.data) return { ok: false, lum: 0, skinRatio: 0 };
  const { data, width: W, height: H } = imageData;
  const N = W * H;
  if (!Number.isFinite(W) || !Number.isFinite(H) || data.length < N * 4 || W < 32 || H < 32) {
    return { ok: false, lum: 0, skinRatio: 0 };
  }
  const skin = new Uint8Array(N);
  let lumSum = 0;
  let skinCount = 0;
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    lumSum += 0.299 * r + 0.587 * g + 0.114 * b;
    if (isSkinPixel(r, g, b)) {
      skin[i] = 1;
      skinCount++;
    }
  }
  const lum = lumSum / N;
  const blob = largestBlob(skin, W, H, 4);
  if (!blob || blob.count < 16) return { ok: false, lum, skinRatio: skinCount / N };
  const box = refineBox(skin, W, H, blob);
  if (!box) return { ok: false, lum, skinRatio: skinCount / N };
  return {
    ok: true,
    box,
    lum,
    skinRatio: skinCount / N,
    fill: blob.count / ((blob.maxX - blob.minX + 1) * (blob.maxY - blob.minY + 1)),
  };
}

/** 降采样 + 连通域，返回最大皮肤块 */
function largestBlob(skin, W, H, ds) {
  const w = Math.ceil(W / ds);
  const h = Math.ceil(H / ds);
  const cell = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = 0;
      let t = 0;
      for (let yy = y * ds; yy < Math.min(H, (y + 1) * ds); yy++) {
        for (let xx = x * ds; xx < Math.min(W, (x + 1) * ds); xx++) {
          t++;
          c += skin[yy * W + xx];
        }
      }
      cell[y * w + x] = t && c / t >= 0.5 ? 1 : 0;
    }
  }

  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  let best = null;

  for (let s = 0; s < w * h; s++) {
    if (!cell[s] || label[s] >= 0) continue;
    let sp = 0;
    stack[sp++] = s;
    label[s] = s;
    let count = 0;
    let minX = w;
    let maxX = -1;
    let minY = h;
    let maxY = -1;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w;
      const py = (p - px) / w;
      count++;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      if (px > 0 && cell[p - 1] && label[p - 1] < 0) {
        label[p - 1] = s;
        stack[sp++] = p - 1;
      }
      if (px < w - 1 && cell[p + 1] && label[p + 1] < 0) {
        label[p + 1] = s;
        stack[sp++] = p + 1;
      }
      if (py > 0 && cell[p - w] && label[p - w] < 0) {
        label[p - w] = s;
        stack[sp++] = p - w;
      }
      if (py < h - 1 && cell[p + w] && label[p + w] < 0) {
        label[p + w] = s;
        stack[sp++] = p + w;
      }
    }
    if (!best || count > best.count) {
      best = { count, minX, maxX, minY, maxY };
    }
  }
  if (!best) return null;
  return {
    ...best,
    x0: best.minX * ds,
    y0: best.minY * ds,
    x1: Math.min(W, (best.maxX + 1) * ds),
    y1: Math.min(H, (best.maxY + 1) * ds),
  };
}

/** 用行/列皮肤覆盖率收紧包围盒（去掉头发、脖子、背景残留） */
function refineBox(skin, W, H, blob) {
  const x0 = clamp(blob.x0, 0, W - 1);
  const x1 = clamp(blob.x1, 1, W);
  const y0 = clamp(blob.y0, 0, H - 1);
  const y1 = clamp(blob.y1, 1, H);
  const w = x1 - x0;

  const rowCov = [];
  for (let y = y0; y < y1; y++) {
    let c = 0;
    for (let x = x0; x < x1; x++) c += skin[y * W + x];
    rowCov.push(c / w);
  }
  const colCov = [];
  for (let x = x0; x < x1; x++) {
    let c = 0;
    for (let y = y0; y < y1; y++) c += skin[y * W + x];
    colCov.push(c / (y1 - y0));
  }

  const trim = (arr, minCov) => {
    let a = 0;
    let b = arr.length - 1;
    while (a < b && arr[a] < minCov) a++;
    while (b > a && arr[b] < minCov) b--;
    return [a, b];
  };

  const [ra, rb] = trim(rowCov, 0.28);
  const [ca, cb] = trim(colCov, 0.28);

  const nx0 = x0 + ca;
  const nx1 = x0 + cb + 1;
  const ny0 = y0 + ra;
  const ny1 = y0 + rb + 1;

  if (nx1 - nx0 < 24 || ny1 - ny0 < 24) return null;
  return { x0: nx0, y0: ny0, x1: nx1, y1: ny1 };
}

/** 肤色分类（ITA°，皮肤科常用的肤色角度指标） */
export function classifyTone(L, b) {
  const ita = (Math.atan((L - 50) / Math.max(1, b)) * 180) / Math.PI;
  let name = '中等';
  if (ita > 55) name = '很浅';
  else if (ita > 41) name = '浅';
  else if (ita > 28) name = '中等偏浅';
  else if (ita > 10) name = '小麦';
  else if (ita > -30) name = '棕色';
  else name = '深色';
  return { ita, name, L, b };
}

/** 采集质量评估 → 硬性阻断项与软性提醒 */
export function assessQuality(m) {
  const blockers = [];
  const warnings = [];

  if (m.sharpness < 0.35) blockers.push({ code: 'blur', text: '画面模糊或晃动明显，请握稳设备并重新对焦' });
  if (nz(m.frameLum, 128) < 42) blockers.push({ code: 'dark', text: '环境太暗，请在正面自然光或白光下重新拍摄' });
  if (m.faceWidthRatio < 0.22) blockers.push({ code: 'far', text: '人脸太小，请靠近摄像头（约占画面 1/3 以上）' });
  if (m.faceFill < 0.42) blockers.push({ code: 'occluded', text: '面部被遮挡或角度偏斜，请正对镜头并露出全脸' });
  if (m.faceAspect > 2.3 || m.faceAspect < 0.75) warnings.push({ code: 'angle', text: '拍摄角度偏斜，可能影响左右对称区域读数' });

  if (m.clipRatio > 0.09) warnings.push({ code: 'over', text: '存在过曝区域（高光溢出），会低估油光程度' });
  if (m.faceL < 38) warnings.push({ code: 'dim', text: '画面整体偏暗，亮度相关指标（光泽度）参考价值下降，建议补光后复测' });
  if (m.lowLightRatio > 0.22) warnings.push({ code: 'dim2', text: '光线偏暗，可能放大纹理类指标的读数' });

  const passed = blockers.length === 0;
  const score = clamp(100 - blockers.length * 34 - warnings.length * 8);
  return { passed, score, blockers, warnings };
}

/** ROI 中心点，用于在报告图上绘制标注 */
function roiCenters(rois) {
  const out = {};
  for (const [k, r] of Object.entries(rois)) {
    out[k] = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  }
  return out;
}

/**
 * 多帧聚合：对每个数值型指标取中位数，抗抖动
 */
export function aggregateFrames(results) {
  const valid = results.filter((r) => r && r.ok);
  if (!valid.length) return null;
  const keys = Object.keys(valid[0].metrics);
  const metrics = {};
  for (const k of keys) {
    const vals = valid.map((r) => r.metrics[k]).filter((v) => Number.isFinite(v));
    metrics[k] = vals.length ? medianArr(vals) : valid[0].metrics[k];
  }
  const base = valid[0];
  return {
    ...base,
    frames: valid.length,
    metrics,
    quality: assessQuality(metrics),
  };
}

function medianArr(vals) {
  const s = [...vals].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 人脸包围盒抖动幅度（多帧一致性检查） */
export function boxJitter(results) {
  const valid = results.filter((r) => r && r.ok);
  if (valid.length < 2) return 0;
  const cx = valid.map((r) => (r.box.x0 + r.box.x1) / 2);
  const cy = valid.map((r) => (r.box.y0 + r.box.y1) / 2);
  const w = valid.map((r) => r.box.x1 - r.box.x0);
  const jx = std(Float64Array.from(cx), null);
  const jy = std(Float64Array.from(cy), null);
  const mw = mean(Float64Array.from(w), null) || 1;
  return Math.hypot(jx, jy) / mw;
}
