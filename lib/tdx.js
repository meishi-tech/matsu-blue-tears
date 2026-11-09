// lib/tdx.js — 交通部 TDX 運輸資料流通服務（https://tdx.transportdata.tw）
//
// 認證：OAuth2 client_credentials
//   POST https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token
//   token 預設有效 86400 秒，這裡快取到期前 5 分鐘。
//
// 使用端點（皆為 https://tdx.transportdata.tw/api/basic 底下）：
//   航班 FIDS（陣列）：GET /v2/Air/FIDS/Airport/Departure/{IATA}、/Arrival/{IATA}
//     欄位：FlightDate, FlightNumber(純數字), AirlineID, DepartureAirportID, ArrivalAirportID,
//           ScheduleDepartureTime, EstimatedDepartureTime, ActualDepartureTime, DepartureRemark,
//           DepartureRemarkEn（到站為 *Arrival* 版本）
//     機場：LZN 南竿、MFK 北竿；出發地 TSA 松山、RMQ 台中、KHH 高雄
//   船班即時看板：GET /v3/Ship/ShipLiveBoard/Domestic/City/LienchiangCounty
//     回傳 {UpdateTime, Items:[{ShipDate, PortID, PortName{ZhTw,En},
//           DepartureLiveBoards:[{RouteID, VesselName{Zh_tw,En}, ArrivalPortName{ZhTw,En},
//           ScheduledDepartureTime, EstimateDepartureTime, ActualDepartureTime, DepartureRemark, DepartureRemarkEn}],
//           ArrivalLiveBoards:[...]}]}
//   路徑與欄位依 TDX OAS：
//     航空 https://tdx.transportdata.tw/webapi/File/Swagger/V3/eb87998f-2f9c-4592-8d75-c62e5b724962
//     航運 https://tdx.transportdata.tw/webapi/File/Swagger/V3/38e6a4c2-5111-4449-8f37-6347caf4a7fc

import { fetchJson } from './http.js';
import { cached, cacheGet, cacheSet, DEFAULT_TTL_SEC } from './cache.js';
import { toIso08, parseCwaTime } from './time.js';

const TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const BASE = 'https://tdx.transportdata.tw/api/basic';

export const AIRPORTS = {
  LZN: { zh: '南竿', en: 'Nangan' },
  MFK: { zh: '北竿', en: 'Beigan' },
  TSA: { zh: '台北松山', en: 'Taipei Songshan' },
  RMQ: { zh: '台中', en: 'Taichung' },
  KHH: { zh: '高雄', en: 'Kaohsiung' },
};
export const AIRLINES = {
  B7: { zh: '立榮航空', en: 'UNI AIR', booking: 'https://www.uniair.com.tw/rwd/B2C/booking/ubk_search.aspx' },
  AE: { zh: '華信航空', en: 'Mandarin Airlines', booking: 'https://www.mandarin-airlines.com/' },
};
export const FERRY_BOOKING_URL = 'https://www.matsuebs.com/home/SelectShip';

export function isConfigured() {
  return Boolean(process.env.TDX_CLIENT_ID && process.env.TDX_CLIENT_SECRET);
}

/** 取得 access token（記憶體快取） */
let tokenInflight = null;
export async function getToken() {
  const hit = cacheGet('tdx:token');
  if (hit) return hit;
  // 同一實例並發請求共用一次 token 請求（TDX token 端點有頻率限制）
  if (tokenInflight) return tokenInflight;
  tokenInflight = requestToken().finally(() => { tokenInflight = null; });
  return tokenInflight;
}

async function requestToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.TDX_CLIENT_ID,
    client_secret: process.env.TDX_CLIENT_SECRET,
  });
  const json = await fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    timeoutMs: 7000,
  });
  if (!json?.access_token) throw new Error('TDX token response missing access_token');
  const ttl = Math.max(60, (Number(json.expires_in) || 86400) - 300);
  return cacheSet('tdx:token', json.access_token, ttl);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// TDX 會員金鑰有每秒呼叫上限：同一實例內的資料請求排隊、間隔 250 ms，遇 429 等 1.2 秒重試一次
let queue = Promise.resolve();
function throttled(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {}).then(() => sleep(250));
  return run;
}

async function get(path, params = {}) {
  const token = await getToken();
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('$format', 'JSON');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const once = () => fetchJson(url.toString(), { headers: { authorization: `Bearer ${token}` }, timeoutMs: 7000 });
  return throttled(async () => {
    try {
      return await once();
    } catch (err) {
      if (!/HTTP 429/.test(err?.message || '')) throw err;
      await sleep(1200);
      return once();
    }
  });
}

