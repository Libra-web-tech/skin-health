/**
 * app.js —— 应用主控：摄像头授权、实时引导、多帧采集、报告生成
 *
 * 支持中英文切换：语言状态存 localStorage，切换后整个界面与报告即时重渲染。
 */

import { analyzeFrame, aggregateFrames, boxJitter, quickFaceBox } from './vision.js';
import { scoreAll, classifySkinType } from './scoring.js';
import {
  renderReport,
  redrawRadar,
  exportJSON,
  exportPhoto,
  summaryText,
  downloadBlob,
} from './report.js';
import { shareCard, buildShareCard } from './sharecard.js';
import { L, getLang, setLang, applyStaticLang, LANGS, localeOf } from './i18n.js';
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
  btnLang: $('btn-lang'),
  langMenu: $('lang-menu'),
  langWrap: $('lang-wrap'),
  btnPrint: $('btn-print'),
  btnPng: $('btn-png'),
  btnShare: $('btn-share'),
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
  secureWarn: $('secure-warn'),
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
  highRes: true,
};

let lang = getLang();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = (key, vars) => L(lang, key, vars);
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function currentStep() {
  for (const [k, node] of Object.entries(el.steps)) if (node.classList.contains('active')) return k;
  return 'unknown';
}

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
const ERROR_KEYS = {
  NotAllowedError: ['err.notAllowedTitle', 'err.notAllowedDesc', 'err.notAllowedHint'],
  NotFoundError: ['err.notFoundTitle', 'err.notFoundDesc', 'err.notFoundHint'],
  NotReadableError: ['err.notReadableTitle', 'err.notReadableDesc', 'err.notReadableHint'],
  OverconstrainedError: ['err.overconstrainedTitle', 'err.overconstrainedDesc', 'err.overconstrainedHint'],
  SecurityError: ['err.securityTitle', 'err.securityDesc', 'err.securityHint'],
  UnsupportedError: ['err.unsupportedTitle', 'err.unsupportedDesc', 'err.unsupportedHint'],
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
    for (const tr of state.stream.getTracks()) tr.stop();
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

  // 人脸
  setStatus('face', res.ok ? 'pass' : 'fail', res.ok ? t('cam.faceYes') : t('cam.faceNo'));

  // 光线
  const lum = res.lum;
  if (lum < 55) setStatus('light', 'warn', t('cam.lightLow'));
  else if (lum > 208) setStatus('light', 'warn', t('cam.lightHigh'));
  else setStatus('light', 'pass', t('cam.lightOk'));

  // 距离
  let sizeState = 'fail';
  let sizeText = t('cam.sizeTooFar');
  if (res.ok) {
    const ratio = (res.box.x1 - res.box.x0) / lw;
    if (ratio >= 0.3) {
      sizeState = 'pass';
      sizeText = t('cam.sizeOk');
    } else if (ratio >= 0.2) {
      sizeState = 'warn';
      sizeText = t('cam.sizeFar');
    }
    el.guideFrame.classList.toggle('ok', ratio >= 0.3);
  } else {
    sizeText = t('cam.na');
    el.guideFrame.classList.remove('ok');
  }
  setStatus('size', sizeState, sizeText);

  // 稳定性
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
    if (jitter < 0.025) setStatus('still', 'pass', t('cam.stillOk'));
    else if (jitter < 0.06) setStatus('still', 'warn', t('cam.stillWarn'));
    else setStatus('still', 'fail', t('cam.stillBad'));
  } else {
    setStatus('still', '', t('cam.na'));
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
    const Lc = Math.min(22, (b.x1 - b.x0) * sx * 0.2);
    og.lineWidth = 3;
    const corners = [
      [b.x0 * sx, b.y0 * sy, 1, 1],
      [b.x1 * sx, b.y0 * sy, -1, 1],
      [b.x0 * sx, b.y1 * sy, 1, -1],
      [b.x1 * sx, b.y1 * sy, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      og.beginPath();
      og.moveTo(x + dx * Lc, y);
      og.lineTo(x, y);
      og.lineTo(x, y + dy * Lc);
      og.stroke();
    }
  }
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
  el.progressTitle.textContent = t('analyzing.capture');
  setProgress(0.02, t('cam.countdownHint'));

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
      setProgress(0.1 + i * 0.12, t('analyzing.captureFrame', { a: i + 1, b: 3 }));
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
  el.progressTitle.textContent = t('analyzing.scan');
  const results = [];
  for (let i = 0; i < state.captures.length; i++) {
    setProgress(
      0.5 + (i * 0.45) / state.captures.length,
      t('analyzing.frame', { a: i + 1, b: state.captures.length }),
    );
    await sleep(40);
    results.push(analyzeFrame(state.captures[i]));
  }

  setProgress(0.97, t('analyzing.final'));
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
    agg.quality.warnings.push({ code: 'shake', text: t('quality.shake') });
  }

  if (agg.quality.blockers.length) {
    state.busy = false;
    el.btnCapture.disabled = false;
    showStep('camera');
    el.qualityPanel.style.display = '';
    el.qualityList.innerHTML = agg.quality.blockers
      .map((b) => `<li>${escHtml(L(lang, `quality.${b.code}`) || b.text)}</li>`)
      .join('');
    toast(t('fail.qualityToast'));
    return;
  }

  buildReport(agg, results);
  setProgress(1, t('analyzing.done'));
  showStep('report');
  state.busy = false;
  el.btnCapture.disabled = false;
}

