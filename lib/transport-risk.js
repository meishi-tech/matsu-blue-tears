// lib/transport-risk.js — 交通可達性風險引擎（臺馬航線 × 南北竿航班 × 房價建議）
//
// 規則移植自 design/proto/engine.mjs（門檻不改），規格見 contract-transport-risk-v1.md A 節。
// 輸入（皆為 CWA 原始 JSON）：
//   marine  F-A0012-001 海面天氣預報（fileapi；遞迴找 LocationName = 臺灣北部海面／馬祖海面）
//   j081    F-D0047-081 連江縣逐 3 小時（南竿鄉）
//   j083    F-D0047-083 連江縣一週逐 12 小時（南竿鄉）
//   alerts  W-C0033-001 天氣特報（連江縣）
//   tdx     lib/tdx.js loadAll() 的結果（今日實況）
// 輸出：未來 7 日 船／機風險、可達性指數、信心度、房價係數建議 + 今日實況橫幅資料。

import { parseWarnings, popFromWx } from './cwa.js';
import { addDays, taipeiDate, toTaipeiParts, parseCwaTime } from './time.js';

export const RULES = {
  version: '2026.11-v1',
  ferryStandardUrl: 'https://www.matsu-news.gov.tw/forum/article/4022',
  clamp: [0.85, 1.3],
  maxDailyStepPct: 15,
};

const dateOf = (iso) => String(iso || '').slice(0, 10);
const dowOf = (d) => taipeiDate(d, 12).getUTCDay();
const DOW_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const nn = (v) => (v === undefined || Number.isNaN(v) ? null : v);

// ---------- 解析器 ----------
/** "7至8陣風10級上午轉6至7陣風9級" → { sustainedMax:8, gustMax:10 } */
export function parseBeaufort(desc) {
  if (!desc) return { sustainedMax: null, gustMax: null };
  const gusts = [...desc.matchAll(/陣風(\d+)級/g)].map((m) => +m[1]);
  const stripped = desc.replace(/陣風\d+級/g, ' ');
  const nums = [...stripped.matchAll(/(\d+)/g)].map((m) => +m[1]).filter((n) => n <= 12);
  return { sustainedMax: nums.length ? Math.max(...nums) : null, gustMax: gusts.length ? Math.max(...gusts) : null };
}

/** "6轉5公尺" / "3至4公尺" / "5轉4再轉3公尺" / "1至2公尺" → { waveMax, waveMin } */
export function parseWave(desc) {
  if (!desc) return { waveMax: null, waveMin: null };
  const nums = [...desc.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => +m[1]);
  return nums.length ? { waveMax: Math.max(...nums), waveMin: Math.min(...nums) } : { waveMax: null, waveMin: null };
}

/** F-A0012-001：指定海面 → { [date]: { sustainedMax, gustMax, waveMax, waveMin, wx, raw:{wind,wave} } } */
export function marineByDate(marineJson, areaName) {
  const out = {};
  const walk = (o, f) => {
    if (Array.isArray(o)) o.forEach((v) => walk(v, f));
    else if (o && typeof o === 'object') { f(o); Object.values(o).forEach((v) => walk(v, f)); }
  };
  walk(marineJson, (o) => {
    if (o.LocationName !== areaName || !Array.isArray(o.WeatherElement)) return;
    const els = Object.fromEntries(o.WeatherElement.map((w) => [w.ElementName, w.Time || []]));
    (els['浪高描述'] || []).forEach((t, i) => {
      const d = dateOf(t.StartTime);
      const wind = els['蒲福風級描述']?.[i]?.ElementValue?.BeaufortScaleDescription ?? null;
      const wave = t.ElementValue?.WaveHeightDescription ?? null;
      out[d] = {
        ...parseBeaufort(wind),
        ...parseWave(wave),
        wx: els['天氣現象']?.[i]?.ElementValue?.Weather ?? null,
        raw: { wind, wave },
      };
    });
  });
  return out;
}