// ---------- 狀態對照 ----------
/**
 * 把 FIDS / 船班備註轉成合約狀態碼。
 */
export function normalizeStatus(remarkZh = '', remarkEn = '') {
  const z = remarkZh || '';
  const e = (remarkEn || '').toLowerCase();
  if (/取消|停航|停飛/.test(z) || /cancel/.test(e)) return 'cancelled';
  if (/延誤|延遲|延後/.test(z) || /delay/.test(e)) return 'delayed';
  if (/已到|到達|抵達|已抵/.test(z) || /arriv/.test(e)) return 'arrived';
  if (/已離|離站|起飛|出發|離港|已開/.test(z) || /depart|airborne/.test(e)) return 'departed';
  if (/準時|正常|出發準時|預定|安檢中|報到|登機/.test(z) || /on ?time|schedule|boarding|check/.test(e)) return 'on_time';
  return 'unknown';
}
export const STATUS_LABEL = {
  on_time: { zh: '準時', en: 'On time' },
  delayed: { zh: '延誤', en: 'Delayed' },
  cancelled: { zh: '取消', en: 'Cancelled' },
  departed: { zh: '已出發', en: 'Departed' },
  arrived: { zh: '已抵達', en: 'Arrived' },
  unknown: { zh: '依業者公告', en: 'See operator' },
};

// ---------- 航班 ----------
/**
 * 把 FIDS 陣列（出發或到達）轉為合約 flights 項目。
 * @param {Array} rows
 * @param {'departure'|'arrival'} kind
 */
export function parseFids(rows, kind) {
  const out = [];
  for (const r of rows || []) {
    if (r?.IsCargo) continue;
    const airline = AIRLINES[r.AirlineID] || { zh: r.AirlineID, en: r.AirlineID, booking: null };
    const num = String(r.FlightNumber || '').replace(/^\D+/, '');
    const flightNo = `${r.AirlineID}${num}`;
    const from = r.DepartureAirportID;
    const to = r.ArrivalAirportID;
    const sched = parseCwaTime(kind === 'departure' ? r.ScheduleDepartureTime : r.ScheduleArrivalTime);
    const est = parseCwaTime(
      kind === 'departure'
        ? r.EstimatedDepartureTime || r.ActualDepartureTime
        : r.EstimatedArrivalTime || r.ActualArrivalTime,
    );
    const remarkZh = kind === 'departure' ? r.DepartureRemark : r.ArrivalRemark;
    const remarkEn = kind === 'departure' ? r.DepartureRemarkEn : r.ArrivalRemarkEn;
    const status = normalizeStatus(remarkZh, remarkEn);
    out.push({
      id: `${r.AirlineID}-${num}-${from}-${to}-${(r.FlightDate || '').slice(0, 10)}`,
      airline: airline.zh,
      airlineEn: airline.en,
      flightNo,
      from,
      fromZh: AIRPORTS[from]?.zh || from,
      to,
      toZh: AIRPORTS[to]?.zh || to,
      scheduled: sched ? toIso08(sched) : null,
      estimated: est ? toIso08(est) : null,
      status,
      statusZh: remarkZh || STATUS_LABEL[status].zh,
      statusEn: remarkEn || STATUS_LABEL[status].en,
      bookingUrl: airline.booking,
      source: 'tdx',
    });
  }
  return out;
}

/** 取南竿、北竿兩機場的出發＋到達 FIDS，合併去重並依表定時間排序 */
export async function fetchFlights() {
  if (!isConfigured()) return null;
  return cached('tdx:flights', async () => {
    const calls = [];
    for (const iata of ['LZN', 'MFK']) {
      calls.push(get(`/v2/Air/FIDS/Airport/Departure/${iata}`, { $top: 60 }).then((r) => parseFids(r, 'departure')));
      calls.push(get(`/v2/Air/FIDS/Airport/Arrival/${iata}`, { $top: 60 }).then((r) => parseFids(r, 'arrival')));
    }
    const results = await Promise.allSettled(calls);
    const okResults = results.filter((r) => r.status === 'fulfilled');
    if (!okResults.length) throw results[0].reason;
    const map = new Map();
    for (const r of okResults) for (const f of r.value) if (!map.has(f.id)) map.set(f.id, f);
    const flights = [...map.values()].sort((a, b) => String(a.scheduled).localeCompare(String(b.scheduled)));
    return { flights, fetchedAt: new Date().toISOString(), partial: okResults.length < results.length };
  }, DEFAULT_TTL_SEC);
}

