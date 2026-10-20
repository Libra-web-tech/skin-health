/**
 * i18n.js —— 多语言词典与语言管理（中/英/日/韩/法/西/德/俄）
 *
 * 用法：
 *   import { L, getLang, setLang, applyStaticLang, LANGS, EXTRA, localeOf } from './i18n.js';
 *   L(lang, 'app.title')                        // 取词
 *   L(lang, 'advice.redness.desc', { red: '3.2' })  // 带占位符替换
 *
 * 语言保存在 localStorage（键 skin-health-lang），默认中文。
 * 每种语言的完整词典放在 js/lang/<code>.js（含 ui / advice / dim / roi / table 五部分）。
 */

import JA from './lang/ja.js';
import KO from './lang/ko.js';
import FR from './lang/fr.js';
import ES from './lang/es.js';
import DE from './lang/de.js';
import RU from './lang/ru.js';

/** 额外语言模块（scoring/report 从中读取 advice/dim/roi/table 部分） */
export const EXTRA = { ja: JA, ko: KO, fr: FR, es: ES, de: DE, ru: RU };

export const LANGS = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  ru: 'Русский',
};

const SUPPORTED = new Set(Object.keys(LANGS));

/** 各语言的日期本地化 locale */
const LOCALE = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  ru: 'ru-RU',
};

export function localeOf(lang) {
  return LOCALE[lang] || LOCALE.zh;
}

const KEY = 'skin-health-lang';

export function getLang() {
  try {
    const v = localStorage.getItem(KEY);
    return SUPPORTED.has(v) ? v : 'zh';
  } catch {
    return 'zh';
  }
}

export function setLang(lang) {
  try {
    localStorage.setItem(KEY, SUPPORTED.has(lang) ? lang : 'zh');
  } catch {
    /* ignore */
  }
}

/** 取词并替换 {x} 占位符（缺失时回退中文） */
export function L(lang, key, vars) {
  const table = DICT[SUPPORTED.has(lang) ? lang : 'zh'] || DICT.zh;
  let s = table[key];
  if (s === undefined) s = DICT.zh[key];
  if (s === undefined) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

/** 把 index.html 里所有 [data-i18n] 元素的文本替换为当前语言 */
export function applyStaticLang(lang) {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    const text = L(lang, key);
    if (text && text !== key) el.textContent = text;
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const key = el.getAttribute('data-i18n-placeholder');
    const text = L(lang, key);
    if (text && text !== key) el.placeholder = text;
  }
}

/* ======================================================================
   词典
   ====================================================================== */