/** F-A0012-001 發布時間（IssueTime，+08:00 ISO）或 null */
export function marineIssueTime(marineJson) {
  const t = marineJson?.cwaopendata?.Dataset?.DatasetInfo?.IssueTime || marineJson?.cwaopendata?.Sent || null;
  return t ? String(t) : null;
}

const bfNum = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
};

function findLocation(json, locationName) {
  const locs = json?.records?.Locations?.[0]?.Location || [];
  return locs.find((l) => l.LocationName === locationName) || locs[0] || null;
}

/** F-D0047-081：逐 3 小時時槽 [{time,temp,dew,rh,bf,wdir,wx}]（依時間排序） */
export function threeHourly(json081, locationName = '南竿鄉') {
  const loc = findLocation(json081, locationName);
  if (!loc) return [];
  const els = Object.fromEntries((loc.WeatherElement || []).map((w) => [w.ElementName, w.Time || []]));
  const rows = {};
  const put = (t, k, v) => { const key = t.DataTime || t.StartTime; rows[key] ??= { time: key }; rows[key][k] = v; };
  (els['溫度'] || []).forEach((t) => put(t, 'temp', +t.ElementValue[0].Temperature));
  (els['露點溫度'] || []).forEach((t) => put(t, 'dew', +t.ElementValue[0].DewPoint));
  (els['相對濕度'] || []).forEach((t) => put(t, 'rh', +t.ElementValue[0].RelativeHumidity));
  (els['風速'] || []).forEach((t) => put(t, 'bf', bfNum(t.ElementValue[0].BeaufortScale)));
  (els['風向'] || []).forEach((t) => put(t, 'wdir', t.ElementValue[0].WindDirection));
  (els['天氣現象'] || []).forEach((t) => put(t, 'wx', t.ElementValue[0].Weather));
  return Object.values(rows).sort((a, b) => a.time.localeCompare(b.time));
}

/** F-D0047-083：每日彙整 { [date]: { bf, rhDay, rhNight, wx, wxAny, tmax, tmin, pop } } */
export function weekly(json083, locationName = '南竿鄉') {
  const loc = findLocation(json083, locationName);
  if (!loc) return {};
  const els = Object.fromEntries((loc.WeatherElement || []).map((w) => [w.ElementName, w.Time || []]));
  const days = {};
  const get = (name, key) => (els[name] || []).map((t) => ({ d: dateOf(t.StartTime), start: t.StartTime, v: t.ElementValue?.[0]?.[key] }));
  get('風速', 'BeaufortScale').forEach(({ d, v }) => { days[d] ??= {}; const n = bfNum(v); if (n != null) days[d].bf = Math.max(days[d].bf ?? 0, n); });
  get('平均相對濕度', 'RelativeHumidity').forEach(({ d, start, v }) => { days[d] ??= {}; if (start.includes('T18:00')) days[d].rhNight = +v; else days[d].rhDay = +v; });
  get('天氣現象', 'Weather').forEach(({ d, start, v }) => { days[d] ??= {}; if (!start.includes('T18:00')) days[d].wx = v; days[d].wxAny = (days[d].wxAny || '') + v; });
  get('最高溫度', 'MaxTemperature').forEach(({ d, v }) => { days[d] ??= {}; days[d].tmax = Math.max(days[d].tmax ?? -99, +v); });
  get('最低溫度', 'MinTemperature').forEach(({ d, v }) => { days[d] ??= {}; days[d].tmin = Math.min(days[d].tmin ?? 99, +v); });
  get('12小時降雨機率', 'ProbabilityOfPrecipitation').forEach(({ d, v }) => { days[d] ??= {}; if (v !== '-' && v != null && v !== '') days[d].pop = Math.max(days[d].pop ?? 0, +v); });
  return days;
}

