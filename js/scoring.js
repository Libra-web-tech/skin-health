/**
 * scoring.js —— 把原始测量值转成可解释的评分、肤质判定与护理建议
 *
 * 设计原则：
 *   - 所有分数都是 0~100 的"相对健康度"，越高越好；
 *   - 分数是启发式的相对指标，用于观察自身长期趋势，不等同于医学诊断；
 *   - 每一项得分都能回溯到可见的测量值（报告里会一并展示）。
 *   - 文案支持中英文：所有文本函数都接受 lang 参数（'zh' | 'en'），默认中文。
 *     评分数值逻辑与历史版本完全一致，改动只涉及文案层。
 */

import { clamp } from './color.js';

/* ------------------------- 文案词典（中/英） ------------------------- */
const TXT = {
  zh: {
    gradeExcellent: '优秀',
    gradeGood: '良好',
    gradeFair: '一般',
    gradePoor: '待改善',
    gradeBad: '需重点关注',

    skinNormal: '中性肌肤',
    skinOily: '油性肌肤',
    skinCombOily: '混合偏油',
    skinDry: '干性肌肤',
    skinCombDry: '混合偏干',
    skinNormalDry: '中性偏干',
    skinNormalDetail: '皮脂分泌与水分状态较为均衡。',
    skinOilyDetail: 'T 区与两颊均出现明显反光，皮脂分泌偏旺盛，毛孔与闭口风险较高。',
    skinCombOilyDetail: 'T 区出油明显而两颊相对清爽，是最常见的肤质类型。',
    skinDryDetail: '皮肤表面反光弱、纹理偏粗糙，提示皮脂膜较薄、含水量偏低。',
    skinCombDryDetail: '局部有油光但整体偏干，两颊容易出现紧绷与细纹。',
    skinNormalDryDetail: '油脂分泌偏少，日常需注意保湿屏障维护。',
    skinSensitiveSuffix: '敏感倾向 · ',
    skinSensitiveDetail: ' 同时检测到较明显的区域性泛红，屏障可能处于不稳定状态。',

    cRedness: '区域性泛红与刺激信号',
    cOil: '皮脂分泌偏旺盛',
    cDry: '皮肤偏干、含水量不足',
    cTexture: '纹理粗糙与毛孔可见',
    cPigment: '色素不均与暗斑',
    cLines: '细纹与纹路加深',
    cDullness: '暗沉与肤色发黄',
    cDarkCircle: '眼周暗沉（黑眼圈）',

    dRedness:
      '检测到约 {red}% 的面部像素红度显著高于自身基线{blem}，两颊尤为明显。常见于屏障受损、痘印期或毛细血管反应性增强。',
    dBlemishPart: '，另有 {blem}% 的局部红点（痘印/丘疹）',
    dOil: '镜面反光区域占面部 {shine}%，T 区与两颊同时出油，毛孔更容易被撑开并形成闭口。',
    dDry: '镜面反光仅 {shine}%，同时纹理能量偏高（{tex}），提示皮脂膜薄、角质层缺水，容易产生干纹和紧绷感。',
    dTexture: '毛孔/凹凸密度 {pore}%，纹理能量 {tex}。角质代谢变慢会让毛孔口的角栓更明显，也会让底妆更容易卡粉。',
    dPigment: '检测到 {spot}% 的区域明显暗于周围皮肤（σL* = {lstd}）。紫外线累积、炎症后色素沉着（PIH）是主要来源。',
    dLines: '额头横纹 {f}%、鱼尾纹 {c}%、法令纹 {n}%。纹路既可能来自胶原流失，也可能只是缺水造成的干纹。',
    dDullness: '全脸中位亮度 L* = {l}，黄蓝轴 b* = {b}。角质堆积、氧化应激和糖化都会让皮肤失去通透感。',
    dDarkCircle: '下眼睑比颧颊暗 {d} 个亮度单位。血管型、色素型与结构型处理方式完全不同。',

    aRedness: '暂停一切刺激性活性成分 1-2 周，只保留温和清洁 + 保湿 + 防晒，让屏障先恢复。',
    aOil: '早晚温和氨基酸洁面各一次即可；白天用清爽凝胶保湿，午后出油可用吸油纸轻按而非反复洗脸。',
    aDry: '洁面后 30 秒内完成保湿（"黄金 3 分钟"）；室内干燥时加湿到 50-60% 相对湿度。',
    aTexture: '酸类晚间使用，白天必须防晒；同一晚只用一种活性成分，避免"叠 buff"。',
    aPigment: '美白的成败 80% 取决于防晒：每天足量（约 1 元硬币大小）广谱 SPF30+，且每 2 小时补涂。',
    aLines: '视黄醇从每周 2 次、黄豆大小起步建立耐受；夜间使用，次日严格防晒。',
    aDullness: '光泽度对拍摄光线最敏感，建议固定在窗边自然光下复测，比较趋势而不是绝对值。',
    aDarkCircle: '先判断类型：轻拉下眼睑若颜色变淡偏血管型，颜色不变偏色素型，仰头仍明显则偏结构型（需医美手段）。',

    rAmCleanseSensitive: '温水或氨基酸洁面（可只用清水）',
    rAmCleanseOily: '氨基酸洁面，重点清洁 T 区',
    rAmCleanseNormal: '氨基酸洁面，水温 30-34℃',
    rAmTonerSensitive: '舒缓型化妆水，含积雪草/泛醇',
    rAmTonerOily: '含烟酰胺或锌的清爽型化妆水',
    rAmTonerNormal: '高保湿化妆水，轻拍 2 层',
    rAmSerum: '维生素 C 类抗氧化精华（早间抗氧化核心）',
    rAmMoistOily: '清爽凝胶或乳液',
    rAmMoistDry: '含神经酰胺的保湿霜',
    rAmMoistNormal: '乳液，两颊可叠加面霜',
    rAmSunscreen: '广谱 SPF30-50、PA+++ 以上，室内靠窗或外出时足量使用',
    rPmCleanseSensitive: '仅氨基酸洁面，避免二次清洁',
    rPmCleanseNormal: '有防晒或彩妆时先卸妆，再温和洁面',
    rPmActiveRetinol: '视黄醇（每周 2 次起步，避开眼周与鼻翼）',
    rPmActiveOily: '水杨酸（每周 2-3 次）',
    rPmActiveNormal: '温和果酸或 PHA（每周 1-2 次）',
    rPmSerumSensitive: '积雪草 + 神经酰胺精华',
    rPmSerumNormal: '烟酰胺或胜肽精华',
    rPmMoist: '封闭性更强的面霜，锁住水分',
    rPmEyeDC: '咖啡因眼霜，无名指轻点',
    rPmEyeNormal: '保湿眼霜',
    rWeekly1: '酸类去角质 1-3 次，按耐受度递增，同一晚不叠加其他活性成分',
    rWeekly2Dry: '补水面膜 2 次，敷 10-15 分钟后洗掉再保湿',
    rWeekly2Normal: '清洁泥膜仅用于 T 区，每周 1 次，不超过 10 分钟',
    rWeekly3: '更换枕套（每周）、清洁手机屏幕与化妆刷，减少机械刺激与细菌',
    rWeekly4: '固定时间、固定光线复测一次，追踪分数趋势而非纠结单次数值',
    rStepCleanse: '清洁',
    rStepToner: '调理',
    rStepSerum: '精华',
    rStepMoist: '保湿',
    rStepSunscreen: '防晒',
    rStepRemove: '卸妆/清洁',
    rStepActive: '活性成分',
    rStepRepair: '修护精华',
    rStepEye: '眼周',

    mRedness: '泛红面积较大且持续存在，可能是玫瑰痤疮、脂溢性皮炎或接触性皮炎，需要医生鉴别。',
    mSpot: '色素性病灶较多，建议由皮肤科医生用皮肤镜排查，排除非良性色素改变。',
    mCalm: '刺激信号明显，若伴随瘙痒、脱屑、灼热或渗出，请停止自行处理并尽快就诊。',
    mBlemish: '炎性皮损面积较大，中重度痤疮建议由医生评估是否需要外用或口服处方药，避免自行挤压留下瘢痕。',
    mMeds: '正在使用处方药（如维A酸类、抗生素），或处于孕期 / 哺乳期时，任何护肤成分调整前请先咨询医生。',
    mMoles: '任何快速增大、形状不对称、颜色不均或出血的皮损，请立即就医，不要依赖本报告。',

    lSleepTitle: '睡眠',
    lSleepText: '保证 7-8 小时。睡眠不足会升高皮质醇，直接加剧出油、炎症与黑眼圈。',
    lSunTitle: '光防护',
    lSunText: '紫外线贡献了约 80% 的外源性皮肤老化。阴天、室内靠窗同样需要防晒。',
    lDietTitle: '饮水与饮食',
    lDietText: '高糖与高乳制品摄入与痤疮相关；可增加 Omega-3、蔬果与全谷物。',
    lTouchTitle: '减少机械刺激',
    lTouchText: '不要用手摸脸、抠痘或频繁更换护肤品，皮肤需要 4-8 周才能反映真实改善。',

    rowRedness: '区域性泛红占比',
    rowRednessHint: '红度显著高于全脸基线的像素比例，反映弥漫性泛红、毛细血管扩张。',
    rowBlemish: '痘印 / 丘疹密度',
    rowBlemishHint: '红度明显高于周围皮肤的局部突起（相对局部基线检测），对应炎性痘痘与红色痘印。',
    rowCheekA: '颧颊红度偏差 Δa*',
    rowCheekAHint: '两颊红绿轴相对全脸中位数的偏移量，正值越大越容易"脸颊发红"。',
    rowShine: '镜面反光占比',
    rowShineHint: '亮度显著高于局部基线且几乎无色彩的像素（油脂形成的镜面反射）。',
    rowTzone: 'T 区 / 两颊反光比',
    rowTzoneHint: '额头鼻部与两颊的出油差异，是区分油性、混合性与干性的关键。',
    rowTexture: '皮肤纹理高频能量',
    rowTextureHint: '按亮度归一化后的表面起伏强度，越高说明越粗糙、角质堆积越明显。',
    rowPore: '毛孔 / 凹凸密度',
    rowPoreHint: '中尺度带通响应超过阈值的像素占比，对应毛孔、黑头与细小凸起。',
    rowSpot: '色素暗斑占比',
    rowSpotHint: '亮度明显低于周围皮肤的区域占比（局部对比检测），对应晒斑、痘印与色素沉积。',
    rowLstd: '肤色亮度离散度 σL*',
    rowLstdHint: '剔除反光像素后的整脸亮度标准差，越小说明肤色越均匀。',
    rowForehead: '额头横纹密度',
    rowForeheadHint: '额头区域强梯度边缘占比，对应抬头纹与干纹。',
    rowCrow: '鱼尾纹密度',
    rowCrowHint: '外眼角区域的放射状纹路强度。',
    rowNasolabial: '法令纹密度',
    rowNasolabialHint: '鼻翼至嘴角区域的折痕强度，与面部软组织支撑相关。',
    rowDark: '黑眼圈对比度 ΔL*',
    rowDarkHint: '颧颊与下眼睑的亮度差，越大说明眼周暗沉越明显。',
    rowTone: '肤色色号 ITA°',
    rowToneHint: '皮肤科常用的肤色角度指标，由 L* 与 b* 计算，用于记录肤色基调。',
    rowFaceL: '全脸中位亮度 L*',
    rowFaceLHint: '受拍摄光照影响较大，仅建议在相同光线下对比自身变化。',

    ingNiacinamide: ['烟酰胺 2-5%', '抑制炎症因子传递，降低泛红并改善屏障'],
    ingCentella: ['积雪草 / 羟基积雪草苷', '经典舒缓成分，缓解刺激与发热感'],
    ingCeramides: ['神经酰胺 + 胆固醇 + 脂肪酸', '按 3:1:1 比例补充屏障脂质'],
    ingAzelaic: ['壬二酸 10-15%', '对泛红型痘印与玫瑰痤疮样潮红有帮助'],
    ingBHA: ['水杨酸 0.5-2%（BHA）', '脂溶性，可深入毛孔溶解角质栓'],
    ingNiaOil: ['烟酰胺 4-5%', '临床验证可减少皮脂分泌速率'],
    ingZinc: ['锌 PCA / 葡糖酸锌', '抑制 5α-还原酶活性，减少出油'],
    ingLightMoist: ['烟酰胺或 PCA 钠保湿剂', '控油同时避免"越控越干"的反弹'],
    ingHyaluronic: ['透明质酸 + 甘油', '多层级补水，需在微湿皮肤上使用'],
    ingSqualane: ['神经酰胺 / 角鲨烷', '封闭补脂，减少经皮水分流失'],
    ingPanthenol: ['泛醇（维生素 B5）', '促进角质层修复，缓解紧绷'],
    ingUrea: ['尿素 5% / 乳酸 5%', '温和软化粗糙角质，改善起皮'],
    ingAHA: ['果酸 / 杏仁酸 5-10%（AHA）', '加速老废角质脱落，平滑表面'],
    ingNiaPore: ['烟酰胺', '长期使用可改善毛孔外观'],
    ingRetinol: ['视黄醇 0.1-0.3%（建立耐受）', '促进角质更新与胶原合成'],
    ingVitC: ['维生素 C（L-AA 10-20% 或衍生物）', '抗氧化 + 抑制酪氨酸酶，早间使用'],
    ingNiaPIH: ['烟酰胺 5%', '阻断黑色素向角质细胞转移'],
    ingTranexamic: ['传明酸 / 氨甲环酸', '针对炎症后色素沉着'],
    ingArbutin: ['熊果苷 / 377（苯乙基间苯二酚）', '抑制黑色素合成'],
    ingRetinolPIH: ['视黄醇', '加速含色素的角质脱落'],
    ingPeptide: ['胜肽（基质金属蛋白酶抑制剂）', '温和替代方案，适合不耐受视黄醇者'],
    ingCef: ['维生素 C + 维生素 E + 阿魏酸', '日间抗氧化，减少光老化'],
    ingPHA: ['温和去角质（PHA / 乳酸）', '提升光线在角质层的透射感'],
    ingCaffeine: ['咖啡因眼霜', '改善微循环，对血管型浮肿有效'],
    ingVitK: ['维生素 K / 维生素 C', '针对色素沉着型'],
    ingNiaPeptide: ['烟酰胺 + 胜肽', '综合改善眼周质地'],
    ingSleep: ['充足睡眠与抬高枕头', '减少静脉回流不畅导致的青紫色'],

    avoidStackAcids: '高浓度果酸 / 水杨酸叠加',
    avoidAlcoholToner: '酒精含量高的爽肤水',
    avoidScrub: '物理磨砂颗粒',
    avoidHotWater: '热水洗脸',
    avoidHeavyOil: '厚重矿物油 / 椰子油基质面霜',
    avoidOverCleanse: '过度清洁（每天 >3 次）',
    avoidAstringent: '含酒精的收敛水长期使用',
    avoidSoap: '皂基洁面',
    avoidClay: '频繁使用泥膜 / 高浓度酸',
    avoidTooHot: '洗脸水温过高',
    avoidSqueeze: '暴力挤压黑头',
    avoidAcidStack: '同时叠加多种酸类',
    avoidNoseStrips: '撕拉式鼻贴',
    avoidBrightNoSPF: '不防晒就使用美白活性成分',
    avoidOverExfoliate: '频繁去角质叠加美白精华',
    avoidTug: '用力拉扯眼周皮肤',
    avoidEyeAcids: '在眼周使用高浓度酸类',
    avoidRescueAcid: '熬夜后依赖高浓度酸"急救"',
    avoidSmoke: '吸烟与过量饮酒',
    avoidRubEyes: '用力揉搓眼睛',
    avoidEyeRetinol: '在眼周使用高浓度视黄醇',
  },

  en: {
    gradeExcellent: 'Excellent',
    gradeGood: 'Good',
    gradeFair: 'Fair',
    gradePoor: 'Needs work',
    gradeBad: 'Needs attention',

    skinNormal: 'Normal skin',
    skinOily: 'Oily skin',
    skinCombOily: 'Combination-oily',
    skinDry: 'Dry skin',
    skinCombDry: 'Combination-dry',
    skinNormalDry: 'Normal-dry',
    skinNormalDetail: 'Sebum and moisture levels are fairly balanced.',
    skinOilyDetail: 'Both the T-zone and cheeks show clear shine; sebum runs high and pores/closed comedones are likelier.',
    skinCombOilyDetail: 'Oily T-zone with relatively clear cheeks — the most common skin type.',
    skinDryDetail: 'Weak surface reflection and rough texture suggest a thin lipid film and low water content.',
    skinCombDryDetail: 'Some shine but overall dry; cheeks are prone to tightness and fine lines.',
    skinNormalDryDetail: 'Low oil output; keep the moisture barrier well maintained.',
    skinSensitiveSuffix: 'Sensitive-prone · ',
    skinSensitiveDetail: ' Noticeable localized redness was also detected — the barrier may be unstable.',

    cRedness: 'Redness & Irritation Signals',
    cOil: 'Excess Sebum Production',
    cDry: 'Dry & Under-hydrated Skin',
    cTexture: 'Rough Texture & Visible Pores',
    cPigment: 'Uneven Pigmentation & Dark Spots',
    cLines: 'Deepening Fine Lines',
    cDullness: 'Dull, Sallow Complexion',
    cDarkCircle: 'Under-eye Darkness (Dark Circles)',

    dRedness:
      'About {red}% of facial pixels are clearly redder than your own baseline{blem}, most noticeable on the cheeks. Often caused by a damaged barrier, post-acne marks or reactive capillaries.',
    dBlemishPart: ', with another {blem}% of localized red spots (marks / papules)',
    dOil: 'Specular shine covers {shine}% of the face, with both the T-zone and cheeks oily — pores dilate and closed comedones form more easily.',
    dDry: 'Specular reflection is only {shine}% while texture energy is elevated ({tex}), suggesting a thin lipid film and a dehydrated stratum corneum — prone to fine lines and tightness.',
    dTexture: 'Pore / unevenness density {pore}%, texture energy {tex}. Slower cell turnover makes pore plugs more visible and makeup cakey.',
    dPigment: '{spot}% of the scanned area is clearly darker than surrounding skin (σL* = {lstd}). UV accumulation and post-inflammatory hyperpigmentation (PIH) are the main sources.',
    dLines: 'Forehead lines {f}%, crow’s feet {c}%, nasolabial folds {n}%. Lines may come from collagen loss or just dehydration.',
    dDullness: 'Median facial lightness L* = {l}, yellow-blue axis b* = {b}. Dead-cell buildup, oxidative stress and glycation all dull the skin.',
    dDarkCircle: 'The lower eyelid is {d} lightness units darker than the cheek. Vascular, pigmented and structural types need different approaches.',

    aRedness: 'Pause all irritating actives for 1–2 weeks; keep only gentle cleansing, moisturizer and sunscreen so the barrier can recover.',
    aOil: 'A gentle cleanser morning and night is enough; use a light gel moisturizer by day and blot with paper instead of washing repeatedly.',
    aDry: 'Moisturize within 30 seconds of cleansing; keep indoor humidity at 50–60% when the air is dry.',
    aTexture: 'Use acids at night only and always wear sunscreen by day; stick to one active per night — no "buff stacking".',
    aPigment: 'Sunscreen decides 80% of brightening: apply a generous, coin-sized layer of broad-spectrum SPF30+ daily and reapply every 2 hours.',
    aLines: 'Start retinol twice a week (pea-sized) and build tolerance; use at night and wear sunscreen the next day.',
    aDullness: 'Radiance is highly sensitive to lighting — re-test in the same window light and compare trends, not absolute values.',
    aDarkCircle: 'Identify the type first: fading when stretched = vascular; unchanged = pigmented; still visible with your head tilted back = structural (needs in-office treatment).',

    rAmCleanseSensitive: 'Lukewarm water or a gentle amino-acid cleanser (water alone is fine)',
    rAmCleanseOily: 'Gentle cleanser, focusing on the T-zone',
    rAmCleanseNormal: 'Gentle cleanser with 30–34℃ water',
    rAmTonerSensitive: 'Soothing toner with centella / panthenol',
    rAmTonerOily: 'Light toner with niacinamide or zinc',
    rAmTonerNormal: 'Hydrating toner, two thin layers',
    rAmSerum: 'Vitamin C antioxidant serum (morning antioxidant core)',
    rAmMoistOily: 'Light gel or emulsion',
    rAmMoistDry: 'Ceramide-rich moisturizer',
    rAmMoistNormal: 'Emulsion; add cream on the cheeks if needed',
    rAmSunscreen: 'Broad-spectrum SPF30–50, PA+++ or higher, applied generously when near windows or outdoors',
    rPmCleanseSensitive: 'Gentle cleanser only; skip double cleansing',
    rPmCleanseNormal: 'Remove sunscreen / makeup first, then cleanse gently',
    rPmActiveRetinol: 'Retinol (start twice a week, avoid the eye area and nose wings)',
    rPmActiveOily: 'Salicylic acid (2–3×/week)',
    rPmActiveNormal: 'Gentle AHA or PHA (1–2×/week)',
    rPmSerumSensitive: 'Centella + ceramide serum',
    rPmSerumNormal: 'Niacinamide or peptide serum',
    rPmMoist: 'A more occlusive cream to lock in moisture',
    rPmEyeDC: 'Caffeine eye cream, tapped on with the ring finger',
    rPmEyeNormal: 'Hydrating eye cream',
    rWeekly1: 'Chemical exfoliation 1–3×/week, increasing with tolerance; no other actives the same night',
    rWeekly2Dry: 'Hydrating mask 2×/week, 10–15 minutes, rinse then moisturize',
    rWeekly2Normal: 'Clay mask on the T-zone only, 1×/week, max 10 minutes',
    rWeekly3: 'Change pillowcases weekly; clean your phone screen and makeup brushes to reduce bacteria and friction',
    rWeekly4: 'Re-scan at the same time with the same lighting; follow score trends, not single values',
    rStepCleanse: 'Cleanse',
    rStepToner: 'Tone',
    rStepSerum: 'Serum',
    rStepMoist: 'Moisturize',
    rStepSunscreen: 'Sunscreen',
    rStepRemove: 'Remove / cleanse',
    rStepActive: 'Actives',
    rStepRepair: 'Repair serum',
    rStepEye: 'Eyes',

    mRedness: 'Large, persistent redness may be rosacea, seborrheic dermatitis or contact dermatitis — a doctor should differentiate.',
    mSpot: 'Multiple pigmented lesions should be checked by a dermatologist with dermoscopy to rule out non-benign changes.',
    mCalm: 'Strong irritation signals with itching, flaking, burning or oozing — stop self-treatment and see a doctor soon.',
    mBlemish: 'Large inflammatory areas; moderate-to-severe acne should be assessed by a doctor for topical or oral prescription treatment. Avoid squeezing.',
    mMeds: 'On prescription medication (retinoids, antibiotics) or pregnant / nursing? Consult a doctor before changing any skincare ingredient.',
    mMoles: 'Any lesion that grows fast, is asymmetric, unevenly colored or bleeding — see a doctor immediately; do not rely on this report.',

    lSleepTitle: 'Sleep',
    lSleepText: 'Get 7–8 hours. Sleep deprivation raises cortisol, directly worsening oil, inflammation and dark circles.',
    lSunTitle: 'Photoprotection',
    lSunText: 'UV accounts for ~80% of extrinsic skin aging. Sunscreen matters on cloudy days and near windows too.',
    lDietTitle: 'Hydration & diet',
    lDietText: 'High sugar and dairy intake correlate with acne; add Omega-3s, vegetables and whole grains.',
    lTouchTitle: 'Less mechanical stress',
    lTouchText: 'Do not touch your face, pick at spots, or switch products constantly — skin needs 4–8 weeks to show real change.',

    rowRedness: 'Regional redness area',
    rowRednessHint: 'Share of pixels clearly redder than your whole-face baseline — diffuse redness, visible capillaries.',
    rowBlemish: 'Blemish / papule density',
    rowBlemishHint: 'Localized bumps redder than surrounding skin (detected against a local baseline) — inflamed pimples and red marks.',
    rowCheekA: 'Cheek redness offset Δa*',
    rowCheekAHint: 'How much redder the cheeks are than the face median; the higher the value, the easier cheeks flush.',
    rowShine: 'Specular shine area',
    rowShineHint: 'Pixels much brighter than the local baseline with almost no color — specular reflection from sebum.',
    rowTzone: 'T-zone / cheek shine',
    rowTzoneHint: 'Oil difference between forehead-nose and cheeks — the key to telling oily, combination and dry skin apart.',
    rowTexture: 'Skin texture high-frequency energy',
    rowTextureHint: 'Surface roughness normalized by brightness; higher means rougher with more dead-cell buildup.',
    rowPore: 'Pore / unevenness density',
    rowPoreHint: 'Share of pixels above the mid-scale band-pass threshold — pores, blackheads and small bumps.',
    rowSpot: 'Dark spot area',
    rowSpotHint: 'Share of areas clearly darker than surrounding skin (local-contrast detection) — sun spots, marks, pigmentation.',
    rowLstd: 'Skin lightness deviation σL*',
    rowLstdHint: 'Standard deviation of face lightness with specular pixels removed; smaller means more even.',
    rowForehead: 'Forehead line density',
    rowForeheadHint: 'Share of strong gradient edges on the forehead — expression and dry lines.',
    rowCrow: 'Crow’s feet density',
    rowCrowHint: 'Radial line strength at the outer eye corners.',
    rowNasolabial: 'Nasolabial fold density',
    rowNasolabialHint: 'Fold strength from nose wing to mouth corner — linked to soft-tissue support.',
    rowDark: 'Dark circle contrast ΔL*',
    rowDarkHint: 'Lightness difference between cheek and lower eyelid; bigger means darker under-eyes.',
    rowTone: 'Skin tone ITA°',
    rowToneHint: 'The dermatology-standard tone angle computed from L* and b*, used to record your base tone.',
    rowFaceL: 'Median face lightness L*',
    rowFaceLHint: 'Strongly affected by lighting; only compare your own readings under the same light.',

    ingNiacinamide: ['Niacinamide 2–5%', 'Calms inflammatory signals, reduces redness and supports the barrier'],
    ingCentella: ['Centella asiatica / Madecassoside', 'Classic soothing agent for irritation and heat'],
    ingCeramides: ['Ceramides + Cholesterol + Fatty acids', 'Barrier lipids in the 3:1:1 ratio'],
    ingAzelaic: ['Azelaic acid 10–15%', 'Helps red post-acne marks and rosacea-like flushing'],
    ingBHA: ['Salicylic acid 0.5–2% (BHA)', 'Oil-soluble; clears pore plugs deep inside pores'],
    ingNiaOil: ['Niacinamide 4–5%', 'Clinically shown to slow sebum output'],
    ingZinc: ['Zinc PCA / Zinc gluconate', 'Inhibits 5α-reductase, reduces oil'],
    ingLightMoist: ['Niacinamide or sodium PCA moisturizer', 'Controls oil without the rebound dryness'],
    ingHyaluronic: ['Hyaluronic acid + Glycerin', 'Layered hydration; apply on damp skin'],
    ingSqualane: ['Ceramides / Squalane', 'Occlusive lipids that cut water loss'],
    ingPanthenol: ['Panthenol (Vitamin B5)', 'Repairs the stratum corneum, relieves tightness'],
    ingUrea: ['Urea 5% / Lactic acid 5%', 'Gently softens rough skin and improves flaking'],
    ingAHA: ['Glycolic / Mandelic acid 5–10% (AHA)', 'Speeds cell turnover and smooths the surface'],
    ingNiaPore: ['Niacinamide', 'Improves the look of pores with long-term use'],
    ingRetinol: ['Retinol 0.1–0.3% (build tolerance)', 'Boosts cell renewal and collagen'],
    ingVitC: ['Vitamin C (L-AA 10–20% or derivatives)', 'Antioxidant + tyrosinase inhibitor; for mornings'],
    ingNiaPIH: ['Niacinamide 5%', 'Blocks melanin transfer to skin cells'],
    ingTranexamic: ['Tranexamic acid', 'Targets post-inflammatory hyperpigmentation'],
    ingArbutin: ['Arbutin / 377 (Phenylethyl resorcinol)', 'Inhibits melanin synthesis'],
    ingRetinolPIH: ['Retinol', 'Speeds shedding of pigment-laden cells'],
    ingPeptide: ['Peptides (MMP inhibitors)', 'A gentler alternative for retinol-intolerant skin'],
    ingCef: ['Vit C + Vit E + Ferulic acid', 'Daytime antioxidant that reduces photoaging'],
    ingPHA: ['Gentle exfoliation (PHA / lactic acid)', 'Improves light transmission through the stratum corneum'],
    ingCaffeine: ['Caffeine eye cream', 'Improves microcirculation for vascular puffiness'],
    ingVitK: ['Vitamin K / Vitamin C', 'For pigmented-type dark circles'],
    ingNiaPeptide: ['Niacinamide + peptides', 'Broadly improves eye-area texture'],
    ingSleep: ['Adequate sleep + elevated pillow', 'Reduces the blue-purple tone from poor venous return'],

    avoidStackAcids: 'Stacking high-strength AHAs/BHA',
    avoidAlcoholToner: 'High-alcohol toners',
    avoidScrub: 'Physical scrubs',
    avoidHotWater: 'Washing with hot water',
    avoidHeavyOil: 'Heavy mineral oil / coconut oil creams',
    avoidOverCleanse: 'Over-cleansing (>3×/day)',
    avoidAstringent: 'Long-term alcohol astringents',
    avoidSoap: 'Soap-based cleansers',
    avoidClay: 'Frequent clay masks / strong acids',
    avoidTooHot: 'Overly hot water',
    avoidSqueeze: 'Squeezing blackheads',
    avoidAcidStack: 'Layering multiple acids',
    avoidNoseStrips: 'Pore-strip peel-offs',
    avoidBrightNoSPF: 'Brighteners without sunscreen',
    avoidOverExfoliate: 'Over-exfoliating plus brightening serums',
    avoidTug: 'Tugging the eye area',
    avoidEyeAcids: 'Strong acids around the eyes',
    avoidRescueAcid: '“Rescue” acids after all-nighters',
    avoidSmoke: 'Smoking and heavy drinking',
    avoidRubEyes: 'Rubbing your eyes',
    avoidEyeRetinol: 'High-strength retinol around the eyes',
  },
};

