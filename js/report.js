/**
 * report.js —— 报告渲染、图表绘制与导出
 *
 * 全部图表用 Canvas 2D 手绘，不依赖任何第三方图表库。
 */

import { DIMENSIONS, gradeOf, lifestyleTips } from './scoring.js';

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

const LAYERS = {
  roi: { label: '分析区域', color: null, hint: '算法实际采样的解剖学分区' },
  redness: { label: '泛红 / 炎症', color: [255, 77, 109], hint: '红度高于自身基线的区域' },
  blemish: { label: '痘印 / 丘疹', color: [244, 63, 94], hint: '局部红度突起' },
  shine: { label: '油光 / 反光', color: [56, 189, 248], hint: '镜面反射（皮脂）区域' },
  spot: { label: '色斑 / 色素', color: [245, 158, 11], hint: '比周围皮肤明显暗的区域' },
  pore: { label: '毛孔 / 粗糙', color: [168, 85, 247], hint: '中尺度凹凸结构' },
  line: { label: '细纹 / 纹路', color: [34, 211, 238], hint: '强梯度线条' },
};

/* ======================================================================
   报告主体
   ====================================================================== */
export function renderReport(root, ctx) {
  const { scores, advice, skinType, tone, result, history } = ctx;
  const m = result.metrics;
  const overall = scores.overall;
  const R = 66;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - overall / 100);

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
          <div class="of">综合评分</div>
        </div>
      </div>

      <div class="head-info">
        <h2>面部皮肤健康报告</h2>
        <div class="grade-line">
          <span class="pill score" style="color:${scoreColor(overall)};border-color:${scoreColor(overall)}55;background:${scoreColor(overall)}14">
            ${esc(scores.grade.label)}
          </span>
          <span class="pill">${esc(skinType.type)}</span>
          <span class="pill">肤色 · ${esc(tone.name)}</span>
        </div>
        <div class="meta">
          <span>检测时间 <b>${new Date(ctx.timestamp).toLocaleString('zh-CN', { hour12: false })}</b></span>
          <span>分析帧数 <b>${result.frames || 1} 帧</b></span>
          <span>采样质量 <b>${result.quality.score.toFixed(0)} / 100</b></span>
          <span>面部覆盖 <b>${(m.skinCoverage * 100).toFixed(1)}%</b></span>
        </div>
        ${
          result.quality.warnings.length
            ? `<div class="quality-banner">${icon('alert')}<div>
                 <b>本次采样的影响因素：</b>${result.quality.warnings.map((w) => esc(w.text)).join('；')}。
                 相关指标仅供参考，建议在稳定光线下复测对比趋势。
               </div></div>`
            : ''
        }
      </div>
    </div>

    <div class="card section">
      <div class="section-head">
        <h3><span class="num">1</span>六维皮肤状态</h3>
        <p>分数越高越好，满分 100</p>
      </div>
      <div class="radar-wrap">
        <div class="radar-canvas"><canvas id="radar"></canvas></div>
        <div class="radar-legend" id="radar-legend"></div>
      </div>
    </div>

    <div class="card section">
      <div class="section-head">
        <h3><span class="num">2</span>维度详情</h3>
        <p>点击下方"测量数据"可查看每个分数背后的原始读数</p>
      </div>
      <div class="dim-grid" id="dim-grid"></div>
    </div>

    ${renderConcerns(advice)}

    <div class="card section">
      <div class="section-head">
        <h3><span class="num">4</span>测量数据</h3>
        <p>所有数值均来自本机浏览器内的图像分析，可直接复核</p>
      </div>
      <div class="table-wrap"><table class="data" id="data-table"></table></div>
    </div>

    <div class="card section">
      <div class="section-head">
        <h3><span class="num">5</span>影像证据</h3>
        <p>切换图层查看不同指标在脸上的分布</p>
      </div>
      <div class="evidence">
        <canvas id="evidence"></canvas>
        <div class="layer-list" id="layer-list"></div>
      </div>
    </div>

    ${renderRoutine(advice)}
    ${renderLifestyle()}
    ${renderMedical(advice)}
    ${renderHistoryBlock(history)}

    <div class="disclaimer">
      <b>重要说明与免责声明</b>
      本报告由浏览器内的图像分析算法自动生成，测量的是<b>可见光照片上的表面光学特征</b>，
      并非医学检查。它不能诊断任何疾病，也不能替代皮肤科医生的面诊、皮肤镜或实验室检查。
      评分采用启发式模型，适合用来观察<b>自身在相同光线与设备条件下的长期变化趋势</b>，
      不同设备、不同光线、不同肤色之间的绝对值不具备可比性。
      若皮肤出现持续红肿、瘙痒、疼痛、渗出、迅速变化的痣或任何让你担心的症状，请及时就医。
    </div>
  `;

  renderLegend(root.querySelector('#radar-legend'), scores.dimensions);
  renderDimCards(root.querySelector('#dim-grid'), scores, m);
  renderDataTable(root.querySelector('#data-table'), ctx);
  renderEvidence(root.querySelector('#evidence'), root.querySelector('#layer-list'), ctx);
  renderSpark(root.querySelector('#spark'), history);

  // 雷达图与评分环动画
  requestAnimationFrame(() => {
    drawRadar(root.querySelector('#radar'), scores.dimensions);
    const ring = root.querySelector('.score-ring .value');
    if (ring) ring.style.strokeDashoffset = ring.dataset.offset;
    root.querySelectorAll('.dim-bar i, .legend-row .track i').forEach((el) => {
      el.style.width = el.dataset.w + '%';
    });
  });
}

/** 报告已渲染后窗口尺寸变化时重绘雷达图 */
export function redrawRadar(root, dimensions) {
  const c = root.querySelector('#radar');
  if (c) drawRadar(c, dimensions);
}

/* ------------------------------ 关注项 ------------------------------ */
function renderConcerns(advice) {
  if (!advice.concerns.length) {
    return `
      <div class="card section">
        <div class="section-head"><h3><span class="num">3</span>重点关注</h3></div>
        <div class="history-empty">本次检测未发现明显异常项，继续保持现有的护肤习惯即可。</div>
      </div>`;
  }

  const sevLabel = { high: '优先处理', mid: '建议改善', low: '轻度关注' };

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
          <b>需要避免：</b>
          <div class="tags">${c.avoid.map((a) => `<span class="tag">${esc(a)}</span>`).join('')}</div>
        </div>
        <div class="action-row">${icon('spark')}<div>${esc(c.action)}</div></div>
      </div>`,
    )
    .join('');

  return `
    <div class="card section">
      <div class="section-head">
        <h3><span class="num">3</span>重点关注</h3>
        <p>共 ${advice.concerns.length} 项，按优先级排序</p>
      </div>
      ${items}
    </div>`;
}

