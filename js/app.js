/**
 * app.js —— 应用主控：摄像头授权、实时引导、多帧采集、报告生成
 */

import { analyzeFrame, aggregateFrames, boxJitter, quickFaceBox } from './vision.js';
import { scoreAll, classifySkinType, buildAdvice, detailRows } from './scoring.js';
import {
  renderReport,
  redrawRadar,
  exportJSON,
  exportPhoto,
  summaryText,
  downloadBlob,
} from './report.js';
import { loadHistory, pushHistory, clearHistory, makeRecord } from './history.js';

/* ------------------------------ DOM ------------------------------ */
const $ = (id) => document.getElementById(id);

const el = {
  steps: {
    welcome: $('step-welcome'),
    camera: $('step-camera'),
    analyzing: $('step-analyzing'),
    report: $('step-report'),
    error: $('step-error'),
  },
  video: $('video'),
  overlay: $('overlay'),
  liveCanvas: $('live-canvas'),
  viewport: $('viewport'),
  guideFrame: $('guide-frame'),
  countdown: $('countdown'),
  flash: $('flash'),
  status: {
    face: $('st-face'),
    light: $('st-light'),
    size: $('st-size'),
    still: $('st-still'),
  },
  btnStart: $('btn-start'),
  btnCapture: $('btn-capture'),
  btnStop: $('btn-stop'),
  btnRetry: $('btn-retry'),
  btnPrint: $('btn-print'),
  btnPng: $('btn-png'),
  btnJson: $('btn-json'),
  btnCopy: $('btn-copy'),
  btnAgain: $('btn-again'),
  btnClear: $('btn-clear'),
  reportRoot: $('report-root'),
  errorTitle: $('error-title'),
  errorDesc: $('error-desc'),
  errorHint: $('error-hint'),
  progressFill: $('progress-fill'),
  progressNote: $('progress-note'),
  progressTitle: $('progress-title'),
  qualityPanel: $('quality-panel'),
  qualityList: $('quality-list'),
  btnOverride: $('btn-override'),
  toast: $('toast'),
};

/* ------------------------------ 状态 ------------------------------ */
const state = {
  stream: null,
  liveTimer: null,
  busy: false,
  active: false,
  captures: [],
  recentBoxes: [],
  ctx: null,
  overlayDraw: null,
  highRes: true,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function showStep(name) {
  for (const [k, node] of Object.entries(el.steps)) node.classList.toggle('active', k === name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let toastTimer = null;
function toast(msg, ms = 2600) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}

/* ======================================================================
   摄像头
   ====================================================================== */
const ERRORS = {
  NotAllowedError: {
    title: '摄像头权限被拒绝',
    desc: '浏览器阻止了摄像头访问。本网站需要摄像头权限才能进行皮肤分析，视频画面只在本机处理，不会上传。',
    hint: [
      '点击浏览器地址栏左侧的锁形 / 摄像头图标，把"摄像头"改为"允许"',
      '刷新页面后重新点击"开始检测"',
      '如果之前点了"阻止"，浏览器会记住这个选择，必须手动改回',
      '企业设备可能被系统策略禁止，请改用个人设备或联系管理员',
    ],
  },
  NotFoundError: {
    title: '没有检测到摄像头',
    desc: '系统未找到可用的视频输入设备。',
    hint: [
      '确认设备有摄像头，且没有被物理遮挡或开关关闭',
      '外接摄像头请检查 USB 连接',
      '关闭远程桌面 / 虚拟机后重试',
    ],
  },
  NotReadableError: {
    title: '摄像头被占用',
    desc: '摄像头已被其它程序（会议软件、直播工具、相机应用）独占。',
    hint: ['关闭腾讯会议 / Zoom / OBS / 相机等正在使用摄像头的程序', '稍等几秒后点击"重试"'],
  },
  OverconstrainedError: {
    title: '摄像头不支持所需分辨率',
    desc: '设备无法提供请求的视频参数。',
    hint: ['点击"重试"，我们会自动降级到更宽松的参数'],
  },
  SecurityError: {
    title: '当前环境不允许访问摄像头',
    desc: '浏览器只允许在安全上下文中使用摄像头。',
    hint: [
      '请通过 http://localhost 或 https:// 打开本页面，不要用 file:// 直接打开',
      '本项目自带本地服务器：在项目目录执行 node serve.mjs',
    ],
  },
  UnsupportedError: {
    title: '浏览器不支持摄像头接口',
    desc: '当前浏览器没有提供 getUserMedia API。',
    hint: ['请使用较新版本的 Chrome、Edge、Firefox 或 Safari', 'iOS 上必须使用 Safari，第三方浏览器内核可能不支持'],
  },
};

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const e = new Error('unsupported');
    e.name = 'UnsupportedError';
    throw e;
  }
  const video = state.highRes
    ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
    : { facingMode: 'user' };

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (err) {
    // 参数过严时自动降级重试一次
    if (err && (err.name === 'OverconstrainedError' || err.name === 'TypeError') && state.highRes) {
      state.highRes = false;
      state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    } else {
      throw err;
    }
  }

  el.video.srcObject = state.stream;
  await el.video.play().catch(() => {});
  await new Promise((resolve) => {
    if (el.video.videoWidth) return resolve();
    el.video.addEventListener('loadedmetadata', resolve, { once: true });
    setTimeout(resolve, 2500);
  });

  const vw = el.video.videoWidth || 1280;
  const vh = el.video.videoHeight || 720;
  el.viewport.style.aspectRatio = `${vw} / ${vh}`;
  // 实时检测画布与显示画面保持相同宽高比，避免拉伸影响人脸定位
  el.liveCanvas.width = 240;
  el.liveCanvas.height = Math.round((240 * vh) / vw);
  el.overlay.width = 240;
  el.overlay.height = Math.round((240 * vh) / vw);
  el.overlay.style.aspectRatio = `${vw} / ${vh}`;

  state.active = true;
  state.highRes = true;
  state.recentBoxes = [];
  startLiveLoop();
}