const DICT = {
  zh: {
    /* ---------- 应用框架 ---------- */
    'app.title': '皮肤健康检测',
    'app.subtitle': '摄像头人脸分析 · 生成皮肤健康报告',
    'app.privacy': '画面不上传 · 全部本地处理',
    'app.footer': '皮肤健康检测 · 浏览器端图像分析 · 零依赖 · 零上传',
    'app.langSwitch': 'EN',

    'welcome.title': '用摄像头，给你的皮肤做一次体检',
    'welcome.desc':
      '授权摄像头后，我们会在你的浏览器里逐像素分析面部图像，从泛红炎症、水油平衡、毛孔纹理、色素色斑、细纹紧致、暗沉光泽六个维度生成一份可导出的皮肤健康报告。',
    'welcome.f1.title': '完全本地计算',
    'welcome.f1.desc': '使用 Canvas 与 CIE-Lab 色彩分析在你的设备上完成推理，视频帧和照片不会发送到任何服务器。',
    'welcome.f2.title': '12 项可解释指标',
    'welcome.f2.desc': '不只给一个分数，每一项都展示实际测量值，你可以看到分数是怎么算出来的。',
    'welcome.f3.title': '热力图定位',
    'welcome.f3.desc': '把泛红、油光、色斑、纹路标在脸上，明确知道问题出在哪个区域。',
    'welcome.f4.title': '趋势追踪',
    'welcome.f4.desc': '检测记录保存在本机，复测后可以看到分数变化，判断护肤方案是否真的有效。',
    'welcome.check1':
      '光线：正面均匀的自然光或白光，避免顶光、侧光与彩色灯（会影响颜色类指标）',
    'welcome.check2': '面部：素颜或仅基础护肤，头发拨开露出额头，摘掉眼镜与口罩',
    'welcome.check3': '姿势：正对镜头，脸占画面 1/3 以上，检测过程中保持不动约 5 秒',
    'welcome.check4': '复制性：固定设备、光线与时间段，趋势才有意义',
    'welcome.start': '授权摄像头并开始检测',
    'welcome.historyNote': '本机已保存 {n} 次检测记录，最新一次：{t}',
    'welcome.secureWarn':
      '当前页面不是安全上下文，浏览器会拒绝摄像头请求。如果你是通过局域网地址（http://10.x.x.x 之类）在手机或别的电脑上打开本页，请先到 {install} 装好证书，再用 https://本机IP:8443/ 访问。本机使用请通过 http://127.0.0.1 打开（在项目目录执行 node serve.mjs 启动服务）。',
    'welcome.secureWarnInstall': '安装证书引导页',
    'welcome.notice':
      '本工具测量的是照片上的表面光学特征，属于护肤参考工具，不是医疗器械，不能用于诊断疾病。皮肤有持续异常请就医。',

    /* ---------- 相机页 ---------- */
    'cam.liveTitle': '实时检测',
    'cam.face': '人脸',
    'cam.light': '光线',
    'cam.size': '距离',
    'cam.still': '稳定性',
    'cam.faceYes': '已检测到',
    'cam.faceNo': '未检测到',
    'cam.lightLow': '偏暗',
    'cam.lightHigh': '偏亮',
    'cam.lightOk': '良好',
    'cam.sizeOk': '合适',
    'cam.sizeFar': '稍远',
    'cam.sizeTooFar': '太远',
    'cam.stillOk': '稳定',
    'cam.stillWarn': '轻微晃动',
    'cam.stillBad': '请保持不动',
    'cam.na': '—',
    'cam.tipsTitle': '拍摄要点',
    'cam.tip1': '面向窗户或正前方的白光，避免背光与顶灯',
    'cam.tip2': '额头、两颊、下巴都要完整出现在画面里',
    'cam.tip3': '表情自然放松，不要皱眉或用力闭眼',
    'cam.tip4': '点击后会有 3 秒倒计时，请保持不动',
    'cam.privacyTitle': '隐私',
    'cam.privacy':
      '视频流仅存在于本页面的内存中。关闭摄像头或离开页面后立即释放，检测历史只保存分数，不保存任何图像。',
    'cam.scan': '开始分析',
    'cam.stop': '关闭摄像头',
    'cam.qualityTitle': '采样质量未达标',
    'cam.override': '仍然用当前画面生成报告',
    'cam.countdownHint': '请保持不动，大约需要 5 秒',

    'analyzing.capture': '正在采集画面',
    'analyzing.prepare': '准备中…',
    'analyzing.scan': '正在分析皮肤特征',
    'analyzing.frame': '分析第 {a} / {b} 帧（泛红 · 油光 · 纹理 · 色斑 · 纹路）',
    'analyzing.captureFrame': '采集第 {a} / {b} 帧',
    'analyzing.final': '汇总评分与护理建议',
    'analyzing.done': '完成',
    'analyzing.forced': '按当前画面生成报告…',

    /* ---------- 错误 ---------- */
    'err.defaultTitle': '无法启动摄像头',
    'err.defaultDesc': '发生未知错误，请刷新页面后重试。',
    'err.hint1': '刷新页面重试',
    'err.hint2': '确认浏览器为最新版本',
    'err.hint3': '尝试使用 Chrome 或 Edge',
    'err.notAllowedTitle': '摄像头权限被拒绝',
    'err.notAllowedDesc':
      '浏览器阻止了摄像头访问。本网站需要摄像头权限才能进行皮肤分析，视频画面只在本机处理，不会上传。',
    'err.notAllowedHint': [
      '点击浏览器地址栏左侧的锁形 / 摄像头图标，把"摄像头"改为"允许"',
      '刷新页面后重新点击"开始检测"',
      '如果之前点了"阻止"，浏览器会记住这个选择，必须手动改回',
      '企业设备可能被系统策略禁止，请改用个人设备或联系管理员',
    ],
    'err.notFoundTitle': '没有检测到摄像头',
    'err.notFoundDesc': '系统未找到可用的视频输入设备。',
    'err.notFoundHint': [
      '确认设备有摄像头，且没有被物理遮挡或开关关闭',
      '外接摄像头请检查 USB 连接',
      '关闭远程桌面 / 虚拟机后重试',
    ],
    'err.notReadableTitle': '摄像头被占用',
    'err.notReadableDesc': '摄像头已被其它程序（会议软件、直播工具、相机应用）独占。',
    'err.notReadableHint': ['关闭腾讯会议 / Zoom / OBS / 相机等正在使用摄像头的程序', '稍等几秒后点击"重试"'],
    'err.overconstrainedTitle': '摄像头不支持所需分辨率',
    'err.overconstrainedDesc': '设备无法提供请求的视频参数。',
    'err.overconstrainedHint': ['点击"重试"，我们会自动降级到更宽松的参数'],
    'err.securityTitle': '当前环境不允许访问摄像头',
    'err.securityDesc': '浏览器只允许在安全上下文中使用摄像头。',
    'err.securityHint': [
      '请通过 http://localhost 或 https:// 打开本页面，不要用 file:// 直接打开',
      '本项目自带本地服务器：在项目目录执行 node serve.mjs',
    ],
    'err.unsupportedTitle': '浏览器不支持摄像头接口',
    'err.unsupportedDesc': '当前浏览器没有提供 getUserMedia API。',
    'err.unsupportedHint': [
      '请使用较新版本的 Chrome、Edge、Firefox 或 Safari',
      'iOS 上必须使用 Safari，第三方浏览器内核可能不支持',
    ],
    'err.retry': '重试',
    'err.hintLabel': '可以尝试：',

    'fail.no_face': '未能识别到人脸区域。请正对镜头、露出完整面部，并避免背景中出现大面积与肤色相近的物体。',
    'fail.face_too_small': '人脸在画面中太小，请靠近摄像头后重试。',
    'fail.face_occluded': '面部被头发、口罩、手或镜框遮挡过多，请调整后重试。',
    'fail.invalid_frame': '画面数据无效，请刷新页面后重试。',
    'fail.default': '画面无法分析，请调整姿势与光线后重试。',
    'fail.toast': '本次采集未能完成分析',
    'fail.qualityToast': '采样质量不达标，请按提示调整后重试',
    'quality.shake': '检测到画面晃动较大，部分指标可能存在偏差，建议重新拍摄',
    'quality.forced': '本次为质量不达标情况下强制生成，数据仅供参考',
    'quality.blur': '画面模糊或晃动明显，请握稳设备并重新对焦',
    'quality.dark': '环境太暗，请在正面自然光或白光下重新拍摄',
    'quality.far': '人脸太小，请靠近摄像头（约占画面 1/3 以上）',
    'quality.occluded': '面部被遮挡或角度偏斜，请正对镜头并露出全脸',
    'quality.angle': '拍摄角度偏斜，可能影响左右对称区域读数',
    'quality.over': '存在过曝区域（高光溢出），会低估油光程度',
    'quality.dim': '画面整体偏暗，亮度相关指标（光泽度）参考价值下降，建议补光后复测',
    'quality.dim2': '光线偏暗，可能放大纹理类指标的读数',

    /* ---------- 报告 ---------- */
    'report.title': '面部皮肤健康报告',
    'report.overall': '综合评分',
    'report.time': '检测时间',
    'report.frames': '分析帧数',
    'report.frameUnit': '帧',
    'report.quality': '采样质量',
    'report.coverage': '面部覆盖',
    'report.qualityWarn':
      '本次采样的影响因素：{list}。相关指标仅供参考，建议在稳定光线下复测对比趋势。',
    'report.dimTitle': '六维皮肤状态',
    'report.dimSub': '分数越高越好，满分 100',
    'report.dimDetailTitle': '维度详情',
    'report.dimDetailSub': '点击下方"测量数据"可查看每个分数背后的原始读数',
    'report.concernTitle': '重点关注',
    'report.concernSub': '共 {n} 项，按优先级排序',
    'report.concernEmpty': '本次检测未发现明显异常项，继续保持现有的护肤习惯即可。',
    'report.sevHigh': '优先处理',
    'report.sevMid': '建议改善',
    'report.sevLow': '轻度关注',
    'report.avoidLabel': '需要避免：',
    'report.dataTitle': '测量数据',
    'report.dataSub': '所有数值均来自本机浏览器内的图像分析，可直接复核',
    'report.evidenceTitle': '影像证据',
    'report.evidenceSub': '切换图层查看不同指标在脸上的分布',
    'report.routineTitle': '日常护理流程',
    'report.routineSub': '根据本次检测结果生成 · 新成分请先做耳后试用',
    'report.am': '早间流程',
    'report.pm': '晚间流程',
    'report.weekly': '每周维护',
    'report.lifeTitle': '生活方式建议',
    'report.medicalTitle': '何时应该就医',
    'report.historyTitle': '历史趋势',
    'report.historySub': '数据仅保存在本机浏览器，不会上传',
    'report.historyEmpty':
      '这是第一条记录。保持相同的拍摄条件（同一设备、同一光线、同一时间）定期复测，趋势才有参考价值。',
    'report.historyEarliest': '最早',
    'report.historyLatest': '最近',
    'report.historyOverallChange': '综合评分变化',
    'report.disclaimerTitle': '重要说明与免责声明',
    'report.disclaimer':
      '本报告由浏览器内的图像分析算法自动生成，测量的是可见光照片上的表面光学特征，并非医学检查。它不能诊断任何疾病，也不能替代皮肤科医生的面诊、皮肤镜或实验室检查。评分采用启发式模型，适合用来观察自身在相同光线与设备条件下的长期变化趋势，不同设备、不同光线、不同肤色之间的绝对值不具备可比性。若皮肤出现持续红肿、瘙痒、疼痛、渗出、迅速变化的痣或任何让你担心的症状，请及时就医。',

    /* ---------- 对比 ---------- */
    'compare.title': '与上次对比',
    'compare.sub': '上次检测于 {t}（{d} 前）',
    'compare.days': '{n} 天',
    'compare.hours': '{n} 小时',
    'compare.minutes': '{n} 分钟',
    'compare.justNow': '刚刚',
    'compare.overall': '综合评分',
    'compare.dim': '六维变化',
    'compare.key': '关键指标变化',
    'compare.up': '上升',
    'compare.down': '下降',
    'compare.flat': '持平',
    'compare.metric.redness': '泛红占比',
    'compare.metric.blemish': '痘印密度',
    'compare.metric.shine': '油光占比',
    'compare.metric.spot': '色斑占比',
    'compare.metric.pore': '毛孔密度',
    'compare.metric.line': '额头纹路',

    /* ---------- 导出 ---------- */
    'actions.print': '打印 / 导出 PDF',
    'actions.png': '下载标注图',
    'actions.share': '分享卡片图',
    'actions.json': '导出数据 JSON',
    'actions.copy': '复制摘要',
    'actions.clear': '清除历史',
    'actions.again': '再测一次',
    'actions.toastPng': '已导出标注图（当前图层）',
    'actions.toastJson': '已导出完整数据 JSON',
    'actions.toastCopy': '报告摘要已复制到剪贴板',
    'actions.toastCopyFallback': '剪贴板不可用，已改为下载文本文件',
    'actions.toastClear': '本机历史记录已清除',
    'actions.toastShareReady': '分享卡片已生成',
    'actions.toastShareFail': '分享卡片生成失败',
    'actions.toastLang': '语言已切换为 {lang}',

    /* ---------- 分享卡片 ---------- */
    'share.title': '皮肤健康报告',
    'share.overall': '综合评分',
    'share.grade': '评级',
    'share.skinType': '肤质',
    'share.tone': '肤色',
    'share.topFindings': '重点关注',
    'share.scanCode': '扫码体验',
    'share.disclaimer': '浏览器端图像分析 · 仅供护肤参考 · 非医学诊断',

    /* ---------- 图层 ---------- */
    'layer.roi': '分析区域',
    'layer.roiHint': '算法实际采样的解剖学分区',
    'layer.redness': '泛红 / 炎症',
    'layer.rednessHint': '红度高于自身基线的区域',
    'layer.blemish': '痘印 / 丘疹',
    'layer.blemishHint': '局部红度突起',
    'layer.shine': '油光 / 反光',
    'layer.shineHint': '镜面反射（皮脂）区域',
    'layer.spot': '色斑 / 色素',
    'layer.spotHint': '比周围皮肤明显暗的区域',
    'layer.pore': '毛孔 / 粗糙',
    'layer.poreHint': '中尺度凹凸结构',
    'layer.line': '细纹 / 纹路',
    'layer.lineHint': '强梯度线条',
    'layer.unit': '分区',
  },

  en: {
    'app.title': 'Skin Health Scanner',
    'app.subtitle': 'Camera facial analysis · Generate a skin health report',
    'app.privacy': 'No upload · 100% on-device',
    'app.footer': 'Skin Health Scanner · in-browser analysis · zero dependency · zero upload',
    'app.langSwitch': '中',

    'welcome.title': 'Give your skin a check-up, right from your camera',
    'welcome.desc':
      'After you grant camera access, we analyze your facial image pixel by pixel inside your browser and produce an exportable skin health report covering six dimensions: redness & irritation, oil & moisture balance, pores & texture, pigmentation, fine lines & firmness, and dullness & radiance.',
    'welcome.f1.title': '100% on-device',
    'welcome.f1.desc': 'Analysis runs in your browser with Canvas and CIE-Lab colorimetry. No video frame or photo ever leaves your device.',
    'welcome.f2.title': '12 explainable metrics',
    'welcome.f2.desc': 'Not just a score — every metric shows its actual measurement, so you can see exactly how the score was computed.',
    'welcome.f3.title': 'Heatmap localization',
    'welcome.f3.desc': 'Redness, oil shine, dark spots and lines are overlaid on your face, so you know exactly where each issue is.',
    'welcome.f4.title': 'Trend tracking',
    'welcome.f4.desc': 'Scan history is stored locally. Re-test to see how your scores move and whether your routine actually works.',
    'welcome.check1': 'Lighting: even natural or white light from the front; avoid top light, side light and colored lamps.',
    'welcome.check2': 'Face: bare skin or basic skincare only; pull hair off your forehead and remove glasses and masks.',
    'welcome.check3': 'Posture: face the camera, keep your face above 1/3 of the frame and stay still for ~5 seconds.',
    'welcome.check4': 'Repeatability: keep the same device, lighting and time of day so trends stay meaningful.',
    'welcome.start': 'Allow Camera & Start Scan',
    'welcome.historyNote': '{n} scans saved on this device, latest: {t}',
    'welcome.secureWarn':
      'This page is not a secure context, so the browser will refuse camera access. If you opened this from another device over the local network, install the certificate from {install} first, then visit https://<host-ip>:8443/. On this machine, open http://127.0.0.1 instead (run node serve.mjs in the project folder).',
    'welcome.secureWarnInstall': 'Install Guide',
    'welcome.notice':
      'This tool measures surface optical features in photos. It is a skincare reference, not a medical device, and cannot diagnose diseases. See a doctor for persistent skin problems.',

    'cam.liveTitle': 'Live checks',
    'cam.face': 'Face',
    'cam.light': 'Light',
    'cam.size': 'Distance',
    'cam.still': 'Steadiness',
    'cam.faceYes': 'Detected',
    'cam.faceNo': 'Not found',
    'cam.lightLow': 'Too dark',
    'cam.lightHigh': 'Too bright',
    'cam.lightOk': 'Good',
    'cam.sizeOk': 'Good',
    'cam.sizeFar': 'A bit far',
    'cam.sizeTooFar': 'Too far',
    'cam.stillOk': 'Stable',
    'cam.stillWarn': 'Slight motion',
    'cam.stillBad': 'Hold still',
    'cam.na': '—',
    'cam.tipsTitle': 'Shooting tips',
    'cam.tip1': 'Face a window or white light from the front; avoid backlight and overhead lamps',
    'cam.tip2': 'Forehead, cheeks and chin should all be fully visible',
    'cam.tip3': 'Relax your expression; do not frown or squeeze your eyes',
    'cam.tip4': 'A 3-second countdown starts after tapping; please stay still',
    'cam.privacyTitle': 'Privacy',
    'cam.privacy':
      'The video stream lives only in this page’s memory and is released as soon as the camera closes or you leave. History stores scores only — never images.',
    'cam.scan': 'Start Scan',
    'cam.stop': 'Stop Camera',
    'cam.qualityTitle': 'Sample quality not met',
    'cam.override': 'Generate report from this frame anyway',
    'cam.countdownHint': 'Please stay still, about 5 seconds',

    'analyzing.capture': 'Capturing frames',
    'analyzing.prepare': 'Preparing…',
    'analyzing.scan': 'Analyzing skin features',
    'analyzing.frame': 'Analyzing frame {a} / {b} (redness · shine · texture · spots · lines)',
    'analyzing.captureFrame': 'Capturing frame {a} / {b}',
    'analyzing.final': 'Compiling scores & recommendations',
    'analyzing.done': 'Done',
    'analyzing.forced': 'Generating report from current frame…',

    'err.defaultTitle': 'Camera unavailable',
    'err.defaultDesc': 'An unknown error occurred. Please refresh the page and try again.',
    'err.hint1': 'Refresh the page and retry',
    'err.hint2': 'Make sure your browser is up to date',
    'err.hint3': 'Try Chrome or Edge',
    'err.notAllowedTitle': 'Camera permission denied',
    'err.notAllowedDesc':
      'The browser blocked camera access. This site needs the camera for skin analysis; the video is processed on-device and never uploaded.',
    'err.notAllowedHint': [
      'Click the lock / camera icon on the left of the address bar and set "Camera" to Allow',
      'Refresh the page and tap "Start Scan" again',
      'If you previously clicked "Block", the browser remembers it — you must change it back manually',
      'Company devices may be blocked by policy; use a personal device or contact your admin',
    ],
    'err.notFoundTitle': 'No camera found',
    'err.notFoundDesc': 'The system could not find a video input device.',
    'err.notFoundHint': [
      'Make sure the device has a camera and it is not covered or switched off',
      'For external cameras, check the USB connection',
      'Close remote desktop / virtual machine and retry',
    ],
    'err.notReadableTitle': 'Camera is busy',
    'err.notReadableDesc': 'The camera is being used exclusively by another program (meeting software, streaming tools, camera app).',
    'err.notReadableHint': ['Close programs using the camera (Zoom / OBS / camera app, etc.)', 'Wait a few seconds and tap "Retry"'],
    'err.overconstrainedTitle': 'Camera does not support the requested resolution',
    'err.overconstrainedDesc': 'The device cannot provide the requested video settings.',
    'err.overconstrainedHint': ['Tap "Retry" — we will fall back to looser settings automatically'],
    'err.securityTitle': 'Camera not allowed in this context',
    'err.securityDesc': 'Browsers only allow camera access in secure contexts.',
    'err.securityHint': [
      'Open this page via http://localhost or https://, not file://',
      'This project ships a local server: run node serve.mjs in the project folder',
    ],
    'err.unsupportedTitle': 'Browser does not support camera',
    'err.unsupportedDesc': 'The current browser does not provide the getUserMedia API.',
    'err.unsupportedHint': [
      'Use a recent version of Chrome, Edge, Firefox or Safari',
      'On iOS, Safari is required; third-party browser cores may not work',
    ],
    'err.retry': 'Retry',
    'err.hintLabel': 'You can try:',

    'fail.no_face': 'No face detected. Face the camera with your full face visible, and avoid large skin-colored objects in the background.',
    'fail.face_too_small': 'Your face is too small in the frame. Move closer to the camera and retry.',
    'fail.face_occluded': 'Too much of the face is covered by hair, mask, hands or glasses. Adjust and retry.',
    'fail.invalid_frame': 'Invalid frame data. Please refresh the page and retry.',
    'fail.default': 'The frame could not be analyzed. Adjust posture and lighting, then retry.',
    'fail.toast': 'This capture could not be analyzed',
    'fail.qualityToast': 'Sample quality not met — adjust as suggested and retry',
    'quality.shake': 'Heavy motion detected; some metrics may be off. Re-shooting is recommended.',
    'quality.forced': 'Report generated despite failed quality checks — for reference only',
    'quality.blur': 'The frame is blurry or shaking. Hold the device steady and refocus.',
    'quality.dark': 'Too dark. Please shoot under frontal natural or white light.',
    'quality.far': 'Your face is too small. Move closer (about 1/3 of the frame or more).',
    'quality.occluded': 'The face is occluded or at an angle. Face the camera with your full face visible.',
    'quality.angle': 'Tilted shooting angle; left-right symmetric readings may be affected.',
    'quality.over': 'Overexposed areas (clipped highlights) will under-report oil shine.',
    'quality.dim': 'The frame is dim overall; brightness-related metrics (radiance) are less reliable. Add light and re-test.',
    'quality.dim2': 'Dim lighting may inflate texture-class metrics.',

    'report.title': 'Facial Skin Health Report',
    'report.overall': 'Overall',
    'report.time': 'Scanned at',
    'report.frames': 'Frames',
    'report.frameUnit': 'frames',
    'report.quality': 'Sample quality',
    'report.coverage': 'Face coverage',
    'report.qualityWarn':
      'Factors affecting this sample: {list}. Related metrics are for reference only — re-test in stable lighting to compare trends.',
    'report.dimTitle': 'Six Skin Dimensions',
    'report.dimSub': 'Higher is better, out of 100',
    'report.dimDetailTitle': 'Dimension Details',
    'report.dimDetailSub': 'See "Measurement Data" below for the raw readings behind each score',
    'report.concernTitle': 'Key Findings',
    'report.concernSub': '{n} items, sorted by priority',
    'report.concernEmpty': 'No significant issues found this scan. Keep up your current routine.',
    'report.sevHigh': 'Priority',
    'report.sevMid': 'Improve',
    'report.sevLow': 'Watch',
    'report.avoidLabel': 'Avoid:',
    'report.dataTitle': 'Measurement Data',
    'report.dataSub': 'All values come from in-browser image analysis and can be audited directly',
    'report.evidenceTitle': 'Visual Evidence',
    'report.evidenceSub': 'Switch layers to see how each metric distributes across the face',
    'report.routineTitle': 'Skincare Routine',
    'report.routineSub': 'Generated from this scan · patch-test new ingredients behind your ear first',
    'report.am': 'Morning',
    'report.pm': 'Evening',
    'report.weekly': 'Weekly',
    'report.lifeTitle': 'Lifestyle Tips',
    'report.medicalTitle': 'When to See a Doctor',
    'report.historyTitle': 'Trend History',
    'report.historySub': 'Data stays in this browser and is never uploaded',
    'report.historyEmpty':
      'This is your first record. Re-test under the same conditions (device, lighting, time of day) — trends are what matter.',
    'report.historyEarliest': 'Earliest',
    'report.historyLatest': 'Latest',
    'report.historyOverallChange': 'Overall score over time',
    'report.disclaimerTitle': 'Important Notice & Disclaimer',
    'report.disclaimer':
      'This report is generated automatically by in-browser image analysis. It measures surface optical features in visible-light photos and is not a medical examination. It cannot diagnose any disease and does not replace a dermatologist, dermoscopy or lab tests. The scores use a heuristic model intended for observing your own long-term trends under consistent lighting and device conditions; absolute values are not comparable across devices, lighting or skin tones. If you notice persistent redness, itching, pain, oozing, rapidly changing moles, or anything that worries you, please see a doctor promptly.',

    'compare.title': 'Compared with last scan',
    'compare.sub': 'Last scan {t} ({d} ago)',
    'compare.days': '{n} days',
    'compare.hours': '{n} hours',
    'compare.minutes': '{n} minutes',
    'compare.justNow': 'just now',
    'compare.overall': 'Overall',
    'compare.dim': 'Dimension changes',
    'compare.key': 'Key metric changes',
    'compare.up': 'up',
    'compare.down': 'down',
    'compare.flat': 'steady',
    'compare.metric.redness': 'Redness area',
    'compare.metric.blemish': 'Blemish density',
    'compare.metric.shine': 'Oil shine',
    'compare.metric.spot': 'Dark spots',
    'compare.metric.pore': 'Pore density',
    'compare.metric.line': 'Forehead lines',

    'actions.print': 'Print / PDF',
    'actions.png': 'Download image',
    'actions.share': 'Share card',
    'actions.json': 'Export JSON',
    'actions.copy': 'Copy summary',
    'actions.clear': 'Clear history',
    'actions.again': 'Scan again',
    'actions.toastPng': 'Annotated image exported (current layer)',
    'actions.toastJson': 'Full data JSON exported',
    'actions.toastCopy': 'Summary copied to clipboard',
    'actions.toastCopyFallback': 'Clipboard unavailable — downloaded as a text file instead',
    'actions.toastClear': 'Local history cleared',
    'actions.toastShareReady': 'Share card ready',
    'actions.toastShareFail': 'Failed to generate the share card',
    'actions.toastLang': 'Language switched to {lang}',

    'share.title': 'Skin Health Report',
    'share.overall': 'OVERALL',
    'share.grade': 'Grade',
    'share.skinType': 'Skin type',
    'share.tone': 'Tone',
    'share.topFindings': 'Key findings',
    'share.scanCode': 'Scan to try',
    'share.disclaimer': 'In-browser analysis · skincare reference only · not medical diagnosis',

    'layer.roi': 'Analysis zones',
    'layer.roiHint': 'Anatomical zones actually sampled by the algorithm',
    'layer.redness': 'Redness / irritation',
    'layer.rednessHint': 'Areas redder than your own baseline',
    'layer.blemish': 'Blemishes / papules',
    'layer.blemishHint': 'Localized redness bumps',
    'layer.shine': 'Oil shine',
    'layer.shineHint': 'Specular (sebum) reflection areas',
    'layer.spot': 'Dark spots',
    'layer.spotHint': 'Areas clearly darker than surrounding skin',
    'layer.pore': 'Pores / roughness',
    'layer.poreHint': 'Mid-scale bumps and dents',
    'layer.line': 'Fine lines',
    'layer.lineHint': 'Strong gradient lines',
    'layer.unit': 'zones',
  },
};

/* 合并额外语言词典的 ui 部分（advice/dim/roi/table 由 scoring/report 各自读取） */
for (const [code, mod] of Object.entries(EXTRA)) {
  DICT[code] = mod.ui;
}