/** W-C0033-001：有效特報 [{phenomena,start,end}]（時間為 "YYYY-MM-DDTHH:mm:ss" 台灣時間） */
export function activeAlerts(alertsJson, locationName = '連江縣') {
  const locs = alertsJson?.records?.location || [];
  const loc = locs.find((l) => l.locationName === locationName) || locs[0];
  return (loc?.hazardConditions?.hazards || [])
    .filter((h) => h?.info?.phenomena && h?.validTime?.startTime && h?.validTime?.endTime)
    .map((h) => ({
      phenomena: h.info.phenomena,
      start: h.validTime.startTime.replace(' ', 'T'),
      end: h.validTime.endTime.replace(' ', 'T'),
    }));
}

// ---------- 規則 ----------
export const LEVELS = ['green', 'yellow', 'orange', 'red'];
export const levelZh = { green: '正常', yellow: '注意', orange: '存疑', red: '停航機率高' };
export const flightLevelZh = { green: '正常', yellow: '注意', orange: '易受影響', red: '大量取消' };
export const scoreToLevel = (s) => (s >= 75 ? 'red' : s >= 50 ? 'orange' : s >= 25 ? 'yellow' : 'green');

/** 船：依全港通公告標準（航程遇陣風 10 級以上或浪高 3 公尺以上停航；風力 6–7 級或大浪由船長判斷） */
export function ferryRisk({ north, matsu, landBf, dow }) {
  const reasons = [];
  // 週二航修（新臺馬輪固定）：非天候因素，只做旗標、不計分
  const maintenance = dow === 2;
  let score = 0;
  const areas = [north && { n: '臺灣北部海面', ...north }, matsu && { n: '馬祖海面', ...matsu }].filter(Boolean);
  if (areas.length) {
    for (const a of areas) {
      let s = 0;
      if (a.gustMax >= 10 || a.waveMax >= 4) s = 95;
      else if (a.sustainedMax >= 7 || a.gustMax >= 9 || a.waveMax >= 3) s = 65;
      else if (a.sustainedMax >= 6 || a.waveMax >= 2.5) s = 40;
      else if (a.waveMax >= 2) s = 25;
      else s = 5;
      if (s > score) score = s;
      reasons.push(`${a.n}：${a.raw.wind}，浪高${a.raw.wave}`);
    }
  } else if (landBf != null) {
    // 海面預報只有 5 天；第 6–7 天以陸上風級推估（低信心）
    score = landBf >= 7 ? 65 : landBf >= 6 ? 40 : 10;
    reasons.push(`無海面預報，以南竿陸上風力 ${landBf} 級推估`);
  } else {
    return { score: null, level: null, reasons: ['無資料'], maintenance };
  }
  return { score, level: scoreToLevel(score), reasons, maintenance };
}

const FOG_SEASON_W = (m) => ([3, 4, 5].includes(m) ? 1.2 : [2, 6].includes(m) ? 1.0 : 0.4);
const isMorningOrEvening = (h) => (h >= 5 && h <= 10) || (h >= 17 && h <= 20);
const fmtEnd = (end) => end.slice(5, 16).replace('T', ' ');