function stopCamera() {
  state.active = false;
  clearInterval(state.liveTimer);
  state.liveTimer = null;
  if (state.stream) {
    for (const t of state.stream.getTracks()) t.stop();
    state.stream = null;
  }
  el.video.srcObject = null;
}

/* ------------------------------ 实时引导 ------------------------------ */
function startLiveLoop() {
  clearInterval(state.liveTimer);
  state.liveTimer = setInterval(liveTick, 240);
  liveTick();
}

function liveTick() {
  if (!state.active || state.busy || !el.video.videoWidth) return;

  const lw = el.liveCanvas.width;
  const lh = el.liveCanvas.height;
  const g = el.liveCanvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(el.video, 0, 0, lw, lh);

  let res;
  try {
    res = quickFaceBox(g.getImageData(0, 0, lw, lh));
  } catch {
    return;
  }

  const vw = el.video.videoWidth;
  const vh = el.video.videoHeight;

  // 人脸
  setStatus('face', res.ok ? 'pass' : 'fail', res.ok ? '已检测到' : '未检测到');

  // 光线
  const lum = res.lum;
  if (lum < 55) setStatus('light', 'warn', '偏暗');
  else if (lum > 208) setStatus('light', 'warn', '偏亮');
  else setStatus('light', 'pass', '良好');

  // 距离
  let sizeState = 'fail';
  let sizeText = '太远';
  if (res.ok) {
    const ratio = (res.box.x1 - res.box.x0) / lw;
    if (ratio >= 0.3) {
      sizeState = 'pass';
      sizeText = '合适';
    } else if (ratio >= 0.2) {
      sizeState = 'warn';
      sizeText = '稍远';
    }
    el.guideFrame.classList.toggle('ok', ratio >= 0.3);
  } else {
    sizeText = '—';
    el.guideFrame.classList.remove('ok');
  }
  setStatus('size', sizeState, sizeText);

  // 稳定性（最近若干帧包围盒抖动）
  if (res.ok) {
    state.recentBoxes.push({ x: (res.box.x0 + res.box.x1) / 2, w: res.box.x1 - res.box.x0 });
    if (state.recentBoxes.length > 5) state.recentBoxes.shift();
  } else {
    state.recentBoxes.length = 0;
  }
  if (state.recentBoxes.length >= 3) {
    const xs = state.recentBoxes.map((b) => b.x);
    const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length);
    const w = state.recentBoxes[state.recentBoxes.length - 1].w || 1;
    const jitter = sd / w;
    if (jitter < 0.025) setStatus('still', 'pass', '稳定');
    else if (jitter < 0.06) setStatus('still', 'warn', '轻微晃动');
    else setStatus('still', 'fail', '请保持不动');
  } else {
    setStatus('still', '', '—');
  }

  // 覆盖层：人脸框
  const og = el.overlay.getContext('2d');
  og.clearRect(0, 0, el.overlay.width, el.overlay.height);
  if (res.ok) {
    const sx = el.overlay.width / lw;
    const sy = el.overlay.height / lh;
    const b = res.box;
    og.strokeStyle = sizeState === 'pass' ? 'rgba(52,211,153,0.95)' : 'rgba(251,191,36,0.95)';
    og.lineWidth = 2;
    og.setLineDash([7, 5]);
    og.strokeRect(b.x0 * sx, b.y0 * sy, (b.x1 - b.x0) * sx, (b.y1 - b.y0) * sy);
    og.setLineDash([]);
    // 四角
    const L = Math.min(22, (b.x1 - b.x0) * sx * 0.2);
    og.lineWidth = 3;
    const corners = [
      [b.x0 * sx, b.y0 * sy, 1, 1],
      [b.x1 * sx, b.y0 * sy, -1, 1],
      [b.x0 * sx, b.y1 * sy, 1, -1],
      [b.x1 * sx, b.y1 * sy, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      og.beginPath();
      og.moveTo(x + dx * L, y);
      og.lineTo(x, y);
      og.lineTo(x, y + dy * L);
      og.stroke();
    }
  }
  void vw;
  void vh;
}

