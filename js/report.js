/**
 * report.js —— 报告渲染、图表绘制与导出（支持中英文）
 *
 * 全部图表用 Canvas 2D 手绘，不依赖任何第三方图表库。
 * 语言相关文案通过 i18n（L）与 scoring 的 lang 参数获取；
 * renderReport(root, ctx, lang) 会按当前语言重建所有文案。
 */

import { L } from './i18n.js';
import {
  DIMENSIONS,
  gradeOf,
  classifySkinType,
  buildAdvice,
  detailRows,
  lifestyleTips,
  dimensionLabel,
} from './scoring.js';

/* ------------------------------ 图标 ------------------------------ */
const ICONS = {
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/>',
  drop: '<path d="M12 3s6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 9.5 12 3 12 3z"/>',
  grid: '<path d="M4 4h16v16H4z"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  arrowUp: '<path d="M12 20V5"/><path d="M6 11l6-6 6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  water: '<path d="M12 3s6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 9.5 12 3 12 3z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
  hand: '<path d="M9 11V5.5a1.5 1.5 0 1 1 3 0V11"/><path d="M12 11V4.5a1.5 1.5 0 1 1 3 0V11"/><path d="M15 11V6.5a1.5 1.5 0 1 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6v-3.5a1.5 1.5 0 1 1 3 0"/><path d="M6 11V8.5"/>',
  alert: '<path d="M12 3l9.5 17h-19L12 3z"/><path d="M12 9v5M12 17.5v.5"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  spark: '<path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5 12 3z"/>',
  clipboard: '<path d="M9 4h6v3H9z"/><path d="M7 5H5v16h14V5h-2"/><path d="M8.5 12h7M8.5 16h4"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v12H4z"/><circle cx="12" cy="13" r="3.4"/>',
  download: '<path d="M12 4v11"/><path d="M7.5 11L12 15.5 16.5 11"/><path d="M5 19h14"/>',
  printer: '<path d="M7 9V3h10v6"/><path d="M5 9h14v8h-3v4H8v-4H5z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v4.5h-4.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  share: '<circle cx="6" cy="12" r="2.6"/><circle cx="17.5" cy="5.5" r="2.6"/><circle cx="17.5" cy="18.5" r="2.6"/><path d="M8.3 10.8l6.9-4M8.3 13.2l6.9 4"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    ICONS[name] || ICONS.info
  }</svg>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------ 颜色 ------------------------------ */
export function scoreColor(score) {
  if (score >= 85) return '#34d399';
  if (score >= 70) return '#4ade80';
  if (score >= 55) return '#fbbf24';
  if (score >= 40) return '#fb923c';
  return '#f87171';
}

/* 报告页局部文案（历史表头、分区名等） */
const RTXT = {
  zh: { histTime: '时间', histOverall: '综合', histDelta: '较上次', pxUnit: '像素' },
  en: { histTime: 'Time', histOverall: 'Overall', histDelta: 'Delta', pxUnit: 'px' },
};

const ROI_LABELS = {
  zh: {
    forehead: '额头',
    glabella: '眉间',
    eyeLeft: '左眼',
    eyeRight: '右眼',
    underEyeLeft: '左下眼睑',
    underEyeRight: '右下眼睑',
    crowLeft: '左鱼尾',
    crowRight: '右鱼尾',
    cheekLeft: '左颧颊',
    cheekRight: '右颧颊',
    nose: '鼻部',
    perioral: '口周',
    chin: '下巴',
    nasolabialLeft: '左法令纹',
    nasolabialRight: '右法令纹',
  },
  en: {
    forehead: 'Forehead',
    glabella: 'Glabella',
    eyeLeft: 'Left eye',
    eyeRight: 'Right eye',
    underEyeLeft: 'Left under-eye',
    underEyeRight: 'Right under-eye',
    crowLeft: 'Left crow',
    crowRight: 'Right crow',
    cheekLeft: 'Left cheek',
    cheekRight: 'Right cheek',
    nose: 'Nose',
    perioral: 'Perioral',
    chin: 'Chin',
    nasolabialLeft: 'Left fold',
    nasolabialRight: 'Right fold',
  },
};

const LAYER_KEYS = [
  ['roi', [255, 255, 255]],
  ['redness', [255, 77, 109]],
  ['blemish', [244, 63, 94]],
  ['shine', [56, 189, 248]],
  ['spot', [245, 158, 11]],
  ['pore', [168, 85, 247]],
  ['line', [34, 211, 238]],
];

/* ======================================================================
   报告主体
   ====================================================================== */