/** 飛機：霧／低雲（露點差、濕度、風、季節、特報）＋ 強風側風 ＋ 雷雨颱風 */
export function flightRisk({ date, slots, week, alerts }) {
  const reasons = [];
  const m = +date.slice(5, 7);
  let fog = 0, wind = 0, other = 0;
  if (slots?.length) {
    const key = slots.filter((s) => isMorningOrEvening(+s.time.slice(11, 13)));
    const pool = key.length ? key : slots;
    const spread = Math.min(...pool.map((s) => s.temp - s.dew));
    const rhMax = Math.max(...pool.map((s) => s.rh));
    const bfMin = Math.min(...pool.map((s) => s.bf ?? 99));
    const south = pool.some((s) => /南/.test(s.wdir || ''));
    const bfMax = Math.max(...slots.map((s) => s.bf ?? 0));
    if (spread <= 1) fog += 45; else if (spread <= 2) fog += 30; else if (spread <= 3) fog += 10;
    if (rhMax >= 97) fog += 20; else if (rhMax >= 92) fog += 10;
    if (bfMin <= 2) fog += 15; else if (bfMin <= 3) fog += 8;
    if (south) fog += 10;
    if (slots.some((s) => /霧/.test(s.wx || ''))) fog += 30;
    fog = Math.round(fog * FOG_SEASON_W(m));
    if (fog >= 25) reasons.push(`早晚露點差 ${spread}°C、濕度 ${rhMax}%、風 ${bfMin} 級${south ? '、偏南風' : ''}`);
    if (bfMax >= 8) wind = 55; else if (bfMax >= 7) wind = 35; else if (bfMax >= 6) wind = 15;
    if (wind >= 15) reasons.push(`陸上風力最大 ${bfMax} 級（側風／陣風）`);
    if (slots.some((s) => /雷/.test(s.wx || ''))) { other += 20; reasons.push('雷雨'); }
  } else if (week) {
    const rh = Math.max(week.rhDay ?? 0, week.rhNight ?? 0);
    if (rh >= 95) fog += 35; else if (rh >= 90) fog += 20; else if (rh >= 85) fog += 8;
    if (/霧/.test(week.wxAny || '')) fog += 30;
    fog = Math.round(fog * FOG_SEASON_W(m));
    if (fog >= 20) reasons.push(`日均濕度 ${rh}%（一週預報，低信心）`);
    if (week.bf >= 7) wind = 35; else if (week.bf >= 6) wind = 15;
    if (wind) reasons.push(`陸上風力 ${week.bf} 級`);
  } else {
    return { score: null, level: null, reasons: ['無資料'], parts: { fog: 0, wind: 0, other: 0 } };
  }
  for (const a of alerts || []) {
    if (a.start.slice(0, 10) <= date && a.end.slice(0, 10) >= date) {
      if (/霧/.test(a.phenomena)) { fog = Math.max(fog, 70); reasons.push(`中央氣象署濃霧特報（至 ${fmtEnd(a.end)}）`); }
      if (/颱風/.test(a.phenomena)) { other = 100; reasons.push('颱風警報'); }
      if (/強風/.test(a.phenomena)) { wind = Math.max(wind, 25); reasons.push(`陸上強風特報（至 ${fmtEnd(a.end)}）`); }
    }
  }
  const top = Math.max(fog, wind, other);
  const score = Math.min(100, top + Math.round(0.25 * (fog + wind + other - top)));
  return { score, level: scoreToLevel(score), reasons, parts: { fog, wind, other } };
}

/** 可達性指數：飛機權重 0.7、船 0.3；若其中一種交通正常，指數下限 55（有替代方案） */
export function accessibility(flight, ferry) {
  if (flight.score == null && ferry.score == null) return null;
  const f = flight.score ?? 50, s = ferry.score ?? 50;
  let idx = Math.round(100 - (0.7 * f + 0.3 * s));
  if (flight.level === 'green' || ferry.level === 'green') idx = Math.max(idx, 55);
  return Math.max(0, Math.min(100, idx));
}

export const STRANDED_RATE_HINT = { minPct: 85, maxPct: 90 };