function setStatus(key, level, text) {
  const node = el.status[key];
  if (!node) return;
  node.className = 'status-item' + (level ? ' ' + level : '');
  const v = node.querySelector('.value');
  if (v && v.textContent !== text) v.textContent = text;
}

/* ======================================================================
   采集与分析
   ====================================================================== */
function captureFrame() {
  const vw = el.video.videoWidth;
  const vh = el.video.videoHeight;
  const scale = Math.min(1, 720 / vw);
  const cw = Math.max(64, Math.round(vw * scale));
  const ch = Math.max(64, Math.round(vh * scale));

  const c = state.captureCanvas || (state.captureCanvas = document.createElement('canvas'));
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.save();
  // 镜像绘制，与用户看到的预览一致（自拍视角）
  g.translate(cw, 0);
  g.scale(-1, 1);
  g.drawImage(el.video, 0, 0, cw, ch);
  g.restore();
  return g.getImageData(0, 0, cw, ch);
}

function flash() {
  el.flash.classList.remove('fire');
  void el.flash.offsetWidth;
  el.flash.classList.add('fire');
}

function setProgress(ratio, note) {
  el.progressFill.style.width = `${Math.round(ratio * 100)}%`;
  if (note) el.progressNote.textContent = note;
}

async function runScan() {
  if (state.busy) return;
  if (!state.active) {
    await bootCamera();
    return;
  }
  state.busy = true;
  el.btnCapture.disabled = true;
  el.qualityPanel.style.display = 'none';
  showStep('analyzing');
  el.progressTitle.textContent = '正在采集画面';
  setProgress(0.02, '请保持不动，大约需要 5 秒');

  try {
    /* ---- 倒计时 ---- */
    for (let i = 3; i > 0; i--) {
      el.countdown.innerHTML = `<span>${i}</span>`;
      await sleep(620);
    }
    el.countdown.innerHTML = '';

    /* ---- 采集 3 帧 ---- */
    state.captures = [];
    for (let i = 0; i < 3; i++) {
      setProgress(0.1 + i * 0.12, `采集第 ${i + 1} / 3 帧`);
      await sleep(60);
      flash();
      state.captures.push(captureFrame());
      await sleep(340);
    }

    await analyzeCaptures();
  } catch (err) {
    console.error(err);
    state.busy = false;
    el.btnCapture.disabled = false;
    showError({ name: 'UnknownError' }, String(err && err.message ? err.message : err));
  }
}

/** 分析已采集的帧并生成报告（采集与分析分离，便于测试与"强制生成"复用） */
async function analyzeCaptures() {
  el.progressTitle.textContent = '正在分析皮肤特征';
  const results = [];
  for (let i = 0; i < state.captures.length; i++) {
    setProgress(0.5 + (i * 0.45) / state.captures.length, `分析第 ${i + 1} / ${state.captures.length} 帧（泛红 · 油光 · 纹理 · 色斑 · 纹路）`);
    await sleep(40);
    results.push(analyzeFrame(state.captures[i]));
  }

  setProgress(0.97, '汇总评分与护理建议');
  await sleep(40);

  const valid = results.filter((r) => r.ok);
  if (!valid.length) {
    state.busy = false;
    el.btnCapture.disabled = false;
    showFailure(results[0] ? results[0].reason : 'no_face');
    return;
  }

  const agg = aggregateFrames(results);
  const jitter = boxJitter(results);
  if (jitter > 0.1) {
    agg.quality.warnings.push({ code: 'shake', text: '检测到画面晃动较大，部分指标可能存在偏差，建议重新拍摄' });
  }

  if (agg.quality.blockers.length) {
    state.busy = false;
    el.btnCapture.disabled = false;
    showStep('camera');
    el.qualityPanel.style.display = '';
    el.qualityList.innerHTML = agg.quality.blockers.map((b) => `<li>${b.text}</li>`).join('');
    toast('采样质量不达标，请按提示调整后重试');
    return;
  }

  buildReport(agg, results);
  setProgress(1, '完成');
  showStep('report');
  state.busy = false;
  el.btnCapture.disabled = false;
}