export function renderReport(root, ctx, lang = 'zh') {
  const { result, scores, tone, timestamp, history } = ctx;
  const m = result.metrics;
  const grade = gradeOf(scores.overall, lang);
  const skinType = classifySkinType(m, scores, lang);
  const advice = buildAdvice(m, scores, skinType, tone, lang);
  const rows = detailRows(m, tone, scores, lang);

  const overall = scores.overall;
  const R = 66;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - overall / 100);
  const t = (key, vars) => L(lang, key, vars);

  root.innerHTML = `
    <div class="card report-head">
      <div class="score-ring">
        <svg viewBox="0 0 168 168">
          <circle class="track" cx="84" cy="84" r="${R}"></circle>
          <circle class="value" cx="84" cy="84" r="${R}"
            stroke="${scoreColor(overall)}"
            stroke-dasharray="${C.toFixed(2)}"
            stroke-dashoffset="${C.toFixed(2)}"
            data-offset="${offset.toFixed(2)}"></circle>
        </svg>
        <div class="inner">
          <div class="num" style="color:${scoreColor(overall)}">${overall.toFixed(0)}</div>
          <div class="of">${t('report.overall')}</div>
        </div>
      </div>

      <div class="head-info">
        <h2>${t('report.title')}</h2>
        <div class="grade-line">
          <span class="pill score" style="color:${scoreColor(overall)};border-color:${scoreColor(overall)}55;background:${scoreColor(overall)}14">
            ${esc(grade.label)}
          </span>
          <span class="pill">${esc(skinType.type)}</span>
          <span class="pill">${lang === 'en' ? 'Tone' : '肤色'} · ${esc(tone.name)}</span>
        </div>
        <div class="meta">
          <span>${t('report.time')} <b>${new Date(timestamp).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}</b></span>
          <span>${t('report.frames')} <b>${result.frames || 1} ${t('report.frameUnit')}</b></span>
          <span>${t('report.quality')} <b>${result.quality.score.toFixed(0)} / 100</b></span>
          <span>${t('report.coverage')} <b>${(m.skinCoverage * 100).toFixed(1)}%</b></span>
        </div>
        ${
          result.quality.warnings.length
            ? `<div class="quality-banner">${icon('alert')}<div>
                 ${esc(t('report.qualityWarn', { list: result.quality.warnings.map((w) => esc(w.text)).join('；') }))}
               </div></div>`
            : ''
        }
      </div>
    </div>

    ${renderCompare(ctx, lang)}

    <div class="card section">
      <div class="section-head">
        <h3><span class="num">1</span>${t('report.dimTitle')}</h3>
        <p>${t('report.dimSub')}</p>
      </div>
      <div class="radar-wrap">
        <div class="radar-canvas"><canvas id="radar"></canvas></div>
        <div class="radar-legend" id="radar-legend"></div>
      </div>
    </div>

    <div class="card section">
      <div class="section-head">
        <h3><span class="num">2</span>${t('report.dimDetailTitle')}</h3>
        <p>${t('report.dimDetailSub')}</p>
      </div>
      <div class="dim-grid" id="dim-grid"></div>
    </div>

    ${renderConcerns(advice, lang)}

    <div class="card section">
      <div class="section-head">
        <h3><span class="num">4</span>${t('report.dataTitle')}</h3>
        <p>${t('report.dataSub')}</p>
      </div>
      <div class="table-wrap"><table class="data" id="data-table"></table></div>
    </div>

    <div class="card section">
      <div class="section-head">
        <h3><span class="num">5</span>${t('report.evidenceTitle')}</h3>
        <p>${t('report.evidenceSub')}</p>
      </div>
      <div class="evidence">
        <canvas id="evidence"></canvas>
        <div class="layer-list" id="layer-list"></div>
      </div>
    </div>

    ${renderRoutine(advice, lang)}
    ${renderLifestyle(lang)}
    ${renderMedical(advice, lang)}
    ${renderHistoryBlock(history, lang)}

    <div class="disclaimer">
      <b>${t('report.disclaimerTitle')}</b>
      ${esc(t('report.disclaimer'))}
    </div>
  `;

  renderLegend(root.querySelector('#radar-legend'), scores.dimensions, lang);
  renderDimCards(root.querySelector('#dim-grid'), scores, m, lang);
  renderDataTable(root.querySelector('#data-table'), rows, lang);
  renderEvidence(root.querySelector('#evidence'), root.querySelector('#layer-list'), ctx, lang);
  renderSpark(root.querySelector('#spark'), history, lang);

  // 雷达图与评分环动画
  requestAnimationFrame(() => {
    drawRadar(root.querySelector('#radar'), scores.dimensions, lang);
    const ring = root.querySelector('.score-ring .value');
    if (ring) ring.style.strokeDashoffset = ring.dataset.offset;
    root.querySelectorAll('.dim-bar i, .legend-row .track i').forEach((el) => {
      el.style.width = el.dataset.w + '%';
    });
  });
}

/** 报告已渲染后窗口尺寸变化时重绘雷达图 */
export function redrawRadar(root, dimensions, lang = 'zh') {
  const c = root.querySelector('#radar');
  if (c) drawRadar(c, dimensions, lang);
}

