/**
 * scoring.js —— 把原始测量值转成可解释的评分、肤质判定与护理建议
 *
 * 设计原则：
 *   - 所有分数都是 0~100 的"相对健康度"，越高越好；
 *   - 分数是启发式的相对指标，用于观察自身长期趋势，不等同于医学诊断；
 *   - 每一项得分都能回溯到可见的测量值（报告里会一并展示）。
 */

import { clamp } from './color.js';

/** 六个评估维度 */
export const DIMENSIONS = [
  { key: 'calmness', label: '舒缓度', icon: 'shield', desc: '泛红、炎症、痘印等刺激信号' },
  { key: 'oilBalance', label: '水油平衡', icon: 'drop', desc: '皮脂分泌与干燥缺水倾向' },
  { key: 'smoothness', label: '细腻度', icon: 'grid', desc: '皮肤纹理、毛孔与粗糙程度' },
  { key: 'evenness', label: '均匀度', icon: 'layers', desc: '色斑、色素沉积与肤色一致度' },
  { key: 'firmness', label: '紧致度', icon: 'arrowUp', desc: '细纹、干纹与纹路深度' },
  { key: 'radiance', label: '光泽度', icon: 'sun', desc: '暗沉、发黄与通透感' },
];

const WEIGHTS = {
  calmness: 0.19,
  oilBalance: 0.17,
  smoothness: 0.19,
  evenness: 0.19,
  firmness: 0.14,
  radiance: 0.12,
};

/** 安全取值：NaN/undefined 用默认值兜底 */
const nz = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** 计算全部维度得分 */
export function scoreAll(m) {
  /* 舒缓度：局部偏红像素占比为主，痘印/丘疹与颧颊红度差为辅 */
  const redPenalty = Math.max(0, nz(m.rednessRatio) - 0.03) * 400;
  const blemishPenalty = Math.max(0, nz(m.blemishRatio) - 0.012) * 300;
  const contrastPenalty = Math.max(0, nz(m.rednessContrast) - 2) * 4.5;
  const calmness = clamp(100 - redPenalty - blemishPenalty - contrastPenalty);

  /* 水油平衡：以"出油过多"为主（这是图像上最可靠的信号）；
     偏干只有在同时伴随粗糙纹理时才计分，避免把哑光误判成问题 */
  const shine = nz(m.shineRatio);
  const excessOil = Math.max(0, shine - 0.035) * 520;
  const drySignal = Math.max(0, (0.012 - shine) / 0.012); // 0~1
  const dryRough = drySignal * Math.max(0, nz(m.textureCheek) - 1.0) * 14;
  const oilBalance = clamp(100 - excessOil - dryRough);

  /* 细腻度：纹理高频能量 + 毛孔密度 */
  const textureScore = clamp(100 - Math.max(0, nz(m.textureCheek) - 0.5) * 24);
  const poreScore = clamp(100 - Math.max(0, nz(m.poreDensity) - 0.02) * 320);
  const smoothness = clamp(textureScore * 0.55 + poreScore * 0.45);

  /* 均匀度：局部暗斑占比、亮度离散度、色彩离散度
     （用剔除高光后的 matte 统计量，避免把出油误判成肤色不均） */
  const spotScore = clamp(100 - Math.max(0, nz(m.spotRatio) - 0.01) * 500);
  const lstdScore = clamp(100 - Math.max(0, nz(m.faceLstdMatte, nz(m.faceLstd)) - 3.5) * 6.5);
  const chromaScore = clamp(100 - Math.max(0, nz(m.chromaStdMatte, nz(m.chromaStd)) - 3) * 9);
  const evenness = clamp(spotScore * 0.5 + lstdScore * 0.3 + chromaScore * 0.2);

  /* 紧致度：额头横纹、鱼尾纹、法令纹的边缘密度 */
  const fLine = clamp(100 - Math.max(0, nz(m.lineDensityForehead) - 0.015) * 220);
  const cLine = clamp(100 - Math.max(0, nz(m.lineDensityCrow) - 0.02) * 170);
  const nLine = clamp(100 - Math.max(0, nz(m.lineDensityNasolabial) - 0.03) * 150);
  const firmness = clamp(fLine * 0.4 + cLine * 0.3 + nLine * 0.3);

  /* 光泽度：暗沉、发黄、粗糙导致的"灰感" */
  const dull = Math.max(0, 60 - nz(m.faceL, 60)) * 1.5;
  const sallow = Math.max(0, nz(m.sallowness, 18) - 20) * 3.2;
  const dullTexture = Math.max(0, nz(m.textureFace) - 1.2) * 10;
  const radiance = clamp(100 - dull - sallow - dullTexture);

  /* 黑眼圈：下眼睑与颧颊的亮度差（独立指标，不进入雷达六维） */
  const dc = nz(m.undereyeDelta, NaN);
  const darkCircle = Number.isFinite(dc) ? clamp(100 - Math.max(0, dc - 3) * 11) : null;

  const dimensions = {
    calmness,
    oilBalance,
    smoothness,
    evenness,
    firmness,
    radiance,
  };

  let overall = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) overall += dimensions[k] * w;
  overall = clamp(overall);

  return {
    dimensions,
    overall,
    grade: gradeOf(overall),
    darkCircle,
    sub: { textureScore, poreScore, spotScore, lstdScore, chromaScore, fLine, cLine, nLine },
  };
}