/** 房價建議：只在「可行動」的 0–3 日給係數，4–6 日給策略（彈性取消／觀察） */
export function pricingAdvice({ offset, idx, prevIdx, wxGood, dow, isHighSeason }) {
  const a = { transportFactor: 1.0, dowFactor: 1.0, tags: [], actions: [], strandedRateHint: null };
  const weekend = dow === 5 || dow === 6;
  let factor = 1.0;
  if (offset <= 3) {
    if (idx != null && idx < 40) {
      factor = 1.0; a.tags.push('抵達困難');
      a.actions.push('不降價（降價無法帶來可抵達的客人）', '開放在住房客「滯留延住價」（官網價 85–90%）', '逐筆聯絡該日入住訂單，提供改期／免費取消', '清潔排程改以延住為主');
      a.strandedRateHint = { ...STRANDED_RATE_HINT };
    } else if (prevIdx != null && prevIdx < 40 && idx >= 55) {
      factor = 1.08; a.tags.push('回補日');
      a.actions.push('前一日停航／停飛後的疏運回補，關閉 OTA 折扣方案', '住房率 ≥ 60% 時可再上調至 +12%');
    } else if (idx >= 70 && wxGood && (isHighSeason || weekend)) {
      factor = 1.05; a.tags.push('好天氣可達');
      a.actions.push('關閉 OTA 限時促銷，維持官網最優惠');
    } else if (idx != null && idx < 55) {
      factor = 1.0; a.tags.push('交通存疑');
      a.actions.push('維持價格；OTA 改掛「免費取消」方案以保住轉換', '準備替代交通資訊給該日入住房客');
    } else {
      a.tags.push('維持');
    }
  } else {
    a.tags.push('觀察區');
    if (idx != null && idx < 50) a.actions.push('不調價；OTA 提前切換彈性取消；追蹤 11:00 船公司公告');
  }
  a.transportFactor = factor;
  a.dowFactor = weekend ? 1.1 : 1.0;
  return a;
}

// ---------- 今日實況（TDX） ----------
const TAIMA_RE = /基隆|臺北港|台北港/;

/** 今日航班統計與最後一班 */
export function summarizeFlights(flights, date) {
  if (!Array.isArray(flights)) return null;
  const todays = flights.filter((f) => !f.scheduled || dateOf(f.scheduled) === date);
  const cancelled = todays.filter((f) => f.status === 'cancelled').length;
  const delayed = todays.filter((f) => f.status === 'delayed').length;
  const arrivedOrDeparted = todays.filter((f) => f.status === 'arrived' || f.status === 'departed').length;
  const sorted = [...todays].sort((a, b) => String(a.scheduled).localeCompare(String(b.scheduled)));
  const last = sorted[sorted.length - 1];
  return {
    total: todays.length,
    cancelled,
    delayed,
    arrivedOrDeparted,
    remaining: Math.max(0, todays.length - arrivedOrDeparted - cancelled),
    lastFlight: last
      ? { flightNo: last.flightNo, fromZh: last.fromZh, toZh: last.toZh, scheduled: last.scheduled, statusZh: last.statusZh }
      : null,
  };
}