/* ------------------------------ 与上次对比 ------------------------------ */
function renderCompare(ctx, lang) {
  const prev = ctx.prev;
  if (!prev || !prev.dimensions) return '';

  const t = (key, vars) => L(lang, key, vars);
  const cur = ctx.scores;

  const diffMs = ctx.timestamp - prev.ts;
  let diffText;
  if (diffMs < 60 * 1000) diffText = t('compare.justNow');
  else if (diffMs < 3600 * 1000) diffText = t('compare.minutes', { n: Math.max(1, Math.round(diffMs / 60000)) });
  else if (diffMs < 86400 * 1000) diffText = t('compare.hours', { n: Math.max(1, Math.round(diffMs / 3600000)) });
  else diffText = t('compare.days', { n: Math.max(1, Math.round(diffMs / 86400000)) });

  const arrow = (d0, signed = true, suffix = '') => {
    const sign = d0 > 0 ? '+' : '';
    const abs = Math.abs(d0).toFixed(suffix === '%' ? 2 : 1);
    const glyph = d0 > 0 ? '▲' : d0 < 0 ? '▼' : '▪';
    return `${glyph} ${signed && d0 > 0 ? sign : ''}${abs}${suffix}`;
  };

  // 维度（分数越高越好 → 差值为正 = 变好）
  const dimChips = DIMENSIONS.map((d) => {
    const d0 = cur.dimensions[d.key] - prev.dimensions[d.key];
    return `
      <div class="cmp-chip">
        <span class="cmp-delta ${d0 >= 0 ? 'good' : 'bad'}">${arrow(d0)}</span>
        <span class="cmp-name">${esc(dimensionLabel(d.key, lang))}</span>
      </div>`;
  }).join('');

  // 关键指标（百分比，越低越好 → 差值为负 = 变好）
  const keys = ['redness', 'blemish', 'shine', 'spot', 'pore', 'line'];
  const metricChips = keys
    .map((k) => {
      const a = prev.key && prev.key[k] !== undefined ? prev.key[k] : null;
      const b = ctx.keyPct ? ctx.keyPct[k] : null;
      if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return '';
      const d0 = b - a;
      return `
        <div class="cmp-chip">
          <span class="cmp-delta ${d0 <= 0 ? 'good' : 'bad'}">${arrow(d0, true, '%')}</span>
          <span class="cmp-name">${esc(t(`compare.metric.${k}`))}</span>
        </div>`;
    })
    .join('');

  const overallDelta = cur.overall - prev.overall;

  return `
    <div class="card section compare">
      <div class="section-head">
        <h3><span class="num">★</span>${t('compare.title')}</h3>
        <p>${t('compare.sub', {
          t: new Date(prev.ts).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false }),
          d: diffText,
        })}</p>
      </div>
      <div class="cmp-overall">
        <div class="cmp-chip big">
          <span class="cmp-delta ${overallDelta >= 0 ? 'good' : 'bad'}">${arrow(overallDelta)}</span>
          <span class="cmp-name">${t('compare.overall')}</span>
        </div>
      </div>
      <div class="cmp-block">
        <h4>${t('compare.dim')}</h4>
        <div class="cmp-grid">${dimChips}</div>
      </div>
      ${metricChips ? `<div class="cmp-block"><h4>${t('compare.key')}</h4><div class="cmp-grid">${metricChips}</div></div>` : ''}
    </div>`;
}

/* ------------------------------ 关注项 ------------------------------ */
function renderConcerns(advice, lang) {
  const t = (key, vars) => L(lang, key, vars);
  if (!advice.concerns.length) {
    return `
      <div class="card section">
        <div class="section-head"><h3><span class="num">3</span>${t('report.concernTitle')}</h3></div>
        <div class="history-empty">${t('report.concernEmpty')}</div>
      </div>`;
  }

  const sevLabel = { high: t('report.sevHigh'), mid: t('report.sevMid'), low: t('report.sevLow') };

  const items = advice.concerns
    .map(
      (c) => `
      <div class="concern ${c.severity}">
        <div class="concern-head">
          <h4>${esc(c.title)}</h4>
          <span class="sev ${c.severity}">${sevLabel[c.severity] || ''}</span>
        </div>
        <p>${esc(c.desc)}</p>
        <div class="ing-grid">
          ${c.ingredients
            .map(([name, note]) => `<div class="ing"><b>${esc(name)}</b><span>${esc(note)}</span></div>`)
            .join('')}
        </div>
        <div class="avoid-row">
          <b>${t('report.avoidLabel')}</b>
          <div class="tags">${c.avoid.map((a) => `<span class="tag">${esc(a)}</span>`).join('')}</div>
        </div>
        <div class="action-row">${icon('spark')}<div>${esc(c.action)}</div></div>
      </div>`,
    )
    .join('');

  return `
    <div class="card section">
      <div class="section-head">
        <h3><span class="num">3</span>${t('report.concernTitle')}</h3>
        <p>${t('report.concernSub', { n: advice.concerns.length })}</p>
      </div>
      ${items}
    </div>`;
}