/* ------------------------------ 护理流程 ------------------------------ */
function renderRoutine(advice) {
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
        <h3><span class="num">6</span>日常护理流程</h3>
        <p>根据本次检测结果生成 · 新成分请先做耳后试用</p>
      </div>
      <div class="routine-grid">
        ${col('早间流程', 'sun', advice.routine.am)}
        ${col('晚间流程', 'moon', advice.routine.pm)}
        <div class="routine-col">
          <h4>${icon('water')}每周维护</h4>
          <div class="bullet-list">
            ${advice.routine.weekly.map((t) => `<div>${icon('check')}<span>${esc(t)}</span></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

/* ------------------------------ 生活方式 ------------------------------ */
function renderLifestyle() {
  const tips = lifestyleTips();
  return `
    <div class="card section">
      <div class="section-head"><h3><span class="num">7</span>生活方式建议</h3></div>
      <div class="tip-grid">
        ${tips
          .map(
            (t) => `<div class="tip"><h5>${icon(t.icon)}${esc(t.title)}</h5><p>${esc(t.text)}</p></div>`,
          )
          .join('')}
      </div>
    </div>`;
}

/* ------------------------------ 就医提示 ------------------------------ */
function renderMedical(advice) {
  return `
    <div class="card section medical">
      <div class="section-head"><h3><span class="num">8</span>何时应该就医</h3></div>
      <ul>${advice.seeDoctor.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>`;
}

/* ------------------------------ 历史 ------------------------------ */
function renderHistoryBlock(history) {
  const has = history && history.length > 1;
  return `
    <div class="card section">
      <div class="section-head">
        <h3><span class="num">9</span>历史趋势</h3>
        <p>数据仅保存在本机浏览器，不会上传</p>
      </div>
      ${
        has
          ? `<div class="spark-wrap"><canvas id="spark"></canvas>
               <div class="spark-legend"><span>最早</span><span>综合评分变化</span><span>最近</span></div>
             </div>
             <div class="table-wrap"><table class="hist" id="hist-table"></table></div>`
          : `<div class="history-empty">这是第一条记录。保持相同的拍摄条件（同一设备、同一光线、同一时间）定期复测，趋势才有参考价值。</div>`
      }
    </div>`;
}

/* ======================================================================
   图表
   ====================================================================== */

/** 六维雷达图 */
function drawRadar(canvas, dims) {
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

  // 数据点
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
  g.font = '600 12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  DIMENSIONS.forEach((d, i) => {
    const a = angle(i);
    const lx = cx + Math.cos(a) * (radius + 30);
    const ly = cy + Math.sin(a) * (radius + 24);
    g.fillStyle = '#93a4c4';
    g.fillText(d.label, lx, ly - 6);
    g.fillStyle = scoreColor(dims[d.key]);
    g.font = '700 13px -apple-system, "PingFang SC", sans-serif';
    g.fillText(dims[d.key].toFixed(0), lx, ly + 9);
    g.font = '600 12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  });
}

function renderLegend(el, dims) {
  el.innerHTML = DIMENSIONS.map(
    (d) => `
    <div class="legend-row">
      <span>${d.label}</span>
      <span class="track"><i data-w="${dims[d.key].toFixed(1)}" style="background:${scoreColor(
        dims[d.key],
      )}"></i></span>
      <span class="n" style="color:${scoreColor(dims[d.key])}">${dims[d.key].toFixed(0)}</span>
    </div>`,
  ).join('');
}

function renderDimCards(el, scores, m) {
  const notes = {
    calmness: () =>
      `${(m.rednessRatio * 100).toFixed(1)}% 区域泛红 · ${(m.blemishRatio * 100).toFixed(1)}% 局部红点`,
    oilBalance: () =>
      `反光 ${(m.shineRatio * 100).toFixed(1)}% · T区 ${(m.tzoneShine * 100).toFixed(1)}% / 颊 ${(
        m.cheekShine * 100
      ).toFixed(1)}%`,
    smoothness: () => `纹理 ${m.textureCheek.toFixed(2)} · 毛孔 ${(m.poreDensity * 100).toFixed(1)}%`,
    evenness: () =>
      `暗斑 ${(m.spotRatio * 100).toFixed(1)}% · σL* ${(m.faceLstdMatte ?? m.faceLstd).toFixed(1)}`,
    firmness: () =>
      `额纹 ${(m.lineDensityForehead * 100).toFixed(1)}% · 鱼尾 ${(m.lineDensityCrow * 100).toFixed(
        1,
      )}% · 法令 ${(m.lineDensityNasolabial * 100).toFixed(1)}%`,
    radiance: () => `亮度 L* ${m.faceL.toFixed(1)} · 黄度 b* ${m.sallowness.toFixed(1)}`,
  };

  let html = DIMENSIONS.map(
    (d) => `
    <div class="dim-card">
      <div class="dim-top">
        <span class="name">${icon(d.icon)}${d.label}</span>
        <span class="val" style="color:${scoreColor(scores.dimensions[d.key])}">${scores.dimensions[
          d.key
        ].toFixed(0)}</span>
      </div>
      <div class="dim-bar"><i data-w="${scores.dimensions[d.key].toFixed(
        1,
      )}" style="background:${scoreColor(scores.dimensions[d.key])}"></i></div>
      <p>${d.desc}<br><span style="color:#7c8bab">${notes[d.key]()}</span></p>
    </div>`,
  ).join('');

  if (scores.darkCircle !== null) {
    html += `
      <div class="dim-card">
        <div class="dim-top">
          <span class="name">${icon('moon')}眼周状态</span>
          <span class="val" style="color:${scoreColor(scores.darkCircle)}">${scores.darkCircle.toFixed(
            0,
          )}</span>
        </div>
        <div class="dim-bar"><i data-w="${scores.darkCircle.toFixed(
          1,
        )}" style="background:${scoreColor(scores.darkCircle)}"></i></div>
        <p>下眼睑与颧颊的亮度差<br><span style="color:#7c8bab">ΔL* ${Number.isFinite(m.undereyeDelta) ? m.undereyeDelta.toFixed(1) : '—'}</span></p>
      </div>`;
  }

  el.innerHTML = html;
}

function renderDataTable(table, ctx) {
  const { rows } = ctx;
  table.innerHTML = `
    <thead><tr><th>测量指标</th><th>读数</th><th>对应得分</th><th>指标含义</th></tr></thead>
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
              : `<span class="mini-bar"><i data-w="${r.score.toFixed(1)}" style="background:${scoreColor(
                  r.score,
                )}"></i></span><span style="color:${scoreColor(r.score)}">${r.score.toFixed(0)}</span>`
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
function renderEvidence(canvas, layerList, ctx) {
  let current = 'roi';
  const src = ctx.result;
  const image = ctx.capture.imageData;

  const counts = {};
  for (const key of Object.keys(LAYERS)) {
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
    drawEvidence(canvas, image, src, LAYERS[current], current);
  };

  layerList.innerHTML = Object.entries(LAYERS)
    .map(
      ([key, l]) => `
      <button class="layer-btn${key === current ? ' active' : ''}" data-layer="${key}">
        <span class="swatch" style="background:${
          l.color ? `rgb(${l.color.join(',')})` : 'linear-gradient(135deg,#4ea8ff,#22d3ee)'
        }"></span>
        <span>${l.label}</span>
        <span class="cnt">${key === 'roi' ? '分区' : counts[key].toLocaleString() + ' px'}</span>
      </button>`,
    )
    .join('');

  layerList.querySelectorAll('.layer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      current = btn.dataset.layer;
      layerList.querySelectorAll('.layer-btn').forEach((b) => b.classList.toggle('active', b === btn));
      draw();
    });
  });

  // 尺寸就绪后再绘制，避免 clientWidth 为 0
  requestAnimationFrame(draw);
  window.addEventListener('resize', draw, { passive: true });
  return { redraw: draw };
}