// ---------- 船班 ----------
const PORT_EN = {
  基隆港: 'Keelung', 南竿福澳港: 'Nangan (Fu’ao)', 福澳港: 'Nangan (Fu’ao)', 東引中柱港: 'Dongyin (Zhongzhu)',
  中柱港: 'Dongyin (Zhongzhu)', 北竿白沙港: 'Beigan (Baisha)', 白沙港: 'Beigan (Baisha)',
  東莒猛澳港: 'Dongju (Meng’ao)', 西莒青帆港: 'Xiju (Qingfan)', 臺北港: 'Taipei Port', 台北港: 'Taipei Port',
};
const portEn = (zh, en) => en || PORT_EN[zh] || zh;

/**
 * 把 ShipLiveBoard 包裝物件轉為合約 ferries 項目（只取出發看板，避免與到達重複）。
 */
export function parseShipLiveBoard(wrapper) {
  const items = wrapper?.Items || wrapper?.ShipLiveBoardses || [];
  const out = [];
  for (const port of items) {
    const fromZh = port?.PortName?.ZhTw || port?.PortID || '';
    const fromEn = portEn(fromZh, port?.PortName?.En);
    for (const d of port?.DepartureLiveBoards || []) {
      const toZh = d?.ArrivalPortName?.ZhTw || d?.ArrivalPortID || '';
      const toEn = portEn(toZh, d?.ArrivalPortName?.En);
      const vesselZh = d?.VesselName?.Zh_tw || d?.VesselName?.ZhTw || '';
      const vesselEn = d?.VesselName?.En || vesselZh;
      const sched = parseCwaTime(d.ScheduledDepartureTime);
      const est = parseCwaTime(d.EstimateDepartureTime || d.ActualDepartureTime);
      const status = normalizeStatus(d.DepartureRemark, d.DepartureRemarkEn);
      out.push({
        id: `${d.RouteID || 'route'}-${d.VesselID || vesselZh}-${sched ? sched.getTime() : 'na'}`,
        routeZh: `${fromZh} → ${toZh}${vesselZh ? `（${vesselZh}）` : ''}`,
        routeEn: `${fromEn} → ${toEn}${vesselEn ? ` (${vesselEn})` : ''}`,
        operatorZh: null, // LiveBoard 不含業者欄位
        vesselZh,
        scheduled: sched ? toIso08(sched) : null,
        estimated: est ? toIso08(est) : null,
        status,
        statusZh: d.DepartureRemark || STATUS_LABEL[status].zh,
        statusEn: (status !== 'unknown' ? STATUS_LABEL[status].en : null) || d.DepartureRemarkEn || STATUS_LABEL[status].en,
        cancelReason: d.CancelReason || null,
        bookingUrl: FERRY_BOOKING_URL,
        source: 'tdx',
      });
    }
  }
  return out.sort((a, b) => String(a.scheduled).localeCompare(String(b.scheduled)));
}

export async function fetchFerries() {
  if (!isConfigured()) return null;
  return cached('tdx:ferries', async () => {
    const wrapper = await get('/v3/Ship/ShipLiveBoard/Domestic/City/LienchiangCounty', { $top: 200 });
    return { ferries: parseShipLiveBoard(wrapper), fetchedAt: wrapper?.UpdateTime || new Date().toISOString() };
  }, DEFAULT_TTL_SEC);
}

/** 一次取回 TDX 資料；回傳 sources.tdx 區塊與資料 */
export async function loadAll() {
  if (!isConfigured()) return { status: 'not_configured', fetchedAt: null, flights: null, ferries: null, errors: [] };
  const [f, s] = await Promise.allSettled([fetchFlights(), fetchFerries()]);
  const flights = f.status === 'fulfilled' ? f.value : null;
  const ferries = s.status === 'fulfilled' ? s.value : null;
  const errors = [f, s].filter((r) => r.status === 'rejected').map((r) => r.reason?.message || String(r.reason));
  return {
    status: flights || ferries ? 'live' : 'unavailable',
    fetchedAt: flights?.fetchedAt || ferries?.fetchedAt || null,
    flights,
    ferries,
    errors,
  };
}