export function gradeOf(score) {
  if (score >= 85) return { key: 'excellent', label: '优秀', color: '#34d399' };
  if (score >= 70) return { key: 'good', label: '良好', color: '#4ade80' };
  if (score >= 55) return { key: 'fair', label: '一般', color: '#fbbf24' };
  if (score >= 40) return { key: 'poor', label: '待改善', color: '#fb923c' };
  return { key: 'bad', label: '需重点关注', color: '#f87171' };
}

/** 肤质判定 */
export function classifySkinType(m, scores) {
  const tz = nz(m.tzoneShine);
  const ck = nz(m.cheekShine);
  const shine = nz(m.shineRatio);
  const tex = nz(m.textureCheek);
  const red = nz(m.rednessRatio);

  let type = '中性肌肤';
  let detail = '皮脂分泌与水分状态较为均衡。';

  if (tz > 0.09 && ck > 0.06) {
    type = '油性肌肤';
    detail = 'T 区与两颊均出现明显反光，皮脂分泌偏旺盛，毛孔与闭口风险较高。';
  } else if (tz > 0.06 && tz > ck * 1.8) {
    type = '混合偏油';
    detail = 'T 区出油明显而两颊相对清爽，是最常见的肤质类型。';
  } else if (shine < 0.02 && tex > 1.6) {
    type = '干性肌肤';
    detail = '皮肤表面反光弱、纹理偏粗糙，提示皮脂膜较薄、含水量偏低。';
  } else if (ck > 0.03 && tz > 0.04) {
    type = '混合偏干';
    detail = '局部有油光但整体偏干，两颊容易出现紧绷与细纹。';
  } else if (shine < 0.028) {
    type = '中性偏干';
    detail = '油脂分泌偏少，日常需注意保湿屏障维护。';
  }

  const sensitive = red > 0.14 || (scores && scores.dimensions.calmness < 55);
  if (sensitive) {
    type = `敏感倾向 · ${type}`;
    detail += ' 同时检测到较明显的区域性泛红，屏障可能处于不稳定状态。';
  }

  return { type, detail, sensitive };
}

