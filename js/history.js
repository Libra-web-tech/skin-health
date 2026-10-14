/**
 * history.js —— 检测历史（仅存本机浏览器 localStorage）
 *
 * 只保存数值，不保存任何图像，最大限度保护隐私。
 */

const KEY = 'skin-health-history-v1';
const LIMIT = 30;

export function loadHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((r) => r && Number.isFinite(r.ts) && Number.isFinite(r.overall)) : [];
  } catch {
    return [];
  }
}

export function pushHistory(record) {
  const list = loadHistory();
  list.push(record);
  // 只保留最近 LIMIT 条
  const trimmed = list.slice(-LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* 隐私模式或配额不足时静默降级 */
  }
  return trimmed;
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** 从一次检测结果构造历史记录（不含图像） */
export function makeRecord(ctx) {
  const m = ctx.result.metrics;
  return {
    ts: ctx.timestamp,
    overall: Number(ctx.scores.overall.toFixed(2)),
    grade: ctx.scores.grade.label,
    dimensions: Object.fromEntries(
      Object.entries(ctx.scores.dimensions).map(([k, v]) => [k, Number(v.toFixed(2))]),
    ),
    skinType: ctx.skinType.type,
    tone: ctx.tone.name,
    key: {
      redness: Number((m.rednessRatio * 100).toFixed(2)),
      blemish: Number((m.blemishRatio * 100).toFixed(2)),
      shine: Number((m.shineRatio * 100).toFixed(2)),
      pore: Number((m.poreDensity * 100).toFixed(2)),
      spot: Number((m.spotRatio * 100).toFixed(2)),
      line: Number((m.lineDensityForehead * 100).toFixed(2)),
    },
  };
}