function showFailure(reason) {
  const map = {
    no_face: '未能识别到人脸区域。请正对镜头、露出完整面部，并避免背景中出现大面积与肤色相近的物体。',
    face_too_small: '人脸在画面中太小，请靠近摄像头后重试。',
    face_occluded: '面部被头发、口罩、手或镜框遮挡过多，请调整后重试。',
    invalid_frame: '画面数据无效，请刷新页面后重试。',
  };
  showStep('camera');
  el.qualityPanel.style.display = '';
  el.qualityList.innerHTML = `<li>${map[reason] || '画面无法分析，请调整姿势与光线后重试。'}</li>`;
  toast('本次采集未能完成分析');
}

/* ======================================================================
   报告
   ====================================================================== */
function buildReport(agg, results) {
  const baseIdx = Math.max(0, results.findIndex((r) => r.ok));
  const metrics = agg.metrics;
  const scores = scoreAll(metrics);
  const skinType = classifySkinType(metrics, scores);
  const advice = buildAdvice(metrics, scores, skinType, agg.tone);
  const rows = detailRows(metrics, agg.tone, scores);
  const timestamp = Date.now();

  const ctx = {
    result: agg,
    scores,
    skinType,
    advice,
    rows,
    tone: agg.tone,
    timestamp,
    capture: { imageData: state.captures[baseIdx] || state.captures[0] },
  };

  const history = pushHistory(makeRecord(ctx));
  ctx.history = history;
  state.ctx = ctx;

  renderReport(el.reportRoot, ctx);
  el.btnPng.disabled = false;
}

/* ======================================================================
   错误界面
   ====================================================================== */
function showError(err, extra) {
  const info = ERRORS[err.name] || {
    title: '无法启动摄像头',
    desc: extra || '发生未知错误，请刷新页面后重试。',
    hint: ['刷新页面重试', '确认浏览器为最新版本', '尝试使用 Chrome 或 Edge'],
  };
  el.errorTitle.textContent = info.title;
  el.errorDesc.textContent = info.desc;
  el.errorHint.innerHTML = `<b>可以尝试：</b><ol>${info.hint.map((h) => `<li>${h}</li>`).join('')}</ol>`;
  showStep('error');
}

async function bootCamera() {
  try {
    await startCamera();
    showStep('camera');
    state.busy = false;
  } catch (err) {
    console.error(err);
    state.busy = false;
    showError(err);
  }
}

/* ======================================================================
   事件绑定
   ====================================================================== */
el.btnStart.addEventListener('click', async () => {
  el.btnStart.disabled = true;
  state.busy = true;
  await bootCamera();
  el.btnStart.disabled = false;
});

el.btnRetry.addEventListener('click', async () => {
  state.highRes = false; // 重试时用更宽松的参数
  state.busy = true;
  await bootCamera();
});

el.btnCapture.addEventListener('click', runScan);

el.btnStop.addEventListener('click', () => {
  stopCamera();
  showStep('welcome');
});

el.btnAgain.addEventListener('click', async () => {
  el.qualityPanel.style.display = 'none';
  if (!state.active) await bootCamera();
  else showStep('camera');
});

el.btnPrint.addEventListener('click', () => window.print());

el.btnPng.addEventListener('click', () => {
  const canvas = el.reportRoot.querySelector('#evidence');
  if (!canvas || !state.ctx) return;
  exportPhoto(canvas, state.ctx.timestamp);
  toast('已导出标注图（当前图层）');
});

el.btnJson.addEventListener('click', () => {
  if (!state.ctx) return;
  exportJSON(state.ctx);
  toast('已导出完整数据 JSON');
});

el.btnCopy.addEventListener('click', async () => {
  if (!state.ctx) return;
  const text = summaryText(state.ctx);
  try {
    await navigator.clipboard.writeText(text);
    toast('报告摘要已复制到剪贴板');
  } catch {
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), '皮肤报告摘要.txt');
    toast('剪贴板不可用，已改为下载文本文件');
  }
});

