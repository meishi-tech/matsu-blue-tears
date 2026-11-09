// lib/build.js — 把 CWA（或氣候平均）＋天文＋模型組合成合約的 days / today 結構
//
// mode 判定：CWA 一週預報成功 → "live"；否則 "model"（天文計算＋連江縣氣候平均）。
// model 模式下 tides / seaTempC 皆為 null，潮汐與海溫因子固定 50，sources 會誠實標示。

import { cached, DEFAULT_TTL_SEC } from './cache.js';
import * as cwa from './cwa.js';
import { climatology } from './climate.js';
import { nightAstro } from './astro.js';
import { computeScore, summarize, seasonOf, tideState } from './model.js';
import { toIso08, addDays, todayStr, weekdayLabels } from './time.js';

export const FORECAST_DAYS = 7;

/** 取回所有上游資料（有快取），並整理 sources 區塊 */
export async function loadSources() {
  const cwaData = await cached('cwa:all', () => cwa.loadAll(), DEFAULT_TTL_SEC).catch((e) => ({
    status: 'unavailable', fetchedAt: null, datasets: [], weekly: null, tide: null, marine: null, warnings: null,
    errors: [e?.message || String(e)],
  }));
  const mode = cwaData.status === 'live' ? 'live' : 'model';
  const sources = {
    cwa: {
      status: cwaData.status,
      fetchedAt: cwaData.fetchedAt,
      datasets: cwaData.datasets,
      ...(cwaData.errors?.length ? { errors: cwaData.errors } : {}),
    },
    astro: { status: 'computed' },
  };
  return { cwaData, mode, sources };
}

/**
 * 組出單日資料。
 * @param {string} dateStr  YYYY-MM-DD
 * @param {number} offset   與今天的天數差（0=今天）
 */
export function buildDay(dateStr, offset, cwaData, mode) {
  const month = Number(dateStr.slice(5, 7));
  const astro = nightAstro(dateStr);
  const wk = cwaData?.weekly?.days?.get?.(dateStr) || null;
  const clim = climatology(month);

  // 氣象欄位：有 CWA 用 CWA，缺值回退氣候平均
  const wx = {
    tempC: wk?.tempNightC ?? wk?.tempMinC ?? clim.tempC,
    tempMinC: wk?.tempMinC ?? clim.tempMinC,
    tempMaxC: wk?.tempMaxC ?? clim.tempMaxC,
    windDir: wk?.windDir ?? clim.windDir,
    windKmh: wk?.windKmh ?? clim.windKmh,
    wxZh: wk?.wxZh ?? clim.wxZh,
    wxEn: wk?.wxEn ?? clim.wxEn,
    pop: wk?.pop ?? clim.pop,
  };
  const weatherSource = wk ? 'cwa' : 'climatology';

  // 潮汐（僅 live）
  const tideDay = cwaData?.tide?.days?.get?.(dateStr) || null;
  const tideEvents = tideDay?.events || [];
  const seaTempC = cwaData?.marine?.seaTempC ?? null;

  const { score, level, factors } = computeScore({
    month,
    illumination: astro.moon.illumination,
    moonDownInWindow: astro.moonDownInWindow,
    windDir: wx.windDir,
    windKmh: wx.windKmh,
    pop: wx.pop,
    wxZh: wx.wxZh,
    seaTempC,
    tides: tideEvents,
    winStart: astro._raw.windowStart,
    winEnd: astro._raw.windowEnd,
  });

  const labels = weekdayLabels(dateStr, offset);
  return {
    date: dateStr,
    weekdayZh: labels.zh,
    weekdayEn: labels.en,
    score,
    level,
    moon: astro.moon,
    tempC: wx.tempC,
    tempMinC: wx.tempMinC,
    tempMaxC: wx.tempMaxC,
    windDir: wx.windDir,
    windKmh: wx.windKmh,
    wxZh: wx.wxZh,
    wxEn: wx.wxEn,
    pop: wx.pop,
    sunset: astro.sunset,
    moonrise: astro.moonrise,
    moonset: astro.moonset,
    bestWindow: astro.bestWindow,
    viewTime: astro.viewTime,
    tides: tideEvents.map((t) => ({ time: t.iso, type: t.type, heightCm: t.heightCm })),
    tideRange: tideDay?.range ?? null,
    seaTempC,
    factors,
    weatherSource, // "cwa" | "climatology" — 前端可用來標示「氣候平均」
    _astroRaw: astro._raw,
    _tideEvents: tideEvents,
    _mode: mode,
  };
}

/** 7 天預報（公開欄位） */
export function buildDays(cwaData, mode, now = new Date()) {
  const start = todayStr(now);
  const days = [];
  for (let i = 0; i < FORECAST_DAYS; i++) {
    const d = buildDay(addDays(start, i), i, cwaData, mode);
    days.push(stripPrivate(d));
  }
  return days;
}

/** 今晚總覽（/status 的 today） */
export function buildToday(cwaData, mode, now = new Date()) {
  const dateStr = todayStr(now);
  const d = buildDay(dateStr, 0, cwaData, mode);
  const alerts = cwaData?.warnings?.alerts || [];
  const fogAlert = alerts.some((a) => a.type === 'fog');

  // 潮汐：下一個潮汐事件（以現在時間為準）
  let tide = null;
  if (d._tideEvents.length) {
    const upcoming = d._tideEvents.filter((t) => t.time > now).sort((a, b) => a.time - b.time)[0];
    tide = {
      nextType: upcoming?.type ?? null,
      nextTime: upcoming ? toIso08(upcoming.time) : null,
      range: d.tideRange,
    };
  }
  const state = tideState(d._tideEvents, d._astroRaw.windowStart);
  const summary = summarize({
    score: d.score, level: d.level, factors: d.factors, moon: d.moon,
    windDir: d.windDir, windKmh: d.windKmh, pop: d.pop, season: seasonOf(Number(dateStr.slice(5, 7))),
    fogAlert, mode,
  });

  return {
    today: {
      date: d.date,
      score: d.score,
      level: d.level,
      season: seasonOf(Number(dateStr.slice(5, 7))),
      tempC: d.tempC,
      windDir: d.windDir,
      windKmh: d.windKmh,
      wxZh: d.wxZh,
      wxEn: d.wxEn,
      pop: d.pop,
      moon: d.moon,
      sunset: d.sunset,
      moonrise: d.moonrise,
      moonset: d.moonset,
      bestWindow: d.bestWindow,
      tide,
      seaTempC: d.seaTempC,
      fogAlert,
      weatherSource: d.weatherSource,
      factors: d.factors,
      ...summary,
    },
    // 給 /hotspots 使用
    hotspotInput: {
      score: d.score,
      viewTime: d.viewTime,
      seaTempC: d.seaTempC,
      windDir: d.windDir,
      windKmh: d.windKmh,
      tideZh: mode === 'live' && d._tideEvents.length ? state.zh : '無潮汐資料',
      tideEn: mode === 'live' && d._tideEvents.length ? state.en : 'No tide data',
    },
    alerts,
  };
}

function stripPrivate(d) {
  const out = {};
  for (const [k, v] of Object.entries(d)) if (!k.startsWith('_')) out[k] = v;
  return out;
}

/** 共用回應外框 */
export function envelope({ sources, mode, extra = {} }) {
  return { ok: true, generatedAt: toIso08(new Date()), sources, mode, ...extra };
}