/* ------------------------------ 护理流程 ------------------------------ */
function renderRoutine(advice, lang) {
  const t = (key) => L(lang, key);
  const col = (title, iconName, rows) => `
    <div class="routine-col">
      <h4>${icon(iconName)}${title}</h4>
      <div class="steps">
        ${rows
          .map(
            (r, i) => `
          <div class="step-item">
            <div class="idx">${i + 1}</div>
            <div class="st-name">${esc(r.step)}</div>
            <div class="st-text">${esc(r.text)}</div>
          </div>`,
          )
          .join('')}
      </div>
    </div>`;

  return `
    <div class="card section">
      <div class="section-head">
        <h3><span class="num">6</span>${t('report.routineTitle')}</h3>
        <p>${t('report.routineSub')}</p>
      </div>
      <div class="routine-grid">
        ${col(t('report.am'), 'sun', advice.routine.am)}
        ${col(t('report.pm'), 'moon', advice.routine.pm)}
        <div class="routine-col">
          <h4>${icon('water')}${t('report.weekly')}</h4>
          <div class="bullet-list">
            ${advice.routine.weekly.map((x) => `<div>${icon('check')}<span>${esc(x)}</span></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

/* ------------------------------ 生活方式 ------------------------------ */
function renderLifestyle(lang) {
  const tips = lifestyleTips(lang);
  const t = (key) => L(lang, key);
  return `
    <div class="card section">
      <div class="section-head"><h3><span class="num">7</span>${t('report.lifeTitle')}</h3></div>
      <div class="tip-grid">
        ${tips
          .map((x) => `<div class="tip"><h5>${icon(x.icon)}${esc(x.title)}</h5><p>${esc(x.text)}</p></div>`)
          .join('')}
      </div>
    </div>`;
}

/* ------------------------------ 就医提示 ------------------------------ */
function renderMedical(advice, lang) {
  const t = (key) => L(lang, key);
  return `
    <div class="card section medical">
      <div class="section-head"><h3><span class="num">8</span>${t('report.medicalTitle')}</h3></div>
      <ul>${advice.seeDoctor.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>`;
}

/* ------------------------------ 历史 ------------------------------ */
function renderHistoryBlock(history, lang) {
  const t = (key) => L(lang, key);
  const has = history && history.length > 1;
  return `
    <div class="card section">
      <div class="section-head">
        <h3><span class="num">9</span>${t('report.historyTitle')}</h3>
        <p>${t('report.historySub')}</p>
      </div>
      ${
        has
          ? `<div class="spark-wrap"><canvas id="spark"></canvas>
               <div class="spark-legend"><span>${t('report.historyEarliest')}</span><span>${t('report.historyOverallChange')}</span><span>${t('report.historyLatest')}</span></div>
             </div>
             <div class="table-wrap"><table class="hist" id="hist-table"></table></div>`
          : `<div class="history-empty">${t('report.historyEmpty')}</div>`
      }
    </div>`;
}

/* ======================================================================
   图表
   ====================================================================== */

/** 六维雷达图 */
function drawRadar(canvas, dims, lang) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth || 360;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = size * 0.33;
  const n = DIMENSIONS.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  // 网格
  g.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring++) {
    const r = (radius * ring) / 4;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = angle(i % n);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath();
    g.strokeStyle = ring === 4 ? 'rgba(120,165,235,0.34)' : 'rgba(120,165,235,0.14)';
    g.stroke();
  }

  // 轴线
  for (let i = 0; i < n; i++) {
    const a = angle(i);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    g.strokeStyle = 'rgba(120,165,235,0.16)';
    g.stroke();
  }

  // 数据多边形
  const pts = DIMENSIONS.map((d, i) => {
    const v = Math.max(3, dims[d.key]) / 100;
    const a = angle(i);
    return [cx + Math.cos(a) * radius * v, cy + Math.sin(a) * radius * v];
  });

  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, 'rgba(34,211,238,0.42)');
  grad.addColorStop(1, 'rgba(78,168,255,0.24)');

  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = '#4ea8ff';
  g.lineWidth = 2;
  g.stroke();

  pts.forEach(([x, y]) => {
    g.beginPath();
    g.arc(x, y, 3.6, 0, Math.PI * 2);
    g.fillStyle = '#0b1220';
    g.fill();
    g.strokeStyle = '#7cc4ff';
    g.lineWidth = 2;
    g.stroke();
  });

  // 标签
  const fontEn = lang === 'en';
  g.font = `600 ${fontEn ? 10.5 : 12}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  DIMENSIONS.forEach((d, i) => {
    const a = angle(i);
    const lx = cx + Math.cos(a) * (radius + 30);
    const ly = cy + Math.sin(a) * (radius + 24);
    g.fillStyle = '#93a4c4';
    g.fillText(dimensionLabel(d.key, lang), lx, ly - 6);
    g.fillStyle = scoreColor(dims[d.key]);
    g.font = '700 13px -apple-system, "PingFang SC", sans-serif';
    g.fillText(dims[d.key].toFixed(0), lx, ly + 9);
    g.font = `600 ${fontEn ? 10.5 : 12}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  });
}