/** 臺馬航線（基隆↔南竿／東引）今日看板 + 今晚基隆出發狀態 */
export function summarizeFerries(ferries, date, now) {
  if (!Array.isArray(ferries)) return null;
  const taima = ferries
    .filter((f) => TAIMA_RE.test(f.routeZh || ''))
    .map((f) => ({ routeZh: f.routeZh, scheduled: f.scheduled, status: f.status, statusZh: f.statusZh, cancelReason: f.cancelReason ?? null }));
  // 今晚自基隆出發（抵達日 = 明天）；船公司當日 11:00 公告
  const tonight = taima.find((f) => /^基隆|^臺北港|^台北港/.test(f.routeZh) && dateOf(f.scheduled) === date);
  let status = 'unknown';
  let note = '船公司 11:00 公告';
  if (tonight) {
    status = ['cancelled', 'on_time', 'departed', 'delayed'].includes(tonight.status) ? (tonight.status === 'departed' ? 'on_time' : tonight.status) : 'unknown';
    if (tonight.status === 'cancelled' && tonight.cancelReason) note = `停航：${tonight.cancelReason}`;
    else if (tonight.status === 'cancelled') note = '船公司公告停航';
    else note = `${tonight.statusZh}（${tonight.scheduled?.slice(11, 16) || ''} 基隆開）`;
  } else {
    const p = toTaipeiParts(now);
    const isToday = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` === date;
    if (isToday && p.h < 11) { status = 'pending'; note = '待 11:00 船公司公告'; }
    else note = 'TDX 看板尚無今晚班次，請核對船公司公告';
  }
  return { taima, tonightDeparture: { status, note } };
}

// ---------- 主流程 ----------
/**
 * @param {object} p
 * @param {object|null} p.marine  F-A0012-001 原始 JSON
 * @param {object|null} p.j081    F-D0047-081 原始 JSON
 * @param {object|null} p.j083    F-D0047-083 原始 JSON
 * @param {object|null} p.alerts  W-C0033-001 原始 JSON
 * @param {object|null} p.tdx     tdx.loadAll() 結果（{flights:{flights:[]}, ferries:{ferries:[]}}）
 * @param {string} p.today        YYYY-MM-DD（台灣）
 * @param {Date} [p.now]
 */
export function buildTransportRisk({ marine, j081, j083, alerts, tdx, today, now = new Date() }) {
  const north = marine ? marineByDate(marine, '臺灣北部海面') : {};
  const matsu = marine ? marineByDate(marine, '馬祖海面') : {};
  const slots = j081 ? threeHourly(j081) : [];
  const week = j083 ? weekly(j083) : {};
  const activeAl = alerts ? activeAlerts(alerts) : [];

  const days = [];
  for (let i = 0; i <= 6; i++) {
    const date = addDays(today, i);
    const dow = dowOf(date);
    const daySlots = slots.filter((s) => dateOf(s.time) === date);
    const w = week[date];
    // 船：抵達日 date 的清晨 = 前一晚自基隆出發；船公司以「抵達日臺灣北部海面」預報為據
    const ferry = ferryRisk({ north: north[date], matsu: matsu[date], landBf: w?.bf, dow });
    const flight = flightRisk({ date, slots: daySlots.length >= 4 ? daySlots : null, week: w, alerts: activeAl });
    const idx = accessibility(flight, ferry);
    const confidence = i <= 2 && daySlots.length >= 4 ? 'high' : north[date] || matsu[date] ? 'medium' : 'low';
    const wx = w?.wx ?? daySlots[0]?.wx ?? north[date]?.wx ?? null;
    days.push({
      date,
      offset: i,
      dow,
      dowZh: DOW_ZH[dow],
      zone: i <= 3 ? 'action' : 'watch',
      wx,
      tmin: nn(w?.tmin),
      tmax: nn(w?.tmax),
      pop: nn(w?.pop) ?? popFromWx(wx || ''),
      ferry: {
        score: ferry.score,
        level: ferry.level,
        levelZh: ferry.level ? levelZh[ferry.level] : null,
        reasons: ferry.reasons,
        maintenance: ferry.maintenance,
        raw: north[date]?.raw ?? matsu[date]?.raw ?? null,
      },
      flight: {
        score: flight.score,
        level: flight.level,
        levelZh: flight.level ? flightLevelZh[flight.level] : null,
        reasons: flight.reasons,
        parts: flight.parts,
      },
      accessibility: idx,
      confidence,
      confidenceZh: { high: '高', medium: '中', low: '低' }[confidence],
    });
  }
  const m = +today.slice(5, 7);
  const isHighSeason = m >= 4 && m <= 9;
  days.forEach((d, i) => {
    const wxGood = !/雨|雷/.test(d.wx || '') && (d.flight.parts?.wind ?? 0) < 35;
    d.pricing = pricingAdvice({ offset: d.offset, idx: d.accessibility, prevIdx: days[i - 1]?.accessibility, wxGood, dow: d.dow, isHighSeason });
  });

  const alertList = alerts
    ? parseWarnings(alerts, '連江縣').map((a) => ({
        type: ['wind', 'fog', 'typhoon'].includes(a.type) ? a.type : 'other',
        titleZh: a.titleZh,
        validUntil: a.validUntil,
      }))
    : [];

  return {
    issueTime: marine ? marineIssueTime(marine) : null,
    today: {
      date: today,
      flights: summarizeFlights(tdx?.flights?.flights ?? null, today),
      ferries: summarizeFerries(tdx?.ferries?.ferries ?? null, today, now),
      alerts: alertList,
    },
    days,
    rules: RULES,
  };
}

/** 供 ?date= 參數驗證 */
export function isDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = parseCwaTime(`${s}T12:00:00`);
  return Boolean(d) && !Number.isNaN(d.getTime());
}