function drawEvidence(canvas, image, result, layer, layerKey) {
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
    // 原图 + 分区框
    g.putImageData(base, 0, 0);
  } else {
    const mask = result.maps[layerKey];
    const [r, gr, b] = layer.color;
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
      const label = ROI_LABELS[name] || name;
      const tw = g.measureText(label).width;
      g.fillStyle = 'rgba(6,12,24,0.72)';
      g.fillRect(r.x0, r.y0 - Math.max(13, W / 40), tw + 8, Math.max(13, W / 40));
      g.fillStyle = 'rgba(160,210,255,0.95)';
      g.fillText(label, r.x0 + 4, r.y0 - 3);
    }
  }
}

const ROI_LABELS = {
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
};

/* ------------------------------ 历史趋势 ------------------------------ */
function renderSpark(canvas, history) {
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

  // 网格
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

  // 折线 + 渐变填充
  g.beginPath();
  history.forEach((h, i) => (i === 0 ? g.moveTo(x(i), y(h.overall)) : g.lineTo(x(i), y(h.overall))));
  const stroke = g.getLineDash();
  g.setLineDash([]);
  g.strokeStyle = '#4ea8ff';
  g.lineWidth = 2.2;
  g.lineJoin = 'round';
  g.stroke();
  g.setLineDash(stroke);

  const areaGrad = g.createLinearGradient(0, pad.t, 0, pad.t + ih);
  areaGrad.addColorStop(0, 'rgba(78,168,255,0.28)');
  areaGrad.addColorStop(1, 'rgba(78,168,255,0)');
  g.lineTo(x(n - 1), pad.t + ih);
  g.lineTo(x(0), pad.t + ih);
  g.closePath();
  g.fillStyle = areaGrad;
  g.fill();

  // 数据点
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
    const rows = [...history].reverse();
    table.innerHTML = `
      <thead><tr><th>时间</th><th>综合</th><th>较上次</th><th>舒缓</th><th>水油</th><th>细腻</th><th>均匀</th><th>紧致</th><th>光泽</th></tr></thead>
      <tbody>
        ${rows
          .map((h, i) => {
            const prev = rows[i + 1];
            const d = prev ? h.overall - prev.overall : null;
            const cls = d === null ? '' : d > 0.5 ? 'up' : d < -0.5 ? 'down' : '';
            const txt = d === null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
            const dim = (k) =>
              h.dimensions && h.dimensions[k] !== undefined
                ? `<td style="color:${scoreColor(h.dimensions[k])}">${h.dimensions[k].toFixed(0)}</td>`
                : '<td>—</td>';
            return `<tr>
              <td>${new Date(h.ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
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

export function exportJSON(ctx) {
  const payload = {
    生成时间: new Date(ctx.timestamp).toISOString(),
    版本: 'skin-health-scanner/1.0',
    说明: '本文件由浏览器端图像分析生成，非医学诊断。',
    综合评分: Number(ctx.scores.overall.toFixed(2)),
    评级: ctx.scores.grade.label,
    维度得分: Object.fromEntries(
      Object.entries(ctx.scores.dimensions).map(([k, v]) => [k, Number(v.toFixed(2))]),
    ),
    黑眼圈得分: ctx.scores.darkCircle === null ? null : Number(ctx.scores.darkCircle.toFixed(2)),
    肤质判定: ctx.skinType.type,
    肤色: { 描述: ctx.tone.name, ITA角度: Number(ctx.tone.ita.toFixed(2)) },
    原始测量值: Object.fromEntries(
      Object.entries(ctx.result.metrics).map(([k, v]) => [k, Number.isFinite(v) ? Number(v.toFixed(5)) : null]),
    ),
    检测阈值: ctx.result.thresholds,
    采样质量: ctx.result.quality,
    关注项: ctx.advice.concerns.map((c) => ({
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
    `皮肤报告_${stamp(ctx.timestamp)}.json`,
  );
}

export function exportPhoto(canvas, timestamp) {
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `皮肤分析标注图_${stamp(timestamp)}.png`);
  }, 'image/png');
}

export function summaryText(ctx) {
  const { scores, skinType, tone, result, advice } = ctx;
  const L = [];
  L.push('【面部皮肤健康报告】');
  L.push(`时间：${new Date(ctx.timestamp).toLocaleString('zh-CN', { hour12: false })}`);
  L.push(`综合评分：${scores.overall.toFixed(1)} / 100（${scores.grade.label}）`);
  L.push(`肤质判定：${skinType.type}　肤色：${tone.name}`);
  L.push('');
  L.push('六维得分：');
  for (const d of DIMENSIONS) L.push(`　· ${d.label}：${scores.dimensions[d.key].toFixed(0)}`);
  if (scores.darkCircle !== null) L.push(`　· 眼周状态：${scores.darkCircle.toFixed(0)}`);
  L.push('');
  L.push('关键读数：');
  L.push(`　· 泛红占比 ${(result.metrics.rednessRatio * 100).toFixed(1)}%`);
  L.push(`　· 镜面反光 ${(result.metrics.shineRatio * 100).toFixed(1)}%`);
  L.push(`　· 毛孔密度 ${(result.metrics.poreDensity * 100).toFixed(1)}%`);
  L.push(`　· 色素暗斑 ${(result.metrics.spotRatio * 100).toFixed(1)}%`);
  L.push(`　· 额头横纹 ${(result.metrics.lineDensityForehead * 100).toFixed(1)}%`);
  if (advice.concerns.length) {
    L.push('');
    L.push('重点关注：');
    for (const c of advice.concerns) L.push(`　· ${c.title}：${c.action}`);
  }
  L.push('');
  L.push('※ 本报告由浏览器端图像分析生成，仅供护肤参考，不构成医学诊断。');
  return L.join('\n');
}

function stamp(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