function showFailure(reason) {
  showStep('camera');
  el.qualityPanel.style.display = '';
  el.qualityList.innerHTML = `<li>${escHtml(L(lang, `fail.${reason}`) || t('fail.default'))}</li>`;
  toast(t('fail.toast'));
}

/* ======================================================================
   报告
   ====================================================================== */
function buildReport(agg, results) {
  const baseIdx = Math.max(0, results.findIndex((r) => r.ok));
  const metrics = agg.metrics;
  const scores = scoreAll(metrics);
  const timestamp = Date.now();

  // 关键指标（百分比），供"与上次对比"使用
  const keyPct = {
    redness: +(metrics.rednessRatio * 100).toFixed(2),
    blemish: +(metrics.blemishRatio * 100).toFixed(2),
    shine: +(metrics.shineRatio * 100).toFixed(2),
    spot: +(metrics.spotRatio * 100).toFixed(2),
    pore: +(metrics.poreDensity * 100).toFixed(2),
    line: +(metrics.lineDensityForehead * 100).toFixed(2),
  };

  const skinTypeForRecord = classifySkinType(metrics, scores, lang);
  const recordCtx = { result: agg, scores, tone: agg.tone, timestamp, skinType: skinTypeForRecord };
  const history = pushHistory(makeRecord(recordCtx));

  const ctx = {
    result: agg,
    scores,
    tone: agg.tone,
    timestamp,
    capture: { imageData: state.captures[baseIdx] || state.captures[0] },
    history,
    prev: history.length > 1 ? history[history.length - 2] : null,
    keyPct,
  };
  state.ctx = ctx;

  renderReport(el.reportRoot, ctx, lang);
  el.btnPng.disabled = false;
}

/* ======================================================================
   错误界面
   ====================================================================== */
function showError(err, extra) {
  const keys = ERROR_KEYS[err.name] || ['err.defaultTitle', 'err.defaultDesc', 'err.defaultHint'];
  el.errorTitle.textContent = t(keys[0]);
  el.errorDesc.textContent = extra || t(keys[1]);
  const hints = L(lang, keys[2]);
  const hintList = Array.isArray(hints) ? hints : [hints];
  el.errorHint.innerHTML = `<b>${t('err.hintLabel')}</b><ol>${hintList
    .map((h) => `<li>${escHtml(h)}</li>`)
    .join('')}</ol>`;
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
  toast(t('actions.toastPng'));
});

el.btnShare.addEventListener('click', async () => {
  if (!state.ctx) return;
  const result = await shareCard(state.ctx, lang);
  if (result === 'failed') toast(t('actions.toastShareFail'));
  else if (result !== 'cancelled') toast(t('actions.toastShareReady'));
});

el.btnJson.addEventListener('click', () => {
  if (!state.ctx) return;
  exportJSON(state.ctx, lang);
  toast(t('actions.toastJson'));
});

