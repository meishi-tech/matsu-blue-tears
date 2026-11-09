// lib/time.js — 台灣時區（UTC+8，無夏令時間）的日期工具
// Serverless 的系統時區是 UTC，因此全部手動以 +08:00 偏移計算，不依賴 Intl。

export const TZ_OFFSET_MIN = 8 * 60;
export const TZ_SUFFIX = '+08:00';

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** 把 Date 轉成台灣時區的 y/m/d/h/mi/s 欄位 */
export function toTaipeiParts(date) {
  const t = new Date(date.getTime() + TZ_OFFSET_MIN * 60_000);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    mi: t.getUTCMinutes(),
    s: t.getUTCSeconds(),
    weekday: t.getUTCDay(), // 0=Sun
  };
}

/** ISO 8601 帶 +08:00，秒精度 */
export function toIso08(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const p = toTaipeiParts(date);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${TZ_SUFFIX}`;
}

/** YYYY-MM-DD（台灣日期） */
export function toDateStr(date) {
  const p = toTaipeiParts(date);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** HH:MM（台灣時間） */
export function toHm(date) {
  if (!date) return null;
  const p = toTaipeiParts(date);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** 以台灣日期 + 時分建立 Date（UTC 時間點） */
export function taipeiDate(dateStr, h = 0, mi = 0, s = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - 8, mi, s));
}

/** 加 N 天（以台灣日期字串操作） */
export function addDays(dateStr, n) {
  const d = taipeiDate(dateStr, 12);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

/** 今天（台灣）日期字串 */
export function todayStr(now = new Date()) {
  return toDateStr(now);
}

const WEEKDAY_ZH = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 星期標籤；offset 0 → 今天 / Today，1 → 明天 / Tomorrow */
export function weekdayLabels(dateStr, offset) {
  if (offset === 0) return { zh: '今天', en: 'Today' };
  if (offset === 1) return { zh: '明天', en: 'Tomorrow' };
  const wd = taipeiDate(dateStr, 12).getUTCDay();
  return { zh: WEEKDAY_ZH[wd], en: WEEKDAY_EN[wd] };
}

/** 解析 CWA 的 "2026-11-09T18:00:00+08:00" 或 "2026-11-09 04:29:00"（視為台灣時間） */
export function parseCwaTime(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (/[+-]\d{2}:\d{2}$/.test(s) || s.endsWith('Z')) return new Date(s);
  // 無時區 → 視為台灣時間
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5], +(m[6] || 0)));
}