/** 取词 + {x} 占位符替换（缺词时回退中文） */
const t = (lang, key, vars) => {
  const table = TXT[lang === 'en' ? 'en' : 'zh'] || TXT.zh;
  let s = table[key];
  if (s === undefined) s = TXT.zh[key];
  if (s === undefined) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
};

/** 成分词条：词典里存的是 [名称, 说明] 数组 */
const ing = (lang, key) => {
  const table = TXT[lang === 'en' ? 'en' : 'zh'] || TXT.zh;
  const v = table[key] !== undefined ? table[key] : TXT.zh[key];
  return Array.isArray(v) ? v : [String(v), ''];
};

/* ======================================================================
   维度定义
   ====================================================================== */
export const DIMENSIONS = [
  { key: 'calmness', label: '舒缓度', icon: 'shield', desc: '泛红、炎症、痘印等刺激信号' },
  { key: 'oilBalance', label: '水油平衡', icon: 'drop', desc: '皮脂分泌与干燥缺水倾向' },
  { key: 'smoothness', label: '细腻度', icon: 'grid', desc: '皮肤纹理、毛孔与粗糙程度' },
  { key: 'evenness', label: '均匀度', icon: 'layers', desc: '色斑、色素沉积与肤色一致度' },
  { key: 'firmness', label: '紧致度', icon: 'arrowUp', desc: '细纹、干纹与纹路深度' },
  { key: 'radiance', label: '光泽度', icon: 'sun', desc: '暗沉、发黄与通透感' },
];