el.btnCopy.addEventListener('click', async () => {
  if (!state.ctx) return;
  const text = summaryText(state.ctx, lang);
  try {
    await navigator.clipboard.writeText(text);
    toast(t('actions.toastCopy'));
  } catch {
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'skin-report-summary.txt');
    toast(t('actions.toastCopyFallback'));
  }
});

el.btnClear.addEventListener('click', () => {
  clearHistory();
  if (state.ctx) {
    state.ctx.history = [];
    state.ctx.prev = null;
    renderReport(el.reportRoot, state.ctx, lang);
  }
  toast(t('actions.toastClear'));
});

el.btnOverride.addEventListener('click', async () => {
  // 质量不达标但用户坚持查看：用已有结果生成报告，并在报告中标注提醒
  if (!state.captures.length) return;
  el.qualityPanel.style.display = 'none';
  showStep('analyzing');
  setProgress(0.6, t('analyzing.forced'));
  await sleep(50);
  const results = state.captures.map(analyzeFrame);
  const agg = aggregateFrames(results);
  if (!agg) {
    showFailure('no_face');
    return;
  }
  agg.quality.warnings.unshift({ code: 'forced', text: t('quality.forced') });
  buildReport(agg, results);
  showStep('report');
});

/* ------------------------------ 语言切换 ------------------------------ */
function buildLangMenu() {
  el.langMenu.innerHTML = Object.entries(LANGS)
    .map(
      ([code, name]) =>
        `<button class="lang-item${code === lang ? ' active' : ''}" data-lang="${code}">${escHtml(name)}</button>`,
    )
    .join('');
}

function closeLangMenu() {
  el.langMenu.hidden = true;
}

function switchLanguage(code) {
  closeLangMenu();
  if (!LANGS[code] || code === lang) return;
  lang = code;
  setLang(lang);
  applyStaticLang(lang);
  el.btnLang.textContent = LANGS[lang];
  buildLangMenu();
  if (state.ctx && currentStep() === 'report') {
    renderReport(el.reportRoot, state.ctx, lang);
  }
  toast(t('actions.toastLang', { lang: LANGS[lang] }));
}

el.btnLang.addEventListener('click', (e) => {
  e.stopPropagation();
  el.langMenu.hidden = !el.langMenu.hidden;
});

el.langMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('.lang-item');
  if (btn) switchLanguage(btn.dataset.lang);
});

document.addEventListener('click', (e) => {
  if (!el.langMenu.hidden && !e.target.closest('.lang-wrap')) closeLangMenu();
});

window.addEventListener('resize', () => {
  if (state.ctx) redrawRadar(el.reportRoot, state.ctx.scores.dimensions, lang);
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

/* ======================================================================
   端到端测试钩子（无头浏览器用）
   ====================================================================== */
if (new URLSearchParams(location.search).has('autotest')) {
  window.__E2E__ = { state: 'starting', step: 'welcome' };
  window.__makeShareCard = async () => {
    if (!state.ctx) return null;
    const c = await buildShareCard(state.ctx, lang);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let non = 0;
    for (let i = 0; i < d.length; i += 4 * 317) if (d[i] + d[i + 1] + d[i + 2] > 30) non++;
    return { w: c.width, h: c.height, nonBlank: non };
  };
  const mark = (stateName, extra) => {
    window.__E2E__ = { state: stateName, step: currentStep(), ...extra };
  };
  (async () => {
    try {
      await sleep(200);
      try {
        await bootCamera();
        mark('scanning-camera');
        await runScan();
      } catch (camErr) {
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

/* 首次进入 */
(function init() {
  lang = getLang();
  applyStaticLang(lang);
  el.btnLang.textContent = LANGS[lang];
  buildLangMenu();

  const h = loadHistory();
  const note = $('history-note');
  if (note && h.length) {
    note.textContent = t('welcome.historyNote', {
      n: h.length,
      t: new Date(h[h.length - 1].ts).toLocaleString(localeOf(lang), { hour12: false }),
    });
  }
  if (!window.isSecureContext) {
    el.secureWarn.style.display = '';
    el.secureWarn.querySelector('div').innerHTML = L(lang, 'welcome.secureWarn').replace(
      '{install}',
      `<a href="/install" style="color:#9dc9ff"><b>${L(lang, 'welcome.secureWarnInstall')}</b></a>`,
    );
  }
})();