function renderLegend(el, dims, lang) {
  el.innerHTML = DIMENSIONS.map(
    (d) => `
    <div class="legend-row">
      <span>${esc(dimensionLabel(d.key, lang))}</span>
      <span class="track"><i data-w="${dims[d.key].toFixed(1)}" style="background:${scoreColor(dims[d.key])}"></i></span>
      <span class="n" style="color:${scoreColor(dims[d.key])}">${dims[d.key].toFixed(0)}</span>
    </div>`,
  ).join('');
}

/** 维度描述文案 */
function dimensionDesc(key, lang) {
  const descs = {
    zh: {
      calmness: '泛红、炎症、痘印等刺激信号',
      oilBalance: '皮脂分泌与干燥缺水倾向',
      smoothness: '皮肤纹理、毛孔与粗糙程度',
      evenness: '色斑、色素沉积与肤色一致度',
      firmness: '细纹、干纹与纹路深度',
      radiance: '暗沉、发黄与通透感',
      eye: '下眼睑与颧颊的亮度差',
    },
    en: {
      calmness: 'Redness, irritation and blemish signals',
      oilBalance: 'Sebum production and dryness tendency',
      smoothness: 'Skin texture, pores and roughness',
      evenness: 'Dark spots, pigmentation and tone uniformity',
      firmness: 'Fine lines and wrinkle depth',
      radiance: 'Dullness, sallowness and glow',
      eye: 'Lightness difference between lower eyelid and cheek',
    },
  };
  return (descs[lang === 'en' ? 'en' : 'zh'] || descs.zh)[key] || key;
}

function renderDimCards(el, scores, m, lang) {
  const notes = {
    calmness: () =>
      `${(m.rednessRatio * 100).toFixed(1)}% ${lang === 'en' ? 'red ·' : '区域泛红 ·'} ${(m.blemishRatio * 100).toFixed(1)}% ${lang === 'en' ? 'spots' : '局部红点'}`,
    oilBalance: () =>
      `${(m.shineRatio * 100).toFixed(1)}% ${lang === 'en' ? 'shine · T' : '反光 · T区'} ${(m.tzoneShine * 100).toFixed(1)}% / ${lang === 'en' ? 'cheek' : '颊'} ${(m.cheekShine * 100).toFixed(1)}%`,
    smoothness: () => `${lang === 'en' ? 'texture' : '纹理'} ${m.textureCheek.toFixed(2)} · ${lang === 'en' ? 'pores' : '毛孔'} ${(m.poreDensity * 100).toFixed(1)}%`,
    evenness: () =>
      `${lang === 'en' ? 'spots' : '暗斑'} ${(m.spotRatio * 100).toFixed(1)}% · σL* ${(m.faceLstdMatte ?? m.faceLstd).toFixed(1)}`,
    firmness: () =>
      `${(m.lineDensityForehead * 100).toFixed(1)}% / ${(m.lineDensityCrow * 100).toFixed(1)}% / ${(m.lineDensityNasolabial * 100).toFixed(1)}%`,
    radiance: () => `L* ${m.faceL.toFixed(1)} · b* ${m.sallowness.toFixed(1)}`,
  };

  let html = DIMENSIONS.map(
    (d) => `
    <div class="dim-card">
      <div class="dim-top">
        <span class="name">${icon(d.icon)}${esc(dimensionLabel(d.key, lang))}</span>
        <span class="val" style="color:${scoreColor(scores.dimensions[d.key])}">${scores.dimensions[d.key].toFixed(0)}</span>
      </div>
      <div class="dim-bar"><i data-w="${scores.dimensions[d.key].toFixed(1)}" style="background:${scoreColor(scores.dimensions[d.key])}"></i></div>
      <p>${esc(dimensionDesc(d.key, lang))}<br><span style="color:#7c8bab">${notes[d.key]()}</span></p>
    </div>`,
  ).join('');

  if (scores.darkCircle !== null) {
    html += `
      <div class="dim-card">
        <div class="dim-top">
          <span class="name">${icon('moon')}${esc(dimensionLabel('eye', lang))}</span>
          <span class="val" style="color:${scoreColor(scores.darkCircle)}">${scores.darkCircle.toFixed(0)}</span>
        </div>
        <div class="dim-bar"><i data-w="${scores.darkCircle.toFixed(1)}" style="background:${scoreColor(scores.darkCircle)}"></i></div>
        <p>${esc(dimensionDesc('eye', lang))}<br><span style="color:#7c8bab">ΔL* ${Number.isFinite(m.undereyeDelta) ? m.undereyeDelta.toFixed(1) : '—'}</span></p>
      </div>`;
  }

  el.innerHTML = html;
}

