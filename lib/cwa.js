// lib/cwa.js — 中央氣象署開放資料（https://opendata.cwa.gov.tw）
//
// 使用的資料集：
//  - F-D0047-083 連江縣鄉鎮未來 1 週（逐 12 小時）天氣預報。欄位為 PascalCase：
//      records.Locations[0].Location[].WeatherElement[].Time[].ElementValue[]
//    結構依官方產品說明 https://www.cwa.gov.tw/Data/data_catalog/1-1-1.pdf 及
//    open-tw/cwa-sdk 型別 https://github.com/open-tw/cwa-sdk ；樣本見 tests/fixtures/。
//  - F-A0021-001 潮汐預報（未來 1 個月）。LocationId：南竿鄉 09007010、北竿鄉 09007020、
//    莒光鄉 09007030、東引鄉 09007040（已以 API 實測驗證）。
//  - O-B0075-001 海象監測（48 小時浮標／潮位站）。馬祖資料浮標 StationID = C6W08
//    （連江縣東引鄉，東引島東南方約 1.5–3 km），提供 SeaTemperature。
//    測站代碼參考 https://www.cwa.gov.tw/V8/C/M/OBS_Marine_30day.html?MID=OAC005 與
//    O-B0076-001 測站資料集。
//  - W-C0033-001 天氣特報（濃霧、陸上強風等），locationName=連江縣。
//  - F-A0012-001 海面天氣預報（臺灣北部海面／馬祖海面，5 天，每 6 小時）。只在 fileapi 提供：
//      https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-A0012-001?Authorization=KEY&format=JSON
//    會 302 轉址到檔案儲存；Node fetch 預設 follow。結構 cwaopendata.Dataset.Locations.Location[]。
//  - F-D0047-081 連江縣鄉鎮未來 3 天（逐 3 小時；前段逐 1 小時）天氣預報，LocationName=南竿鄉。
//    供 /transport-risk 的航班霧／風判定；原始 JSON 交給 lib/transport-risk.js 解析。
//
// 沒有 CWA_API_KEY 時所有 fetch* 直接回傳 null，呼叫端應改用 model 模式。

import { fetchJson } from './http.js';
import { cached, DEFAULT_TTL_SEC } from './cache.js';
import { parseCwaTime, toDateStr, toIso08 } from './time.js';