const DIMENSION_I18N = {
  zh: {
    calmness: ['舒缓度', '泛红、炎症、痘印等刺激信号'],
    oilBalance: ['水油平衡', '皮脂分泌与干燥缺水倾向'],
    smoothness: ['细腻度', '皮肤纹理、毛孔与粗糙程度'],
    evenness: ['均匀度', '色斑、色素沉积与肤色一致度'],
    firmness: ['紧致度', '细纹、干纹与纹路深度'],
    radiance: ['光泽度', '暗沉、发黄与通透感'],
    eye: ['眼周状态', '下眼睑与颧颊的亮度差'],
  },
  en: {
    calmness: ['Calmness', 'Redness, irritation and blemish signals'],
    oilBalance: ['Oil & Moisture', 'Sebum production and dryness tendency'],
    smoothness: ['Smoothness', 'Skin texture, pores and roughness'],
    evenness: ['Evenness', 'Dark spots, pigmentation and tone uniformity'],
    firmness: ['Firmness', 'Fine lines and wrinkle depth'],
    radiance: ['Radiance', 'Dullness, sallowness and glow'],
    eye: ['Eye Area', 'Lightness difference between lower eyelid and cheek'],
  },
};

/** 维度名（含"眼周状态"）按语言取词 */
export function dimensionLabel(key, lang = 'zh') {
  const row = (DIMENSION_I18N[lang === 'en' ? 'en' : 'zh'] || DIMENSION_I18N.zh)[key];
  return row ? row[0] : key;
}

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