function renderDataTable(table, rows, lang) {
  const head = {
    zh: ['测量指标', '读数', '对应得分', '指标含义'],
    en: ['Metric', 'Reading', 'Score', 'What it means'],
  }[lang === 'en' ? 'en' : 'zh'];
  table.innerHTML = `
    <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows
        .map(
          (r) => `
        <tr>
          <td>${esc(r.name)}</td>
          <td class="val">${esc(r.value)}</td>
          <td class="val">${
            r.score === null || r.score === undefined
              ? '—'
              : `<span class="mini-bar"><i data-w="${r.score.toFixed(1)}" style="background:${scoreColor(r.score)}"></i></span><span style="color:${scoreColor(r.score)}">${r.score.toFixed(0)}</span>`
          }</td>
          <td class="hint">${esc(r.hint)}</td>
        </tr>`,
        )
        .join('')}
    </tbody>`;
  requestAnimationFrame(() => {
    table.querySelectorAll('.mini-bar i').forEach((el) => (el.style.width = el.dataset.w + '%'));
  });
}

/* ------------------------------ 影像证据 ------------------------------ */
function renderEvidence(canvas, layerList, ctx, lang) {
  let current = 'roi';
  const src = ctx.result;
  const image = ctx.capture.imageData;

  const counts = {};
  for (const [key] of LAYER_KEYS) {
    if (key === 'roi' || !src.maps[key]) {
      counts[key] = 0;
      continue;
    }
    const mask = src.maps[key];
    let c = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) c++;
    counts[key] = c;
  }

  const draw = () => {
    drawEvidence(canvas, image, src, current, lang);
  };

  layerList.innerHTML = LAYER_KEYS.map(
    ([key, color]) => `
      <button class="layer-btn${key === current ? ' active' : ''}" data-layer="${key}">
        <span class="swatch" style="background:${
          key === 'roi' ? 'linear-gradient(135deg,#4ea8ff,#22d3ee)' : `rgb(${color.join(',')})`
        }"></span>
        <span>${esc(L(lang, `layer.${key}`))}</span>
        <span class="cnt">${key === 'roi' ? esc(L(lang, 'layer.unit')) : counts[key].toLocaleString() + ' ' + RTXT[lang === 'en' ? 'en' : 'zh'].pxUnit}</span>
      </button>`,
  ).join('');

  layerList.querySelectorAll('.layer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      current = btn.dataset.layer;
      layerList.querySelectorAll('.layer-btn').forEach((b) => b.classList.toggle('active', b === btn));
      draw();
    });
  });

  requestAnimationFrame(draw);
  window.addEventListener('resize', draw, { passive: true });
  return { redraw: draw };
}

function drawEvidence(canvas, image, result, layerKey, lang) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = image.width;
  const H = image.height;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = `${W} / ${H}`;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const base = new ImageData(new Uint8ClampedArray(image.data), W, H);

  if (layerKey === 'roi') {
    g.putImageData(base, 0, 0);
  } else {
    const mask = result.maps[layerKey];
    const entry = LAYER_KEYS.find(([k]) => k === layerKey);
    const [r, gr, b] = entry ? entry[1] : [255, 255, 255];
    const d = base.data;
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      const y = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      const gray = y * 0.4 + 26; // 底图压暗，热区更突出
      if (mask[i]) {
        d[p] = d[p] * 0.28 + r * 0.72;
        d[p + 1] = d[p + 1] * 0.28 + gr * 0.72;
        d[p + 2] = d[p + 2] * 0.28 + b * 0.72;
      } else {
        d[p] = gray;
        d[p + 1] = gray;
        d[p + 2] = gray;
      }
    }
    g.putImageData(base, 0, 0);
  }

  // 分区轮廓
  const roi = result.rois;
  const highlight = new Set(
    {
      redness: ['cheekLeft', 'cheekRight'],
      blemish: ['cheekLeft', 'cheekRight', 'forehead'],
      shine: ['forehead', 'nose', 'glabella'],
      spot: ['cheekLeft', 'cheekRight', 'forehead'],
      pore: ['nose', 'cheekLeft', 'cheekRight'],
      line: ['forehead', 'crowLeft', 'crowRight', 'nasolabialLeft', 'nasolabialRight'],
    }[layerKey] || [],
  );

  g.lineWidth = Math.max(1, W / 520);
  g.font = `${Math.max(9, W / 46)}px -apple-system, "PingFang SC", sans-serif`;
  g.textBaseline = 'bottom';

  for (const [name, r] of Object.entries(roi)) {
    if (name === 'face') continue;
    if (layerKey !== 'roi' && !highlight.has(name)) continue;
    const on = layerKey === 'roi' || highlight.has(name);
    g.strokeStyle = on ? 'rgba(124,196,255,0.92)' : 'rgba(124,196,255,0.3)';
    g.setLineDash(on ? [] : [W / 160, W / 200]);
    g.strokeRect(r.x0 + 0.5, r.y0 + 0.5, r.x1 - r.x0 - 1, r.y1 - r.y0 - 1);
    g.setLineDash([]);
    if (on && layerKey === 'roi') {
      const label = (ROI_LABELS[lang === 'en' ? 'en' : 'zh'] || ROI_LABELS.zh)[name] || name;
      const tw = g.measureText(label).width;
      g.fillStyle = 'rgba(6,12,24,0.72)';
      g.fillRect(r.x0, r.y0 - Math.max(13, W / 40), tw + 8, Math.max(13, W / 40));
      g.fillStyle = 'rgba(160,210,255,0.95)';
      g.fillText(label, r.x0 + 4, r.y0 - 3);
    }
  }
}

