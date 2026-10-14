/**
 * color.js —— 色彩空间转换与基础统计
 * 无任何 DOM 依赖，可在浏览器与 Node 中同时运行。
 *
 * 说明：皮肤分析全部在 CIE-Lab 空间进行，因为 Lab 的
 *   L*（亮度）与 a*（红-绿）/ b*（黄-蓝）在感知上近似均匀，
 *   比直接比较 RGB 更能抵抗光照强度变化。
 */

/** 数值夹取 */
export function clamp(v, lo = 0, hi = 100) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** sRGB 通道 (0-255) -> 线性光 (0-1)，用 256 项查表加速 */
const LINEAR_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR_LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const D65_X = 0.95047;
const D65_Y = 1.0;
const D65_Z = 1.08883;

/** L 的立方根辅助函数 */
function fLab(t) {
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
}

/**
 * sRGB -> CIE-Lab (D65)
 * @returns {[number, number, number]} [L*, a*, b*]  L* 取 0~100，a* 与 b* 约 -128~127
 */
export function rgbToLab(r, g, b) {
  const R = LINEAR_LUT[r & 255];
  const G = LINEAR_LUT[g & 255];
  const B = LINEAR_LUT[b & 255];

  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / D65_X;
  const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.072175) / D65_Y;
  const Z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / D65_Z;

  const fx = fLab(X);
  const fy = fLab(Y);
  const fz = fLab(Z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Lab -> sRGB 近似反变换（用于生成调色板/热力图配色） */
export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const inv = (f) => {
    const t = f * f * f;
    return t > 216 / 24389 ? t : (116 * f - 16) / (24389 / 27);
  };

  const X = inv(fx) * D65_X;
  const Y = inv(fy) * D65_Y;
  const Z = inv(fz) * D65_Z;

  let R = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314;
  let G = X * -0.969266 + Y * 1.8760108 + Z * 0.041556;
  let B = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252;

  const gam = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return clamp(v * 255, 0, 255);
  };
  return [gam(R), gam(G), gam(B)];
}

/** 用 8bit 通道值判断是否属于皮肤像素（对深浅肤色均适用，不依赖绝对亮度） */
export function isSkinPixel(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx < 24) return false; // 纯黑区域
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  if (sat < 0.08 || sat > 0.78) return false; // 灰白/纯色不算皮肤

  // YCbCr 色度判据：只与色度有关，因此不受肤色明暗影响
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (cb < 72 || cb > 134) return false;
  if (cr < 130 || cr > 184) return false;
  if (cr - cb < 4) return false;

  // 暖色通道序（允许蓝光环境轻微反转）
  if (!(r >= g && g + 2 >= b)) return false;

  // HSV 色相落在橙-红范围
  let hue = 0;
  const d = mx - mn || 1;
  if (mx === r) hue = ((g - b) / d) % 6;
  else if (mx === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  if (hue > 52 && hue < 330) return false;

  return true;
}

/* ------------------------- 统计工具 ------------------------- */

/** 均值 */
export function mean(arr, filter = null) {
  let s = 0;
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (filter && !filter(i)) continue;
    s += arr[i];
    n++;
  }
  return n ? s / n : 0;
}

/** 中位数（对高光/阴影离群值更稳健） */
export function median(arr, filter = null) {
  const buf = [];
  for (let i = 0; i < arr.length; i++) {
    if (filter && !filter(i)) continue;
    buf.push(arr[i]);
  }
  if (!buf.length) return 0;
  buf.sort((x, y) => x - y);
  const m = buf.length >> 1;
  return buf.length % 2 ? buf[m] : (buf[m - 1] + buf[m]) / 2;
}

/** 标准差 */
export function std(arr, filter = null, m = null) {
  const mu = m === null ? mean(arr, filter) : m;
  let s = 0;
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (filter && !filter(i)) continue;
    const d = arr[i] - mu;
    s += d * d;
    n++;
  }
  return n ? Math.sqrt(s / n) : 0;
}

/** 百分位数 p ∈ [0,1] */
export function percentile(arr, p, filter = null) {
  const buf = [];
  for (let i = 0; i < arr.length; i++) {
    if (filter && !filter(i)) continue;
    buf.push(arr[i]);
  }
  if (!buf.length) return 0;
  buf.sort((x, y) => x - y);
  const idx = clamp(Math.round((buf.length - 1) * p), 0, buf.length - 1);
  return buf[idx];
}

/**
 * 可分离盒式模糊（用于带通/DoG 与局部基线估计）
 * @param {Float32Array} src 输入
 * @param {number} w
 * @param {number} h
 * @param {number} r 半径（像素）
 */
export function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const win = r * 2 + 1;

  // 水平
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win;
      acc -= src[row + clamp(x - r, 0, w - 1)];
      acc += src[row + clamp(x + r + 1, 0, w - 1)];
    }
  }
  // 垂直
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / win;
      acc -= tmp[clamp(y - r, 0, h - 1) * w + x];
      acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x];
    }
  }
  return out;
}

/** 3x3 形态学腐蚀（去除皮肤掩膜中的孤立噪点） */
export function erode(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] =
        mask[i] &&
        mask[i - 1] &&
        mask[i + 1] &&
        mask[i - w] &&
        mask[i + w] &&
        mask[i - w - 1] &&
        mask[i - w + 1] &&
        mask[i + w - 1] &&
        mask[i + w + 1]
          ? 1
          : 0;
    }
  }
  return out;
}

/** 3x3 形态学膨胀 */
export function dilate(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] =
        mask[i] ||
        mask[i - 1] ||
        mask[i + 1] ||
        mask[i - w] ||
        mask[i + w] ||
        mask[i - w - 1] ||
        mask[i - w + 1] ||
        mask[i + w - 1] ||
        mask[i + w + 1]
          ? 1
          : 0;
    }
  }
  return out;
}