export function gradeOf(score, lang = 'zh') {
  const bands = [
    [85, 'Excellent', '#34d399'],
    [70, 'Good', '#4ade80'],
    [55, 'Fair', '#fbbf24'],
    [40, 'Poor', '#fb923c'],
  ];
  let band = { key: 'bad', color: '#f87171' };
  for (const [min, name, color] of bands) {
    if (score >= min) {
      band = { key: name.toLowerCase(), color };
      break;
    }
  }
  return { key: band.key, label: t(lang, 'grade' + band.key.charAt(0).toUpperCase() + band.key.slice(1)), color: band.color };
}

/** 肤质判定 */
export function classifySkinType(m, scores, lang = 'zh') {
  const tz = nz(m.tzoneShine);
  const ck = nz(m.cheekShine);
  const shine = nz(m.shineRatio);
  const tex = nz(m.textureCheek);
  const red = nz(m.rednessRatio);

  let typeKey = 'skinNormal';
  let detailKey = 'skinNormalDetail';

  if (tz > 0.09 && ck > 0.06) {
    typeKey = 'skinOily';
    detailKey = 'skinOilyDetail';
  } else if (tz > 0.06 && tz > ck * 1.8) {
    typeKey = 'skinCombOily';
    detailKey = 'skinCombOilyDetail';
  } else if (shine < 0.02 && tex > 1.6) {
    typeKey = 'skinDry';
    detailKey = 'skinDryDetail';
  } else if (ck > 0.03 && tz > 0.04) {
    typeKey = 'skinCombDry';
    detailKey = 'skinCombDryDetail';
  } else if (shine < 0.028) {
    typeKey = 'skinNormalDry';
    detailKey = 'skinNormalDryDetail';
  }

  const sensitive = red > 0.14 || (scores && scores.dimensions.calmness < 55);
  let type = t(lang, typeKey);
  let detail = t(lang, detailKey);
  if (sensitive) {
    type = t(lang, 'skinSensitiveSuffix') + type;
    detail += t(lang, 'skinSensitiveDetail');
  }

  return { type, detail, sensitive, typeKey };
}

