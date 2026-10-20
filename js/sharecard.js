/**
 * sharecard.js —— 生成"报告分享卡片"图片（Canvas 手绘，适合发微信/朋友圈）
 *
 * 用法：
 *   import { shareCard } from './sharecard.js';
 *   const result = await shareCard(ctx, lang);   // 'shared' | 'downloaded' | 'cancelled'
 *
 * 行为：手机上优先调用系统分享面板（Web Share API），
 * 不支持的浏览器则直接下载 PNG。
 */

import { L, localeOf } from './i18n.js';
import { DIMENSIONS, gradeOf, classifySkinType, buildAdvice, dimensionLabel } from './scoring.js';
import { scoreColor, downloadBlob } from './report.js';

/** 站点二维码（离线生成后内嵌，指向线上地址） */
const QR_PNG_B64 = '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';

const W = 1080;
const H = 1520;

function rounded(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

async function loadQR() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/png;base64,${QR_PNG_B64}`;
  });
}

export async function buildShareCard(ctx, lang = 'zh') {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const t = (key, vars) => L(lang, key, vars);

  const { scores, tone, timestamp } = ctx;
  const m = ctx.result.metrics;
  const skinType = classifySkinType(m, scores, lang);
  const grade = gradeOf(scores.overall, lang);
  const advice = buildAdvice(m, scores, skinType, tone, lang);

  /* ---- 背景 ---- */
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1224');
  bg.addColorStop(0.5, '#0d1730');
  bg.addColorStop(1, '#0a1120');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const glow = g.createRadialGradient(W / 2, 130, 0, W / 2, 130, 560);
  glow.addColorStop(0, 'rgba(78,168,255,0.18)');
  glow.addColorStop(1, 'rgba(78,168,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  /* ---- 品牌 + 标题 ---- */
  g.textAlign = 'left';
  g.fillStyle = '#93a4c4';
  g.font = '600 30px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  g.fillText(lang === 'en' ? 'SKIN HEALTH SCANNER' : '皮肤健康检测', 64, 92);

  g.fillStyle = '#ffffff';
  g.font = '700 64px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  g.fillText(t('report.title'), 64, 176);

  const dateStr = new Date(timestamp).toLocaleString(localeOf(lang), { hour12: false });
  g.fillStyle = '#64748b';
  g.font = '400 28px -apple-system, "PingFang SC", sans-serif';
  g.fillText(dateStr, 64, 224);

  /* ---- 评分环 ---- */
  const cxx = W / 2;
  const cyy = 440;
  const R = 150;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(120,165,235,0.16)';
  g.lineWidth = 24;
  g.beginPath();
  g.arc(cxx, cyy, R, 0, Math.PI * 2);
  g.stroke();

  const color = scoreColor(scores.overall);
  g.strokeStyle = color;
  const start = -Math.PI / 2;
  const end = start + (Math.PI * 2 * scores.overall) / 100;
  g.beginPath();
  g.arc(cxx, cyy, R, start, end);
  g.stroke();

  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = '800 110px -apple-system, sans-serif';
  g.fillText(String(Math.round(scores.overall)), cxx, cyy + 18);
  g.fillStyle = '#93a4c4';
  g.font = '500 30px -apple-system, "PingFang SC", sans-serif';
  g.fillText(t('share.overall'), cxx, cyy + 78);

  /* ---- 评级 / 肤质 / 肤色 pills ---- */
  const pill = (text, x, w) => {
    rounded(g, x, 660, w, 64, 32);
    g.fillStyle = 'rgba(120,165,235,0.1)';
    g.fill();
    g.strokeStyle = 'rgba(120,165,235,0.28)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#cfe0f8';
    g.font = '600 30px -apple-system, "PingFang SC", sans-serif';
    g.textAlign = 'center';
    g.fillText(text, x + w / 2, 702);
  };
  const labels = [grade.label, skinType.type, `${lang === 'en' ? 'Tone' : '肤色'} · ${tone.name}`];
  const widths = [280, 340, 320];
  const gap = 24;
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * 2;
  let px = (W - totalW) / 2;
  labels.forEach((label, i) => {
    pill(label, px, widths[i]);
    px += widths[i] + gap;
  });

  /* ---- 六维进度条 ---- */
  let y = 800;
  g.textAlign = 'left';
  for (const d of DIMENSIONS) {
    const v = scores.dimensions[d.key];
    g.fillStyle = '#b8c9e4';
    g.font = '600 32px -apple-system, "PingFang SC", sans-serif';
    g.fillText(dimensionLabel(d.key, lang), 64, y + 26);
    g.fillStyle = colorOf(v);
    g.font = '700 32px -apple-system, sans-serif';
    g.textAlign = 'right';
    g.fillText(String(Math.round(v)), W - 64, y + 26);
    g.textAlign = 'left';
    // bar
    rounded(g, 280, y + 6, W - 280 - 120, 26, 13);
    g.fillStyle = 'rgba(120,165,235,0.12)';
    g.fill();
    if (v > 1) {
      rounded(g, 280, y + 6, Math.max(26, (W - 280 - 120) * (v / 100)), 26, 13);
      g.fillStyle = colorOf(v);
      g.fill();
    }
    y += 62;
  }

  // 眼周（若有）
  if (scores.darkCircle !== null) {
    g.fillStyle = '#b8c9e4';
    g.font = '600 32px -apple-system, "PingFang SC", sans-serif';
    g.fillText(dimensionLabel('eye', lang), 64, y + 26);
    g.fillStyle = colorOf(scores.darkCircle);
    g.font = '700 32px -apple-system, sans-serif';
    g.textAlign = 'right';
    g.fillText(String(Math.round(scores.darkCircle)), W - 64, y + 26);
    g.textAlign = 'left';
    rounded(g, 280, y + 6, W - 280 - 120, 26, 13);
    g.fillStyle = 'rgba(120,165,235,0.12)';
    g.fill();
    rounded(g, 280, y + 6, Math.max(26, (W - 280 - 120) * (scores.darkCircle / 100)), 26, 13);
    g.fillStyle = colorOf(scores.darkCircle);
    g.fill();
    y += 62;
  }

  /* ---- 与上次对比（若有） ---- */
  if (ctx.prev && ctx.prev.dimensions) {
    const d0 = scores.overall - ctx.prev.overall;
    const sign = d0 > 0 ? '+' : '';
    const arrow = d0 > 0 ? '▲' : d0 < 0 ? '▼' : '▪';
    y += 18;
    g.textAlign = 'left';
    g.fillStyle = '#64748b';
    g.font = '500 28px -apple-system, "PingFang SC", sans-serif';
    g.fillText(t('compare.title'), 64, y);
    g.fillStyle = d0 >= 0 ? '#34d399' : '#fb7185';
    g.font = '700 36px -apple-system, sans-serif';
    g.fillText(`${arrow} ${sign}${d0.toFixed(1)}`, 64 + 260, y + 2);
    y += 54;
  }

  /* ---- 重点关注（最多 2 条） ---- */
  if (advice.concerns.length) {
    y += 10;
    g.fillStyle = '#64748b';
    g.font = '500 28px -apple-system, "PingFang SC", sans-serif';
    g.fillText(t('share.topFindings'), 64, y);
    y += 46;
    g.fillStyle = '#cfe0f8';
    g.font = '600 32px -apple-system, "PingFang SC", sans-serif';
    for (const c of advice.concerns.slice(0, 2)) {
      g.fillText(`· ${c.title}`, 64, y);
      y += 48;
    }
  }

  /* ---- 底部：QR + URL + 免责声明 ---- */
  const qrSize = 220;
  const qrX = W - 64 - qrSize;
  const qrY = H - 64 - qrSize;
  g.fillStyle = '#ffffff';
  g.fillRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24);
  const qr = await loadQR();
  if (qr) g.drawImage(qr, qrX, qrY, qrSize, qrSize);

  g.textAlign = 'left';
  g.fillStyle = '#93a4c4';
  g.font = '500 26px -apple-system, "PingFang SC", sans-serif';
  g.fillText(t('share.scanCode'), qrX - 12, qrY - 24);

  g.fillStyle = '#7cc4ff';
  g.font = '600 28px -apple-system, sans-serif';
  g.fillText('libra-web-tech.github.io/skin-health', 64, H - 64 - 40);

  g.fillStyle = '#54627a';
  g.font = '400 24px -apple-system, "PingFang SC", sans-serif';
  g.fillText(t('share.disclaimer'), 64, H - 64);

  return canvas;
}

function colorOf(v) {
  if (v >= 85) return '#34d399';
  if (v >= 70) return '#4ade80';
  if (v >= 55) return '#fbbf24';
  if (v >= 40) return '#fb923c';
  return '#f87171';
}

/** 生成卡片并分享 / 下载；返回 'shared' | 'downloaded' | 'cancelled' */
export async function shareCard(ctx, lang = 'zh') {
  const canvas = await buildShareCard(ctx, lang);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return 'failed';
  const file = new File([blob], `skin-report-card.png`, { type: 'image/png' });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: L(lang, 'share.title'),
        text: L(lang, 'share.disclaimer'),
      });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // 其它失败 → 回退下载
    }
  }
  downloadBlob(blob, `skin-report-card_${stamp(ctx.timestamp)}.png`);
  return 'downloaded';
}

function stamp(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