/** 单条测量值的展示信息，用于报告"数据透明度"表格 */
export function detailRows(m, tone, scores) {
  const pct = (v) => `${(nz(v) * 100).toFixed(1)}%`;
  const f1 = (v, u = '') => (Number.isFinite(v) ? `${v.toFixed(1)}${u}` : '—');

  const rows = [
    {
      name: '区域性泛红占比',
      value: pct(m.rednessRatio),
      score: scores.dimensions.calmness,
      hint: '红度显著高于全脸基线的像素比例，反映弥漫性泛红、毛细血管扩张。',
    },
    {
      name: '痘印 / 丘疹密度',
      value: pct(m.blemishRatio),
      score: scores.dimensions.calmness,
      hint: '红度明显高于周围皮肤的局部突起（相对局部基线检测），对应炎性痘痘与红色痘印。',
    },
    {
      name: '颧颊红度偏差 Δa*',
      value: f1(m.rednessContrast),
      score: scores.dimensions.calmness,
      hint: '两颊红绿轴相对全脸中位数的偏移量，正值越大越容易"脸颊发红"。',
    },
    {
      name: '镜面反光占比',
      value: pct(m.shineRatio),
      score: scores.dimensions.oilBalance,
      hint: '亮度显著高于局部基线且几乎无色彩的像素（油脂形成的镜面反射）。',
    },
    {
      name: 'T 区 / 两颊反光比',
      value: `${pct(m.tzoneShine)} / ${pct(m.cheekShine)}`,
      score: scores.dimensions.oilBalance,
      hint: '额头鼻部与两颊的出油差异，是区分油性、混合性与干性的关键。',
    },
    {
      name: '皮肤纹理高频能量',
      value: f1(m.textureCheek),
      score: scores.dimensions.smoothness,
      hint: '按亮度归一化后的表面起伏强度，越高说明越粗糙、角质堆积越明显。',
    },
    {
      name: '毛孔 / 凹凸密度',
      value: pct(m.poreDensity),
      score: scores.dimensions.smoothness,
      hint: '中尺度带通响应超过阈值的像素占比，对应毛孔、黑头与细小凸起。',
    },
    {
      name: '色素暗斑占比',
      value: pct(m.spotRatio),
      score: scores.dimensions.evenness,
      hint: '亮度明显低于【周围皮肤】的区域占比（局部对比检测），对应晒斑、痘印与色素沉积。',
    },
    {
      name: '肤色亮度离散度 σL*',
      value: f1(nz(m.faceLstdMatte, m.faceLstd)),
      score: scores.dimensions.evenness,
      hint: '剔除反光像素后的整脸亮度标准差，越小说明肤色越均匀。',
    },
    {
      name: '额头横纹密度',
      value: pct(m.lineDensityForehead),
      score: scores.dimensions.firmness,
      hint: '额头区域强梯度边缘占比，对应抬头纹与干纹。',
    },
    {
      name: '鱼尾纹密度',
      value: pct(m.lineDensityCrow),
      score: scores.dimensions.firmness,
      hint: '外眼角区域的放射状纹路强度。',
    },
    {
      name: '法令纹密度',
      value: pct(m.lineDensityNasolabial),
      score: scores.dimensions.firmness,
      hint: '鼻翼至嘴角区域的折痕强度，与面部软组织支撑相关。',
    },
    {
      name: '黑眼圈对比度 ΔL*',
      value: f1(m.undereyeDelta),
      score: scores.darkCircle,
      hint: '颧颊与下眼睑的亮度差，越大说明眼周暗沉越明显。',
    },
    {
      name: '肤色色号 ITA°',
      value: `${tone.ita.toFixed(1)}°（${tone.name}）`,
      score: scores.dimensions.radiance,
      hint: '皮肤科常用的肤色角度指标，由 L* 与 b* 计算，用于记录肤色基调。',
    },
    {
      name: '全脸中位亮度 L*',
      value: f1(m.faceL),
      score: scores.dimensions.radiance,
      hint: '受拍摄光照影响较大，仅建议在相同光线下对比自身变化。',
    },
  ];
  return rows;
}