/** 单条测量值的展示信息，用于报告"数据透明度"表格 */
export function detailRows(m, tone, scores, lang = 'zh') {
  const pct = (v) => `${(nz(v) * 100).toFixed(1)}%`;
  const f1 = (v, u = '') => (Number.isFinite(v) ? `${v.toFixed(1)}${u}` : '—');

  const rows = [
    { name: t(lang, 'rowRedness'), value: pct(m.rednessRatio), score: scores.dimensions.calmness, hint: t(lang, 'rowRednessHint') },
    { name: t(lang, 'rowBlemish'), value: pct(m.blemishRatio), score: scores.dimensions.calmness, hint: t(lang, 'rowBlemishHint') },
    { name: t(lang, 'rowCheekA'), value: f1(m.rednessContrast), score: scores.dimensions.calmness, hint: t(lang, 'rowCheekAHint') },
    { name: t(lang, 'rowShine'), value: pct(m.shineRatio), score: scores.dimensions.oilBalance, hint: t(lang, 'rowShineHint') },
    { name: t(lang, 'rowTzone'), value: `${pct(m.tzoneShine)} / ${pct(m.cheekShine)}`, score: scores.dimensions.oilBalance, hint: t(lang, 'rowTzoneHint') },
    { name: t(lang, 'rowTexture'), value: f1(m.textureCheek), score: scores.dimensions.smoothness, hint: t(lang, 'rowTextureHint') },
    { name: t(lang, 'rowPore'), value: pct(m.poreDensity), score: scores.dimensions.smoothness, hint: t(lang, 'rowPoreHint') },
    { name: t(lang, 'rowSpot'), value: pct(m.spotRatio), score: scores.dimensions.evenness, hint: t(lang, 'rowSpotHint') },
    { name: t(lang, 'rowLstd'), value: f1(nz(m.faceLstdMatte, m.faceLstd)), score: scores.dimensions.evenness, hint: t(lang, 'rowLstdHint') },
    { name: t(lang, 'rowForehead'), value: pct(m.lineDensityForehead), score: scores.dimensions.firmness, hint: t(lang, 'rowForeheadHint') },
    { name: t(lang, 'rowCrow'), value: pct(m.lineDensityCrow), score: scores.dimensions.firmness, hint: t(lang, 'rowCrowHint') },
    { name: t(lang, 'rowNasolabial'), value: pct(m.lineDensityNasolabial), score: scores.dimensions.firmness, hint: t(lang, 'rowNasolabialHint') },
    { name: t(lang, 'rowDark'), value: f1(m.undereyeDelta), score: scores.darkCircle, hint: t(lang, 'rowDarkHint') },
    { name: t(lang, 'rowTone'), value: `${tone.ita.toFixed(1)}°（${tone.name}）`, score: scores.dimensions.radiance, hint: t(lang, 'rowToneHint') },
    { name: t(lang, 'rowFaceL'), value: f1(m.faceL), score: scores.dimensions.radiance, hint: t(lang, 'rowFaceLHint') },
  ];
  return rows;
}