el.btnClear.addEventListener('click', () => {
  clearHistory();
  if (state.ctx) {
    state.ctx.history = [];
    renderReport(el.reportRoot, state.ctx);
  }
  toast('本机历史记录已清除');
});

el.btnOverride.addEventListener('click', async () => {
  // 质量不达标但用户坚持查看：用已有结果生成报告，并在报告中标注提醒
  if (!state.captures.length) return;
  el.qualityPanel.style.display = 'none';
  showStep('analyzing');
  setProgress(0.6, '按当前画面生成报告…');
  await sleep(50);
  const results = state.captures.map(analyzeFrame);
  const agg = aggregateFrames(results);
  if (!agg) {
    showFailure('no_face');
    return;
  }
  agg.quality.warnings.unshift({ code: 'forced', text: '本次为质量不达标情况下强制生成，数据仅供参考' });
  buildReport(agg, results);
  showStep('report');
});

window.addEventListener('resize', () => {
  if (state.ctx) redrawRadar(el.reportRoot, state.ctx.scores.dimensions);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(state.liveTimer);
    state.liveTimer = null;
  } else if (state.active) {
    startLiveLoop();
  }
});

window.addEventListener('beforeunload', stopCamera);

/* 首次进入：若已有历史记录，在欢迎页给出提示 */
(function init() {
  const h = loadHistory();
  const note = $('history-note');
  if (note && h.length) {
    note.textContent = `本机已保存 ${h.length} 次检测记录，最新一次：${new Date(
      h[h.length - 1].ts,
    ).toLocaleString('zh-CN', { hour12: false })}`;
  }
  if (!window.isSecureContext) {
    const warn = $('secure-warn');
    if (warn) warn.style.display = '';
  }
})();

/* ======================================================================
   端到端测试钩子（无头浏览器用）
   ---------------------------------------------------------------------
   访问 index.html?autotest=1 时自动走完 授权 → 采集 → 分析 → 报告 全流程，
   并把状态写到 window.__E2E__，供 CDP 脚本轮询。
   若环境没有摄像头（例如无头浏览器未配置虚拟摄像头），则退化为
   使用内存中合成的一帧画面，用于验证"分析 + 报告渲染"链路。
   ====================================================================== */
if (new URLSearchParams(location.search).has('autotest')) {
  window.__E2E__ = { state: 'starting', step: 'welcome' };
  const mark = (state, extra) => {
    window.__E2E__ = { state, step: currentStep(), ...extra };
  };
  (async () => {
    try {
      await sleep(200);
      try {
        await bootCamera();
        mark('scanning-camera');
        await runScan();
      } catch (camErr) {
        // 无摄像头回退：合成一帧有脸的图像，直接验证分析与报告
        window.__E2E__.cameraError = String((camErr && camErr.name) || camErr);
        mark('scanning-synthetic');
        state.captures = [syntheticFrame()];
        showStep('analyzing');
        await analyzeCaptures();
      }
      mark(currentStep() === 'report' ? 'done' : 'blocked');
    } catch (e) {
      mark('error', { message: String((e && e.stack) || e) });
    }
  })();
}

function currentStep() {
  for (const [k, node] of Object.entries(el.steps)) if (node.classList.contains('active')) return k;
  return 'unknown';
}

/** 在内存中合成一帧带人脸的图像（仅用于端到端测试回退） */
function syntheticFrame() {
  const w = 480;
  const h = 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = 'rgb(68,86,104)';
  g.fillRect(0, 0, w, h);
  const grd = g.createRadialGradient(w / 2, 180, 20, w / 2, 190, 150);
  grd.addColorStop(0, 'rgb(226,180,152)');
  grd.addColorStop(1, 'rgb(168,126,102)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(w / 2, 190, 98, 132, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(250,246,242,0.85)';
  g.beginPath();
  g.ellipse(w / 2 - 32, 116, 26, 18, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(140,100,80,0.7)';
  g.lineWidth = 3;
  for (const y of [96, 116]) {
    g.beginPath();
    g.moveTo(w / 2 - 46, y);
    g.lineTo(w / 2 + 46, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(150,105,80,0.55)';
  for (const [sx, sy, r] of [
    [186, 214, 9],
    [292, 226, 8],
    [232, 168, 6],
  ]) {
    g.beginPath();
    g.arc(sx, sy, r, 0, Math.PI * 2);
    g.fill();
  }

  // 加入传感器噪声：完全平滑的合成图会被"清晰度"质量门判为模糊
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 7;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  return img;
}