/** 生成个性化护理建议 */
export function buildAdvice(m, scores, skinType, tone) {
  const dims = scores.dimensions;
  const concerns = [];

  const push = (key, severity, title, desc, ingredients, avoid, action) =>
    concerns.push({ key, severity, title, desc, ingredients, avoid, action });

  /* ---- 逐维度诊断，按严重程度排序 ---- */
  if (dims.calmness < 82) {
    const sev = dims.calmness < 55 ? 'high' : dims.calmness < 70 ? 'mid' : 'low';
    push(
      'redness',
      sev,
      '区域性泛红与刺激信号',
      `检测到约 ${(nz(m.rednessRatio) * 100).toFixed(1)}% 的面部像素红度显著高于自身基线${nz(m.blemishRatio) > 0.012 ? `，另有 ${(nz(m.blemishRatio) * 100).toFixed(1)}% 的局部红点（痘印/丘疹）` : ''}，两颊尤为明显。常见于屏障受损、痘印期或毛细血管反应性增强。`,
      [
        ['烟酰胺 2-5%', '抑制炎症因子传递，降低泛红并改善屏障'],
        ['积雪草 / 羟基积雪草苷', '经典舒缓成分，缓解刺激与发热感'],
        ['神经酰胺 + 胆固醇 + 脂肪酸', '按 3:1:1 比例补充屏障脂质'],
        ['壬二酸 10-15%', '对泛红型痘印与玫瑰痤疮样潮红有帮助'],
      ],
      ['高浓度果酸 / 水杨酸叠加', '酒精含量高的爽肤水', '物理磨砂颗粒', '热水洗脸'],
      '暂停一切刺激性活性成分 1-2 周，只保留温和清洁 + 保湿 + 防晒，让屏障先恢复。',
    );
  }

  if (dims.oilBalance < 82) {
    const oily = nz(m.shineRatio) >= 0.045;
    const sev = dims.oilBalance < 55 ? 'high' : dims.oilBalance < 70 ? 'mid' : 'low';
    if (oily) {
      push(
        'oil',
        sev,
        '皮脂分泌偏旺盛',
        `镜面反光区域占面部 ${(nz(m.shineRatio) * 100).toFixed(1)}%，T 区与两颊同时出油，毛孔更容易被撑开并形成闭口。`,
        [
          ['水杨酸 0.5-2%（BHA）', '脂溶性，可深入毛孔溶解角质栓'],
          ['烟酰胺 4-5%', '临床验证可减少皮脂分泌速率'],
          ['锌 PCA / 葡糖酸锌', '抑制 5α-还原酶活性，减少出油'],
          ['烟酰胺或 PCA 钠保湿剂', '控油同时避免"越控越干"的反弹'],
        ],
        ['厚重矿物油 / 椰子油基质面霜', '过度清洁（每天 >3 次）', '含酒精的收敛水长期使用'],
        '早晚温和氨基酸洁面各一次即可；白天用清爽凝胶保湿，午后出油可用吸油纸轻按而非反复洗脸。',
      );
    } else {
      push(
        'dry',
        sev,
        '皮肤偏干、含水量不足',
        `镜面反光仅 ${(nz(m.shineRatio) * 100).toFixed(1)}%，同时纹理能量偏高（${nz(m.textureCheek).toFixed(2)}），提示皮脂膜薄、角质层缺水，容易产生干纹和紧绷感。`,
        [
          ['透明质酸 + 甘油', '多层级补水，需在微湿皮肤上使用'],
          ['神经酰胺 / 角鲨烷', '封闭补脂，减少经皮水分流失'],
          ['泛醇（维生素 B5）', '促进角质层修复，缓解紧绷'],
          ['尿素 5% / 乳酸 5%', '温和软化粗糙角质，改善起皮'],
        ],
        ['皂基洁面', '频繁使用泥膜 / 高浓度酸', '洗脸水温过高'],
        '洁面后 30 秒内完成保湿（"黄金 3 分钟"）；室内干燥时加湿到 50-60% 相对湿度。',
      );
    }
  }

  if (dims.smoothness < 82) {
    const sev = dims.smoothness < 55 ? 'high' : dims.smoothness < 70 ? 'mid' : 'low';
    push(
      'texture',
      sev,
      '纹理粗糙与毛孔可见',
      `毛孔/凹凸密度 ${(nz(m.poreDensity) * 100).toFixed(1)}%，纹理能量 ${nz(m.textureCheek).toFixed(2)}。角质代谢变慢会让毛孔口的角栓更明显，也会让底妆更容易卡粉。`,
      [
        ['水杨酸 2%（BHA）', '清理毛孔口角栓，每周 2-3 次'],
        ['果酸 / 杏仁酸 5-10%（AHA）', '加速老废角质脱落，平滑表面'],
        ['烟酰胺', '长期使用可改善毛孔外观'],
        ['视黄醇 0.1-0.3%（建立耐受）', '促进角质更新与胶原合成'],
      ],
      ['暴力挤压黑头', '同时叠加多种酸类', '撕拉式鼻贴'],
      '酸类晚间使用，白天必须防晒；同一晚只用一种活性成分，避免"叠 buff"。',
    );
  }

  if (dims.evenness < 82) {
    const sev = dims.evenness < 55 ? 'high' : dims.evenness < 70 ? 'mid' : 'low';
    push(
      'pigment',
      sev,
      '色素不均与暗斑',
      `检测到 ${(nz(m.spotRatio) * 100).toFixed(1)}% 的区域明显暗于全脸基线（σL* = ${nz(m.faceLstd).toFixed(1)}）。紫外线累积、炎症后色素沉着（PIH）是主要来源。`,
      [
        ['维生素 C（L-AA 10-20% 或衍生物）', '抗氧化 + 抑制酪氨酸酶，早间使用'],
        ['烟酰胺 5%', '阻断黑色素向角质细胞转移'],
        ['传明酸 / 氨甲环酸', '针对炎症后色素沉着'],
        ['熊果苷 / 377（苯乙基间苯二酚）', '抑制黑色素合成'],
        ['视黄醇', '加速含色素的角质脱落'],
      ],
      ['不防晒就使用美白活性成分', '频繁去角质叠加美白精华'],
      '美白的成败 80% 取决于防晒：每天足量（约 1 元硬币大小）广谱 SPF30+，且每 2 小时补涂。',
    );
  }

  if (dims.firmness < 82) {
    const sev = dims.firmness < 55 ? 'high' : dims.firmness < 70 ? 'mid' : 'low';
    push(
      'lines',
      sev,
      '细纹与纹路加深',
      `额头横纹 ${(nz(m.lineDensityForehead) * 100).toFixed(1)}%、鱼尾纹 ${(nz(m.lineDensityCrow) * 100).toFixed(1)}%、法令纹 ${(nz(m.lineDensityNasolabial) * 100).toFixed(1)}%。纹路既可能来自胶原流失，也可能只是缺水造成的干纹。`,
      [
        ['视黄醇 / 视黄醛（夜间）', '唯一被大量证据支持可改善细纹的非处方成分'],
        ['胜肽（基质金属蛋白酶抑制剂）', '温和替代方案，适合不耐受视黄醇者'],
        ['维生素 C + 维生素 E + 阿魏酸', '日间抗氧化，减少光老化'],
        ['透明质酸 / 神经酰胺', '先排除干纹因素，再评估真性皱纹'],
      ],
      ['用力拉扯眼周皮肤', '在眼周使用高浓度酸类'],
      '视黄醇从每周 2 次、黄豆大小起步建立耐受；夜间使用，次日严格防晒。',
    );
  }

  if (dims.radiance < 82) {
    const sev = dims.radiance < 55 ? 'high' : dims.radiance < 70 ? 'mid' : 'low';
    push(
      'dullness',
      sev,
      '暗沉与肤色发黄',
      `全脸中位亮度 L* = ${nz(m.faceL).toFixed(1)}，黄蓝轴 b* = ${nz(m.sallowness).toFixed(1)}。角质堆积、氧化应激和糖化都会让皮肤失去通透感。`,
      [
        ['维生素 C（早间）', '抗氧化并还原已氧化的黑色素'],
        ['烟酰胺', '改善蜡黄外观与屏障功能'],
        ['温和去角质（PHA / 乳酸）', '提升光线在角质层的透射感'],
        ['抗氧化饮食 + 规律睡眠', '减少糖化终产物累积'],
      ],
      ['熬夜后依赖高浓度酸"急救"', '吸烟与过量饮酒'],
      '光泽度对拍摄光线最敏感，建议固定在窗边自然光下复测，比较趋势而不是绝对值。',
    );
  }

  /* ---- 黑眼圈单独处理（不进雷达维度） ---- */
  if (Number.isFinite(m.undereyeDelta) && nz(m.undereyeDelta) > 6) {
    push(
      'darkCircle',
      nz(m.undereyeDelta) > 11 ? 'high' : 'mid',
      '眼周暗沉（黑眼圈）',
      `下眼睑比颧颊暗 ${nz(m.undereyeDelta).toFixed(1)} 个亮度单位。血管型、色素型与结构型处理方式完全不同。`,
      [
        ['咖啡因眼霜', '改善微循环，对血管型浮肿有效'],
        ['维生素 K / 维生素 C', '针对色素沉着型'],
        ['烟酰胺 + 胜肽', '综合改善眼周质地'],
        ['充足睡眠与抬高枕头', '减少静脉回流不畅导致的青紫色'],
      ],
      ['用力揉搓眼睛', '在眼周使用高浓度视黄醇'],
      '先判断类型：轻拉下眼睑若颜色变淡偏血管型，颜色不变偏色素型，仰头仍明显则偏结构型（需医美手段）。',
    );
  }

  /* ---- 排序：严重度优先 ---- */
  const order = { high: 0, mid: 1, low: 2 };
  concerns.sort((a, b) => order[a.severity] - order[b.severity]);

  /* ---- 日常流程 ---- */
  const oily = nz(m.shineRatio) >= 0.045;
  const dry = nz(m.shineRatio) < 0.02;
  const sensitive = skinType.sensitive;

  const routine = {
    am: [
      { step: '清洁', text: sensitive ? '温水或氨基酸洁面（可只用清水）' : oily ? '氨基酸洁面，重点清洁 T 区' : '氨基酸洁面，水温 30-34℃' },
      { step: '调理', text: sensitive ? '舒缓型化妆水，含积雪草/泛醇' : oily ? '含烟酰胺或锌的清爽型化妆水' : '高保湿化妆水，轻拍 2 层' },
      { step: '精华', text: '维生素 C 类抗氧化精华（早间抗氧化核心）' },
      { step: '保湿', text: oily ? '清爽凝胶或乳液' : dry ? '含神经酰胺的保湿霜' : '乳液，两颊可叠加面霜' },
      { step: '防晒', text: '广谱 SPF30-50、PA+++ 以上，室内靠窗或外出时足量使用' },
    ],
    pm: [
      { step: '卸妆/清洁', text: sensitive ? '仅氨基酸洁面，避免二次清洁' : '有防晒或彩妆时先卸妆，再温和洁面' },
      { step: '活性成分', text: concerns.some((c) => c.key === 'lines') ? '视黄醇（每周 2 次起步，避开眼周与鼻翼）' : oily ? '水杨酸（每周 2-3 次）' : '温和果酸或 PHA（每周 1-2 次）' },
      { step: '修护精华', text: sensitive ? '积雪草 + 神经酰胺精华' : '烟酰胺或胜肽精华' },
      { step: '保湿', text: '封闭性更强的面霜，锁住水分' },
      { step: '眼周', text: concerns.some((c) => c.key === 'darkCircle') ? '咖啡因眼霜，无名指轻点' : '保湿眼霜' },
    ],
    weekly: [
      '酸类去角质 1-3 次，按耐受度递增，同一晚不叠加其他活性成分',
      dry ? '补水面膜 2 次，敷 10-15 分钟后洗掉再保湿' : '清洁泥膜仅用于 T 区，每周 1 次，不超过 10 分钟',
      '更换枕套（每周）、清洁手机屏幕与化妆刷，减少机械刺激与细菌',
      '固定时间、固定光线复测一次，追踪分数趋势而非纠结单次数值',
    ],
  };

  /* ---- 何时该看皮肤科医生 ---- */
  const seeDoctor = [];
  if (nz(m.rednessRatio) > 0.2) seeDoctor.push('泛红面积较大且持续存在，可能是玫瑰痤疮、脂溢性皮炎或接触性皮炎，需要医生鉴别。');
  if (nz(m.spotRatio) > 0.12) seeDoctor.push('色素性病灶较多，建议由皮肤科医生用皮肤镜排查，排除非良性色素改变。');
  if (dims.calmness < 45) seeDoctor.push('刺激信号明显，若伴随瘙痒、脱屑、灼热或渗出，请停止自行处理并尽快就诊。');
  if (nz(m.blemishRatio) > 0.15) seeDoctor.push('炎性皮损面积较大，中重度痤疮建议由医生评估是否需要外用或口服处方药，避免自行挤压留下瘢痕。');
  seeDoctor.push('正在使用处方药（如维A酸类、抗生素），或处于孕期 / 哺乳期时，任何护肤成分调整前请先咨询医生。');
  seeDoctor.push('任何快速增大、形状不对称、颜色不均或出血的皮损，请立即就医，不要依赖本报告。');

  return { concerns, routine, seeDoctor, oily, dry, sensitive };
}

/** 生活作息通用建议 */
export function lifestyleTips() {
  return [
    { icon: 'moon', title: '睡眠', text: '保证 7-8 小时。睡眠不足会升高皮质醇，直接加剧出油、炎症与黑眼圈。' },
    { icon: 'sun', title: '光防护', text: '紫外线贡献了约 80% 的外源性皮肤老化。阴天、室内靠窗同样需要防晒。' },
    { icon: 'water', title: '饮水与饮食', text: '高糖与高乳制品摄入与痤疮相关；可增加 Omega-3、蔬果与全谷物。' },
    { icon: 'hand', title: '减少机械刺激', text: '不要用手摸脸、抠痘或频繁更换护肤品，皮肤需要 4-8 周才能反映真实改善。' },
  ];
}