// 2026-11-10T23:00:00+08:00 → 11/10 23:00（台灣時間）
function humanTime(d) {
  const m = toIso08(d).match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${+m[1]}/${+m[2]} ${m[3]}:${m[4]}` : toIso08(d);
}

const BASE = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore';
const FILE_BASE = 'https://opendata.cwa.gov.tw/fileapi/v1/opendataapi';

export const DATASETS = {
  weekly: 'F-D0047-083',
  tide: 'F-A0021-001',
  marine: 'O-B0075-001',
  warning: 'W-C0033-001',
  marineForecast: 'F-A0012-001',
  threeHourly: 'F-D0047-081',
};

export const TIDE_LOCATION_IDS = {
  nangan: '09007010',
  beigan: '09007020',
  juguang: '09007030',
  dongyin: '09007040',
};

export const MATSU_BUOY_ID = 'C6W08';

export function apiKey() {
  return process.env.CWA_API_KEY || '';
}
export function isConfigured() {
  return Boolean(apiKey());
}

async function get(dataset, params = {}) {
  const url = new URL(`${BASE}/${dataset}`);
  url.searchParams.set('Authorization', apiKey());
  url.searchParams.set('format', 'JSON');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const json = await fetchJson(url.toString(), { timeoutMs: 7000 });
  // 新舊兩種包裝：{success:"true", records} 或 {Success:"true", Records}
  const ok = String(json?.success ?? json?.Success ?? '').toLowerCase() === 'true';
  if (!ok) throw new Error(`CWA ${dataset} returned success=false`);
  return json;
}

/** fileapi 資料集（無 success 欄位；302 轉址由 fetch follow） */
async function getFile(dataset) {
  const url = new URL(`${FILE_BASE}/${dataset}`);
  url.searchParams.set('Authorization', apiKey());
  url.searchParams.set('format', 'JSON');
  const json = await fetchJson(url.toString(), { timeoutMs: 9000 });
  if (!json || typeof json !== 'object' || !json.cwaopendata) throw new Error(`CWA ${dataset} fileapi returned unexpected payload`);
  return json;
}

// ---------- 共用對照 ----------
const WIND_DIR_ZH2EN = {
  北風: 'N', 東北風: 'NE', 東風: 'E', 東南風: 'SE',
  南風: 'S', 西南風: 'SW', 西風: 'W', 西北風: 'NW',
  偏北風: 'N', 偏東風: 'E', 偏南風: 'S', 偏西風: 'W',
};
export function windDirToEn(zh) {
  if (!zh) return null;
  return WIND_DIR_ZH2EN[zh.trim()] || WIND_DIR_ZH2EN[`${zh.trim()}風`] || null;
}

/**
 * CWA 數值欄位可能是 "9"、">= 11"、"-"、"" 等；轉成 number 或 null。
 * ">= 11" 以 11 計（保守下限）。
 */
export function numOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === '-' || s === 'None') return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** 天氣現象中→英（先查常見詞表，再以規則組合） */
const WX_TABLE = {
  晴: 'Sunny', 晴時多雲: 'Sunny, partly cloudy at times', 多雲時晴: 'Partly cloudy, sunny at times',
  多雲: 'Cloudy', 多雲時陰: 'Mostly cloudy', 陰時多雲: 'Overcast, partly cloudy at times', 陰: 'Overcast',
  晴午後短暫雷陣雨: 'Sunny, afternoon thunderstorms', 多雲午後短暫雷陣雨: 'Cloudy, afternoon thunderstorms',
  多雲短暫雨: 'Cloudy with occasional rain', 多雲短暫陣雨: 'Cloudy with brief showers',
  陰短暫雨: 'Overcast with occasional rain', 陰短暫陣雨: 'Overcast with brief showers',
  陰時多雲短暫雨: 'Overcast with occasional rain', 陰時多雲短暫陣雨: 'Overcast with brief showers',
  多雲時陰短暫雨: 'Mostly cloudy with occasional rain', 多雲時陰短暫陣雨: 'Mostly cloudy with brief showers',
  陰有雨: 'Overcast with rain', 陰有陣雨: 'Overcast with showers', 陰天: 'Overcast', 多雲有霧: 'Cloudy with fog',
};
export function wxToEn(zh = '') {
  const s = zh.replace(/\s/g, '');
  if (!s) return '';
  if (WX_TABLE[s]) return WX_TABLE[s];
  let base = '';
  if (/^晴/.test(s)) base = 'Sunny';
  else if (/^多雲時陰/.test(s)) base = 'Mostly cloudy';
  else if (/^多雲/.test(s)) base = 'Cloudy';
  else if (/^陰/.test(s)) base = 'Overcast';
  const parts = [base];
  if (/雷陣雨|雷雨/.test(s)) parts.push('with thunderstorms');
  else if (/陣雨/.test(s)) parts.push(/短暫/.test(s) ? 'with brief showers' : 'with showers');
  else if (/雨/.test(s)) parts.push(/短暫/.test(s) ? 'with occasional rain' : 'with rain');
  if (/霧/.test(s)) parts.push('with fog');
  if (/雪/.test(s)) parts.push('with snow');
  return parts.filter(Boolean).join(' ') || zh;
}

/** 無 12 小時降雨機率（第 4 天起 CWA 給 "-"）時，用天氣現象粗估 */
export function popFromWx(wxZh = '') {
  if (/雷/.test(wxZh)) return 60;
  if (/雨/.test(wxZh)) return 45;
  if (/^陰/.test(wxZh)) return 25;
  if (/多雲/.test(wxZh)) return 15;
  if (/晴/.test(wxZh)) return 5;
  return null;
}

// ---------- F-D0047-083 一週預報 ----------
/**
 * 把一週預報整理成「每日」結構。
 * 回傳 Map<dateStr, {date, tempMinC, tempMaxC, tempNightC, windDir, windKmh, wxZh, wxEn, pop}>
 * 夜間欄位取當日 18:00 起的 12 小時時段；若當天已沒有夜間段（過了晚上 6 點前發布）則取最後一段。
 */
export function parseWeekly(json, locationName = '南竿鄉') {
  const locations = json?.records?.Locations?.[0]?.Location || [];
  const loc = locations.find((l) => l.LocationName === locationName) || locations[0];
  if (!loc) return new Map();

  const byName = new Map();
  for (const we of loc.WeatherElement || []) byName.set(we.ElementName, we.Time || []);

  // 索引：dateStr → { day: {...}, night: {...} }
  const days = new Map();
  const ensure = (dateStr) => {
    if (!days.has(dateStr)) days.set(dateStr, { date: dateStr, day: {}, night: {}, maxes: [], mins: [] });
    return days.get(dateStr);
  };
  const periodOf = (start) => (start.getUTCHours() + 8) % 24 >= 12 ? 'night' : 'day'; // 18:00 起算為夜間段

  const put = (elementName, field, valueKey, transform = (v) => v) => {
    for (const t of byName.get(elementName) || []) {
      const start = parseCwaTime(t.StartTime || t.DataTime);
      if (!start) continue;
      const raw = t.ElementValue?.[0]?.[valueKey];
      if (raw == null || String(raw).trim() === '' || String(raw).trim() === '-') continue;
      const value = transform(raw);
      if (value == null) continue;
      const dateStr = toDateStr(start);
      const slot = ensure(dateStr);
      slot[periodOf(start)][field] = value;
      if (field === 'tempMax') slot.maxes.push(value);
      if (field === 'tempMin') slot.mins.push(value);
    }
  };

  put('平均溫度', 'temp', 'Temperature', numOrNull);
  put('最高溫度', 'tempMax', 'MaxTemperature', numOrNull);
  put('最低溫度', 'tempMin', 'MinTemperature', numOrNull);
  put('風速', 'windMs', 'WindSpeed', numOrNull);
  put('風向', 'windDirZh', 'WindDirection', String);
  put('12小時降雨機率', 'pop', 'ProbabilityOfPrecipitation', numOrNull);
  put('天氣現象', 'wxZh', 'Weather', String);

  const out = new Map();
  for (const [dateStr, slot] of days) {
    const n = Object.keys(slot.night).length ? slot.night : slot.day;
    const d = Object.keys(slot.day).length ? slot.day : slot.night;
    const windMs = n.windMs ?? d.windMs;
    const wxZh = n.wxZh ?? d.wxZh ?? null;
    const popRaw = n.pop ?? d.pop ?? null;
    out.set(dateStr, {
      date: dateStr,
      tempMinC: slot.mins.length ? Math.min(...slot.mins) : (n.temp ?? null),
      tempMaxC: slot.maxes.length ? Math.max(...slot.maxes) : (d.temp ?? null),
      tempNightC: n.temp ?? d.temp ?? null,
      windDir: windDirToEn(n.windDirZh ?? d.windDirZh),
      windDirZh: n.windDirZh ?? d.windDirZh ?? null,
      windKmh: windMs != null ? Math.round(windMs * 3.6) : null,
      wxZh,
      wxEn: wxToEn(wxZh || ''),
      pop: popRaw ?? popFromWx(wxZh || ''),
      popEstimated: popRaw == null, // true = 由天氣現象推估，非 CWA 數值
    });
  }
  return out;
}

export async function fetchWeekly(locationName = '南竿鄉') {
  if (!isConfigured()) return null;
  return cached(`cwa:weekly:${locationName}`, async () => {
    const json = await get(DATASETS.weekly, { LocationName: locationName });
    return { days: parseWeekly(json, locationName), fetchedAt: new Date().toISOString() };
  }, DEFAULT_TTL_SEC);
}

// ---------- F-A0021-001 潮汐 ----------
/**
 * 回傳 Map<dateStr, {date, range, events:[{time: Date, iso, type, heightCm}]}>
 * heightCm 採 AboveTWVD（相對台灣高程基準，公分）。
 */
export function parseTide(json) {
  const forecasts = json?.records?.TideForecasts || [];
  const loc = forecasts[0]?.Location;
  const out = new Map();
  for (const d of loc?.TimePeriods?.Daily || []) {
    const events = (d.Time || [])
      .map((t) => {
        const time = parseCwaTime(t.DateTime);
        if (!time) return null;
        const h = t.TideHeights || {};
        const cm = h.AboveTWVD ?? h.AboveLocalMSL ?? h.AboveChartDatum;
        return {
          time,
          iso: toIso08(time),
          type: t.Tide, // 滿潮 / 乾潮
          heightCm: cm != null && cm !== '' ? Number(cm) : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);
    out.set(d.Date, { date: d.Date, range: d.TideRange || null, events });
  }
  return out;
}

export async function fetchTide(locationId = TIDE_LOCATION_IDS.nangan) {
  if (!isConfigured()) return null;
  return cached(`cwa:tide:${locationId}`, async () => {
    const json = await get(DATASETS.tide, { LocationId: locationId });
    return { days: parseTide(json), fetchedAt: new Date().toISOString() };
  }, 3600); // 潮汐預報一天內不會變，快取 1 小時
}

// ---------- O-B0075-001 海象觀測（海溫） ----------
/**
 * 取最新一筆有效的海溫；回傳 {seaTempC, observedAt, stationId} 或 null
 */
export function parseMarine(json, stationId = MATSU_BUOY_ID) {
  const locs = json?.Records?.SeaSurfaceObs?.Location || json?.records?.SeaSurfaceObs?.Location || [];
  const loc = locs.find((l) => l?.Station?.StationID === stationId);
  if (!loc) return null;
  const obs = [...(loc.StationObsTimes?.StationObsTime || [])].reverse();
  for (const o of obs) {
    const v = o?.WeatherElements?.SeaTemperature;
    const n = Number(v);
    if (v != null && v !== 'None' && v !== '-' && !Number.isNaN(n)) {
      return { seaTempC: Math.round(n * 10) / 10, observedAt: o.DateTime, stationId };
    }
  }
  return null;
}

export async function fetchMarine(stationId = MATSU_BUOY_ID) {
  if (!isConfigured()) return null;
  return cached(`cwa:marine:${stationId}`, async () => {
    const json = await get(DATASETS.marine, { StationID: stationId });
    return { ...(parseMarine(json, stationId) || { seaTempC: null }), fetchedAt: new Date().toISOString() };
  }, DEFAULT_TTL_SEC);
}

// ---------- W-C0033-001 天氣特報 ----------
/**
 * 回傳 alerts 陣列（合約 transport.alerts 結構）。
 */
export function parseWarnings(json, locationName = '連江縣') {
  const locs = json?.records?.location || [];
  const loc = locs.find((l) => l.locationName === locationName) || locs[0];
  const hazards = loc?.hazardConditions?.hazards || [];
  return hazards
    .map((h) => {
      const phenomena = h?.info?.phenomena || '';
      const significance = h?.info?.significance || '特報';
      let type = 'wind';
      let titleEn = `${phenomena} ${significance}`;
      if (/霧/.test(phenomena)) {
        type = 'fog';
        titleEn = 'Dense fog advisory';
      } else if (/颱風/.test(phenomena)) {
        type = 'typhoon';
        titleEn = /海上/.test(phenomena) ? 'Typhoon warning (sea)' : 'Typhoon warning (land)';
      } else if (/強風/.test(phenomena)) {
        type = 'wind';
        titleEn = /海上/.test(phenomena) ? 'Strong wind advisory (sea)' : 'Strong wind advisory (land)';
      } else if (/大雨|豪雨/.test(phenomena)) {
        type = 'rain';
        titleEn = 'Heavy rain advisory';
      } else if (/低溫/.test(phenomena)) {
        type = 'cold';
        titleEn = 'Low temperature advisory';
      }
      const issuedAt = parseCwaTime(h?.validTime?.startTime);
      const validUntil = parseCwaTime(h?.validTime?.endTime);
      return {
        type,
        severity: /警報/.test(significance) ? 'warning' : 'advisory',
        titleZh: `${locationName}${phenomena}${significance}`,
        titleEn,
        bodyZh: `中央氣象署針對${locationName}發布${phenomena}${significance}，有效至 ${validUntil ? humanTime(validUntil) : '另行公告'}。`,
        bodyEn: `CWA has issued a ${titleEn.toLowerCase()} for Lienchiang County${validUntil ? `, valid until ${humanTime(validUntil)}` : ''}.`,
        issuedAt: issuedAt ? toIso08(issuedAt) : null,
        validUntil: validUntil ? toIso08(validUntil) : null,
      };
    });
}

export async function fetchWarnings(locationName = '連江縣') {
  if (!isConfigured()) return null;
  return cached(`cwa:warn:${locationName}`, async () => {
    const json = await get(DATASETS.warning, { locationName });
    return { alerts: parseWarnings(json, locationName), fetchedAt: new Date().toISOString() };
  }, DEFAULT_TTL_SEC);
}

// ---------- /transport-risk 用的原始 JSON（交給 lib/transport-risk.js 解析） ----------
const stamp = (json) => ({ json, fetchedAt: new Date().toISOString() });

/** F-A0012-001 海面天氣預報（fileapi，含臺灣北部海面／馬祖海面 5 天） */
export async function fetchMarineForecast() {
  if (!isConfigured()) return null;
  return cached('cwa:marine-forecast', async () => stamp(await getFile(DATASETS.marineForecast)), DEFAULT_TTL_SEC);
}

/** F-D0047-081 連江縣逐 3 小時（南竿鄉） */
export async function fetchThreeHourly(locationName = '南竿鄉') {
  if (!isConfigured()) return null;
  return cached(`cwa:3h:${locationName}`, async () => stamp(await get(DATASETS.threeHourly, { LocationName: locationName })), DEFAULT_TTL_SEC);
}

/** F-D0047-083 一週預報原始 JSON（南竿鄉） */
export async function fetchWeeklyRaw(locationName = '南竿鄉') {
  if (!isConfigured()) return null;
  return cached(`cwa:weekly-raw:${locationName}`, async () => stamp(await get(DATASETS.weekly, { LocationName: locationName })), DEFAULT_TTL_SEC);
}

/** W-C0033-001 天氣特報原始 JSON（連江縣） */
export async function fetchWarningsRaw(locationName = '連江縣') {
  if (!isConfigured()) return null;
  return cached(`cwa:warn-raw:${locationName}`, async () => stamp(await get(DATASETS.warning, { locationName })), DEFAULT_TTL_SEC);
}

/**
 * 一次取回所有 CWA 資料，個別失敗不影響其他；回傳 sources.cwa 區塊與資料。
 */
export async function loadAll() {
  if (!isConfigured()) {
    return { status: 'not_configured', fetchedAt: null, datasets: [], weekly: null, tide: null, marine: null, warnings: null, errors: [] };
  }
  const [weekly, tide, marine, warnings] = await Promise.allSettled([
    fetchWeekly(),
    fetchTide(),
    fetchMarine(),
    fetchWarnings(),
  ]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  const errors = [weekly, tide, marine, warnings]
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message || String(r.reason));
  const datasets = [];
  if (val(weekly)) datasets.push(DATASETS.weekly);
  if (val(tide)) datasets.push(DATASETS.tide);
  if (val(marine)) datasets.push(DATASETS.marine);
  if (val(warnings)) datasets.push(DATASETS.warning);
  const w = val(weekly);
  return {
    // 以「一週預報」是否成功判定 live；其他資料集缺少仍可運作
    status: w ? 'live' : 'unavailable',
    fetchedAt: w?.fetchedAt || val(tide)?.fetchedAt || null,
    datasets,
    weekly: w,
    tide: val(tide),
    marine: val(marine),
    warnings: val(warnings),
    errors,
  };
}