/* ------------------------------ 历史趋势 ------------------------------ */
function renderSpark(canvas, history, lang) {
  if (!canvas || !history || history.length < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || 600;
  const H = 128;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);

  const pad = { l: 30, r: 12, t: 14, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = history.length;
  const x = (i) => pad.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => pad.t + ih * (1 - v / 100);

  g.strokeStyle = 'rgba(120,165,235,0.12)';
  g.lineWidth = 1;
  g.font = '10px -apple-system, sans-serif';
  g.fillStyle = '#64748b';
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (const v of [0, 25, 50, 75, 100]) {
    const yy = y(v);
    g.beginPath();
    g.moveTo(pad.l, yy);
    g.lineTo(W - pad.r, yy);
    g.stroke();
    g.fillText(String(v), pad.l - 6, yy);
  }

  g.beginPath();
  history.forEach((h, i) => (i === 0 ? g.moveTo(x(i), y(h.overall)) : g.lineTo(x(i), y(h.overall))));
  g.strokeStyle = '#4ea8ff';
  g.lineWidth = 2.2;
  g.lineJoin = 'round';
  g.stroke();

  const areaGrad = g.createLinearGradient(0, pad.t, 0, pad.t + ih);
  areaGrad.addColorStop(0, 'rgba(78,168,255,0.28)');
  areaGrad.addColorStop(1, 'rgba(78,168,255,0)');
  g.lineTo(x(n - 1), pad.t + ih);
  g.lineTo(x(0), pad.t + ih);
  g.closePath();
  g.fillStyle = areaGrad;
  g.fill();

  history.forEach((h, i) => {
    g.beginPath();
    g.arc(x(i), y(h.overall), i === n - 1 ? 5 : 3, 0, Math.PI * 2);
    g.fillStyle = i === n - 1 ? scoreColor(h.overall) : '#0b1220';
    g.fill();
    g.strokeStyle = scoreColor(h.overall);
    g.lineWidth = 2;
    g.stroke();
  });

  // 历史表格
  const table = document.getElementById('hist-table');
  if (table) {
    const rtxt = RTXT[lang === 'en' ? 'en' : 'zh'];
    const rows = [...history].reverse();
    table.innerHTML = `
      <thead><tr><th>${rtxt.histTime}</th><th>${rtxt.histOverall}</th><th>${rtxt.histDelta}</th>${DIMENSIONS.map(
        (d) => `<th>${esc(dimensionLabel(d.key, lang))}</th>`,
      ).join('')}</tr></thead>
      <tbody>
        ${rows
          .map((h, i) => {
            const p = rows[i + 1];
            const d0 = p ? h.overall - p.overall : null;
            const cls = d0 === null ? '' : d0 > 0.5 ? 'up' : d0 < -0.5 ? 'down' : '';
            const txt = d0 === null ? '—' : `${d0 > 0 ? '+' : ''}${d0.toFixed(1)}`;
            const dim = (k) =>
              h.dimensions && h.dimensions[k] !== undefined
                ? `<td style="color:${scoreColor(h.dimensions[k])}">${h.dimensions[k].toFixed(0)}</td>`
                : '<td>—</td>';
            return `<tr>
              <td>${new Date(h.ts).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
              <td style="color:${scoreColor(h.overall)};font-weight:700">${h.overall.toFixed(1)}</td>
              <td class="delta ${cls}">${txt}</td>
              ${dim('calmness')}${dim('oilBalance')}${dim('smoothness')}${dim('evenness')}${dim('firmness')}${dim('radiance')}
            </tr>`;
          })
          .join('')}
      </tbody>`;
  }
}

/* ======================================================================
   导出
   ====================================================================== */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportJSON(ctx, lang = 'zh') {
  const m = ctx.result.metrics;
  const skinType = classifySkinType(m, ctx.scores, lang);
  const advice = buildAdvice(m, ctx.scores, skinType, ctx.tone, lang);
  const payload = {
    生成时间: new Date(ctx.timestamp).toISOString(),
    版本: 'skin-health-scanner/2.0',
    语言: lang === 'en' ? 'English' : '中文',
    说明: '本文件由浏览器端图像分析生成，非医学诊断。',
    综合评分: Number(ctx.scores.overall.toFixed(2)),
    评级: gradeOf(ctx.scores.overall, lang).label,
    维度得分: Object.fromEntries(
      Object.entries(ctx.scores.dimensions).map(([k, v]) => [k, Number(v.toFixed(2))]),
    ),
    黑眼圈得分: ctx.scores.darkCircle === null ? null : Number(ctx.scores.darkCircle.toFixed(2)),
    肤质判定: skinType.type,
    肤色: { 描述: ctx.tone.name, ITA角度: Number(ctx.tone.ita.toFixed(2)) },
    原始测量值: Object.fromEntries(
      Object.entries(m).map(([k, v]) => [k, Number.isFinite(v) ? Number(v.toFixed(5)) : null]),
    ),
    检测阈值: ctx.result.thresholds,
    采样质量: ctx.result.quality,
    关注项: advice.concerns.map((c) => ({
      标题: c.title,
      优先级: c.severity,
      说明: c.desc,
      建议成分: c.ingredients.map((i) => i[0]),
      避免: c.avoid,
      行动建议: c.action,
    })),
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `skin-report_${stamp(ctx.timestamp)}.json`,
  );
}

export function exportPhoto(canvas, timestamp) {
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `skin-analysis_${stamp(timestamp)}.png`);
  }, 'image/png');
}