/** 生成个性化护理建议 */
export function buildAdvice(m, scores, skinType, tone, lang = 'zh') {
  const dims = scores.dimensions;
  const concerns = [];

  const push = (key, severity, titleKey, descKey, descVars, ingredientKeys, avoidKeys, actionKey) =>
    concerns.push({
      key,
      severity,
      title: t(lang, titleKey),
      desc: t(lang, descKey, descVars),
      ingredients: ingredientKeys.map((k) => ing(lang, k)),
      avoid: avoidKeys.map((k) => t(lang, k)),
      action: t(lang, actionKey),
    });

  /* ---- 逐维度诊断，按严重程度排序 ---- */
  if (dims.calmness < 82) {
    const sev = dims.calmness < 55 ? 'high' : dims.calmness < 70 ? 'mid' : 'low';
    push(
      'redness',
      sev,
      'cRedness',
      'dRedness',
      {
        red: (nz(m.rednessRatio) * 100).toFixed(1),
        blem: nz(m.blemishRatio) > 0.012 ? t(lang, 'dBlemishPart', { blem: (nz(m.blemishRatio) * 100).toFixed(1) }) : '',
      },
      ['ingNiacinamide', 'ingCentella', 'ingCeramides', 'ingAzelaic'],
      ['avoidStackAcids', 'avoidAlcoholToner', 'avoidScrub', 'avoidHotWater'],
      'aRedness',
    );
  }

  if (dims.oilBalance < 82) {
    const oily = nz(m.shineRatio) >= 0.045;
    const sev = dims.oilBalance < 55 ? 'high' : dims.oilBalance < 70 ? 'mid' : 'low';
    if (oily) {
      push(
        'oil',
        sev,
        'cOil',
        'dOil',
        { shine: (nz(m.shineRatio) * 100).toFixed(1) },
        ['ingBHA', 'ingNiaOil', 'ingZinc', 'ingLightMoist'],
        ['avoidHeavyOil', 'avoidOverCleanse', 'avoidAstringent'],
        'aOil',
      );
    } else {
      push(
        'dry',
        sev,
        'cDry',
        'dDry',
        { shine: (nz(m.shineRatio) * 100).toFixed(1), tex: nz(m.textureCheek).toFixed(2) },
        ['ingHyaluronic', 'ingSqualane', 'ingPanthenol', 'ingUrea'],
        ['avoidSoap', 'avoidClay', 'avoidTooHot'],
        'aDry',
      );
    }
  }

  if (dims.smoothness < 82) {
    const sev = dims.smoothness < 55 ? 'high' : dims.smoothness < 70 ? 'mid' : 'low';
    push(
      'texture',
      sev,
      'cTexture',
      'dTexture',
      { pore: (nz(m.poreDensity) * 100).toFixed(1), tex: nz(m.textureCheek).toFixed(2) },
      ['ingBHA', 'ingAHA', 'ingNiaPore', 'ingRetinol'],
      ['avoidSqueeze', 'avoidAcidStack', 'avoidNoseStrips'],
      'aTexture',
    );
  }

  if (dims.evenness < 82) {
    const sev = dims.evenness < 55 ? 'high' : dims.evenness < 70 ? 'mid' : 'low';
    push(
      'pigment',
      sev,
      'cPigment',
      'dPigment',
      { spot: (nz(m.spotRatio) * 100).toFixed(1), lstd: nz(m.faceLstdMatte, nz(m.faceLstd)).toFixed(1) },
      ['ingVitC', 'ingNiaPIH', 'ingTranexamic', 'ingArbutin', 'ingRetinolPIH'],
      ['avoidBrightNoSPF', 'avoidOverExfoliate'],
      'aPigment',
    );
  }

  if (dims.firmness < 82) {
    const sev = dims.firmness < 55 ? 'high' : dims.firmness < 70 ? 'mid' : 'low';
    push(
      'lines',
      sev,
      'cLines',
      'dLines',
      {
        f: (nz(m.lineDensityForehead) * 100).toFixed(1),
        c: (nz(m.lineDensityCrow) * 100).toFixed(1),
        n: (nz(m.lineDensityNasolabial) * 100).toFixed(1),
      },
      ['ingRetinol', 'ingPeptide', 'ingCef', 'ingHyaluronic'],
      ['avoidTug', 'avoidEyeAcids'],
      'aLines',
    );
  }

  if (dims.radiance < 82) {
    const sev = dims.radiance < 55 ? 'high' : dims.radiance < 70 ? 'mid' : 'low';
    push(
      'dullness',
      sev,
      'cDullness',
      'dDullness',
      { l: nz(m.faceL).toFixed(1), b: nz(m.sallowness).toFixed(1) },
      ['ingVitC', 'ingNiaPIH', 'ingPHA'],
      ['avoidRescueAcid', 'avoidSmoke'],
      'aDullness',
    );
  }

  /* ---- 黑眼圈单独处理（不进雷达维度） ---- */
  if (Number.isFinite(m.undereyeDelta) && nz(m.undereyeDelta) > 6) {
    push(
      'darkCircle',
      nz(m.undereyeDelta) > 11 ? 'high' : 'mid',
      'cDarkCircle',
      'dDarkCircle',
      { d: nz(m.undereyeDelta).toFixed(1) },
      ['ingCaffeine', 'ingVitK', 'ingNiaPeptide', 'ingSleep'],
      ['avoidRubEyes', 'avoidEyeRetinol'],
      'aDarkCircle',
    );
  }

  /* ---- 排序：严重度优先 ---- */
  const order = { high: 0, mid: 1, low: 2 };
  concerns.sort((a, b) => order[a.severity] - order[b.severity]);

  /* ---- 日常流程 ---- */
  const oily = nz(m.shineRatio) >= 0.045;
  const dry = nz(m.shineRatio) < 0.02;
  const sensitive = skinType.sensitive;
  const step = (s, x) => ({ step: t(lang, s), text: x });

  const routine = {
    am: [
      step('rStepCleanse', t(lang, sensitive ? 'rAmCleanseSensitive' : oily ? 'rAmCleanseOily' : 'rAmCleanseNormal')),
      step('rStepToner', t(lang, sensitive ? 'rAmTonerSensitive' : oily ? 'rAmTonerOily' : 'rAmTonerNormal')),
      step('rStepSerum', t(lang, 'rAmSerum')),
      step('rStepMoist', t(lang, oily ? 'rAmMoistOily' : dry ? 'rAmMoistDry' : 'rAmMoistNormal')),
      step('rStepSunscreen', t(lang, 'rAmSunscreen')),
    ],
    pm: [
      step('rStepRemove', t(lang, sensitive ? 'rPmCleanseSensitive' : 'rPmCleanseNormal')),
      step('rStepActive', t(lang, concerns.some((c) => c.key === 'lines') ? 'rPmActiveRetinol' : oily ? 'rPmActiveOily' : 'rPmActiveNormal')),
      step('rStepRepair', t(lang, sensitive ? 'rPmSerumSensitive' : 'rPmSerumNormal')),
      step('rStepMoist', t(lang, 'rPmMoist')),
      step('rStepEye', t(lang, concerns.some((c) => c.key === 'darkCircle') ? 'rPmEyeDC' : 'rPmEyeNormal')),
    ],
    weekly: [
      t(lang, 'rWeekly1'),
      t(lang, dry ? 'rWeekly2Dry' : 'rWeekly2Normal'),
      t(lang, 'rWeekly3'),
      t(lang, 'rWeekly4'),
    ],
  };

  /* ---- 何时该看皮肤科医生 ---- */
  const seeDoctor = [];
  if (nz(m.rednessRatio) > 0.2) seeDoctor.push(t(lang, 'mRedness'));
  if (nz(m.spotRatio) > 0.12) seeDoctor.push(t(lang, 'mSpot'));
  if (dims.calmness < 45) seeDoctor.push(t(lang, 'mCalm'));
  if (nz(m.blemishRatio) > 0.15) seeDoctor.push(t(lang, 'mBlemish'));
  seeDoctor.push(t(lang, 'mMeds'));
  seeDoctor.push(t(lang, 'mMoles'));

  return { concerns, routine, seeDoctor, oily, dry, sensitive };
}

/** 生活作息通用建议 */
export function lifestyleTips(lang = 'zh') {
  return [
    { icon: 'moon', title: t(lang, 'lSleepTitle'), text: t(lang, 'lSleepText') },
    { icon: 'sun', title: t(lang, 'lSunTitle'), text: t(lang, 'lSunText') },
    { icon: 'water', title: t(lang, 'lDietTitle'), text: t(lang, 'lDietText') },
    { icon: 'hand', title: t(lang, 'lTouchTitle'), text: t(lang, 'lTouchText') },
  ];
}