export function summaryText(ctx, lang = 'zh') {
  const m = ctx.result.metrics;
  const skinType = classifySkinType(m, ctx.scores, lang);
  const advice = buildAdvice(m, ctx.scores, skinType, ctx.tone, lang);
  const L0 = [];
  L0.push(lang === 'en' ? '[Facial Skin Health Report]' : '【面部皮肤健康报告】');
  L0.push(`${lang === 'en' ? 'Time' : '时间'}：${new Date(ctx.timestamp).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}`);
  L0.push(`${lang === 'en' ? 'Overall' : '综合评分'}：${ctx.scores.overall.toFixed(1)} / 100（${gradeOf(ctx.scores.overall, lang).label}）`);
  L0.push(`${lang === 'en' ? 'Skin type' : '肤质判定'}：${skinType.type}　${lang === 'en' ? 'Tone' : '肤色'}：${ctx.tone.name}`);
  L0.push('');
  L0.push(lang === 'en' ? 'Six dimensions:' : '六维得分：');
  for (const d of DIMENSIONS) L0.push(`　· ${dimensionLabel(d.key, lang)}：${ctx.scores.dimensions[d.key].toFixed(0)}`);
  if (ctx.scores.darkCircle !== null) L0.push(`　· ${dimensionLabel('eye', lang)}：${ctx.scores.darkCircle.toFixed(0)}`);
  L0.push('');
  L0.push(lang === 'en' ? 'Key readings:' : '关键读数：');
  L0.push(`　· ${lang === 'en' ? 'Redness' : '泛红占比'} ${(m.rednessRatio * 100).toFixed(1)}%`);
  L0.push(`　· ${lang === 'en' ? 'Oil shine' : '镜面反光'} ${(m.shineRatio * 100).toFixed(1)}%`);
  L0.push(`　· ${lang === 'en' ? 'Pore density' : '毛孔密度'} ${(m.poreDensity * 100).toFixed(1)}%`);
  L0.push(`　· ${lang === 'en' ? 'Dark spots' : '色素暗斑'} ${(m.spotRatio * 100).toFixed(1)}%`);
  L0.push(`　· ${lang === 'en' ? 'Forehead lines' : '额头横纹'} ${(m.lineDensityForehead * 100).toFixed(1)}%`);
  if (advice.concerns.length) {
    L0.push('');
    L0.push(lang === 'en' ? 'Key findings:' : '重点关注：');
    for (const c of advice.concerns) L0.push(`　· ${c.title}：${c.action}`);
  }
  L0.push('');
  L0.push(
    lang === 'en'
      ? '※ Generated by in-browser image analysis; skincare reference only, not medical diagnosis.'
      : '※ 本报告由浏览器端图像分析生成，仅供护肤参考，不构成医学诊断。',
  );
  return L0.join('\n');
}

function stamp(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
