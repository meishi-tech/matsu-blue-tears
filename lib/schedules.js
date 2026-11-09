// lib/schedules.js — TDX 不可用時的靜態班表（status 一律 "unknown"，請前端標示「依業者公告為準」）
//
// ★ 航班來源：交通部民用航空局「國內定期航線班機時刻表」2026 年 11 月、12 月 xlsx
//   https://www.caa.gov.tw/RegularFlight.aspx?a=268&lang=1
//   （11 月檔 FileAtt.ashx?id=41650、12 月檔 id=41651；最後更新 2026/10/01）
//   僅收錄每日固定班次；「僅飛特定日加班機」（B7-9091/9092/9095/9096）不列入。
//   北竿早班機 11–12 月為 07:25／08:55（立榮配合連江縣調整，馬祖日報 2026-09-22
//   https://www.matsu-news.gov.tw/news/article/244619）。
// ★ 臺馬航線來源：馬祖 e 點通「臺馬及島際航班表」 https://etravel.matsu.gov.tw/inter_island_flight_schedules
//   新臺馬輪每日 22:30 自基隆開航（週二航修），單日先馬後東、雙日先東後馬；
//   經濟艙基隆→南竿全票 1,050、南竿→基隆 1,000；南竿↔東引全票 400。
//   馬祖日報每日船班公告（例 https://www.matsu-news.gov.tw/news/article/245798）：
//   東引 06:30 開、南竿 09:30 開、東引 12:00 開（先馬後東日）。
// ★ 島際交通船來源：
//   南竿↔北竿：南竿鄉公所「離島交通」 https://www.nankan.gov.tw/Chhtml/content/2116 、
//     馬祖國家風景區 https://matsu-nsa.gov.tw/zh-TW/transport/island （全票 160、約 15–20 分）
//   南竿↔莒光：馬祖 e 點通（07:00、11:00、14:30；全票 250 非設籍；單月先西後東、雙月先東後西）
//   東莒↔西莒：馬祖 e 點通（每日四班、約 10 分、全票 80）
//   訂票：馬祖海上交通訂位購票系統 https://www.matsuebs.com/
//
// 以上皆為查詢當時（2026-11）的公告，班表會隨季節調整；文件 docs/BACKEND.md 說明更新方式。

import { taipeiDate, toIso08, todayStr } from './time.js';
import { AIRPORTS, AIRLINES, STATUS_LABEL, FERRY_BOOKING_URL } from './tdx.js';

// ---------- 航班（每日固定班次，CAA 2026-11／12 月） ----------
// days: 'daily' 或 [0..6]（0=週日）
export const FLIGHT_TIMETABLE = [
  // 台北松山 ⇄ 南竿
  { airline: 'B7', no: '8751', from: 'TSA', to: 'LZN', dep: '06:30', arr: '07:25', days: 'daily' },
  { airline: 'B7', no: '8755', from: 'TSA', to: 'LZN', dep: '09:30', arr: '10:25', days: 'daily' },
  { airline: 'AE', no: '7901', from: 'TSA', to: 'LZN', dep: '10:30', arr: '11:25', days: 'daily' },
  { airline: 'B7', no: '8759', from: 'TSA', to: 'LZN', dep: '12:25', arr: '13:20', days: 'daily' },
  { airline: 'B7', no: '8775', from: 'TSA', to: 'LZN', dep: '16:05', arr: '17:00', days: 'daily' },
  { airline: 'B7', no: '8752', from: 'LZN', to: 'TSA', dep: '08:00', arr: '08:50', days: 'daily' },
  { airline: 'B7', no: '8756', from: 'LZN', to: 'TSA', dep: '11:00', arr: '11:50', days: 'daily' },
  { airline: 'AE', no: '7902', from: 'LZN', to: 'TSA', dep: '12:20', arr: '13:10', days: 'daily' },
  { airline: 'B7', no: '8760', from: 'LZN', to: 'TSA', dep: '13:55', arr: '14:45', days: 'daily' },
  { airline: 'B7', no: '8776', from: 'LZN', to: 'TSA', dep: '17:30', arr: '18:20', days: 'daily' },
  // 台中 ⇄ 南竿（CAA 註記：週一、二、四為加班機，仍每日有班）
  { airline: 'B7', no: '8731', from: 'RMQ', to: 'LZN', dep: '10:55', arr: '12:00', days: 'daily' },
  { airline: 'B7', no: '8732', from: 'LZN', to: 'RMQ', dep: '12:45', arr: '13:50', days: 'daily' },
  // 台北松山 ⇄ 北竿
  { airline: 'B7', no: '8781', from: 'TSA', to: 'MFK', dep: '07:25', arr: '08:20', days: 'daily' },
  { airline: 'B7', no: '8789', from: 'TSA', to: 'MFK', dep: '15:20', arr: '16:15', days: 'daily' },
  { airline: 'B7', no: '8782', from: 'MFK', to: 'TSA', dep: '08:55', arr: '09:45', days: 'daily' },
  { airline: 'B7', no: '8790', from: 'MFK', to: 'TSA', dep: '16:45', arr: '17:35', days: 'daily' },
  // 高雄 ⇄ 南竿（華信，週一、五）
  { airline: 'AE', no: '7925', from: 'KHH', to: 'LZN', dep: '11:30', arr: '13:10', days: [1, 5] },
  { airline: 'AE', no: '7926', from: 'LZN', to: 'KHH', dep: '13:55', arr: '15:35', days: [1, 5] },
];

const hm = (s) => s.split(':').map(Number);

/**
 * 產生某日的靜態航班清單（合約 flights 結構，status=unknown）。
 */
export function staticFlights(dateStr = todayStr()) {
  const weekday = taipeiDate(dateStr, 12).getUTCDay();
  const out = [];
  for (const f of FLIGHT_TIMETABLE) {
    if (f.days !== 'daily' && !f.days.includes(weekday)) continue;
    const [dh, dm] = hm(f.dep);
    const airline = AIRLINES[f.airline];
    out.push({
      id: `${f.airline}-${f.no}-${f.from}-${f.to}-${dateStr}`,
      airline: airline.zh,
      airlineEn: airline.en,
      flightNo: `${f.airline}${f.no}`,
      from: f.from,
      fromZh: AIRPORTS[f.from].zh,
      to: f.to,
      toZh: AIRPORTS[f.to].zh,
      scheduled: toIso08(taipeiDate(dateStr, dh, dm)),
      estimated: null,
      status: 'unknown',
      statusZh: STATUS_LABEL.unknown.zh,
      statusEn: STATUS_LABEL.unknown.en,
      bookingUrl: airline.booking,
      source: 'static_timetable',
    });
  }
  return out.sort((a, b) => a.scheduled.localeCompare(b.scheduled));
}

// ---------- 臺馬航線（基隆 ⇄ 南竿 ⇄ 東引） ----------
const NEW_TAIMA = { zh: '新臺馬輪', en: 'New Taima' };
const TAIMA_STAR = { zh: '臺馬之星', en: 'Taima Star' };

/**
 * 產生某日的臺馬航線班次。
 * 規則（馬祖 e 點通）：新臺馬輪每日 22:30 基隆開航，週二航修停航；
 *   基隆「單日」出發→先馬後東：隔日(雙日) 南竿 09:30 開往東引、東引 12:00 開回基隆
 *   基隆「雙日」出發→先東後馬：隔日(單日) 東引 06:30 開往南竿、南竿 09:30 開回基隆
 */
export function staticFerries(dateStr = todayStr()) {
  const d = taipeiDate(dateStr, 12);
  const dayOfMonth = Number(dateStr.slice(8, 10));
  const weekday = d.getUTCDay();
  const even = dayOfMonth % 2 === 0;
  const mk = (h, m, routeZh, routeEn, ship, note) => ({
    id: `taima-${dateStr}-${h}${m}-${routeZh.replace(/\s/g, '')}`,
    routeZh: `${routeZh}（${ship.zh}）`,
    routeEn: `${routeEn} (${ship.en})`,
    operatorZh: '全港通航業',
    operatorEn: 'Chuan Kang Tong Shipping',
    scheduled: toIso08(taipeiDate(dateStr, h, m)),
    estimated: null,
    status: 'unknown',
    statusZh: STATUS_LABEL.unknown.zh,
    statusEn: STATUS_LABEL.unknown.en,
    noteZh: note?.zh || null,
    noteEn: note?.en || null,
    bookingUrl: FERRY_BOOKING_URL,
    source: 'static_timetable',
  });

  const out = [];
  // 今日在馬祖端的班次（取決於前一晚自基隆出發的船）
  if (even) {
    // 前一天（單日）自基隆出發 → 先馬後東
    out.push(mk(9, 30, '南竿 → 東引', 'Nangan → Dongyin', NEW_TAIMA, { zh: '先馬後東航次，約 2 小時', en: 'Nangan-first sailing, about 2 h' }));
    out.push(mk(12, 0, '東引 → 基隆', 'Dongyin → Keelung', NEW_TAIMA, { zh: '約 8 小時', en: 'About 8 h' }));
  } else {
    // 前一天（雙日）自基隆出發 → 先東後馬
    out.push(mk(6, 30, '東引 → 南竿', 'Dongyin → Nangan', NEW_TAIMA, { zh: '先東後馬航次，約 2 小時', en: 'Dongyin-first sailing, about 2 h' }));
    out.push(mk(9, 30, '南竿 → 基隆', 'Nangan → Keelung', NEW_TAIMA, { zh: '約 8–10 小時', en: 'About 8–10 h' }));
  }
  // 今晚自基隆出發（週二航修）
  if (weekday !== 2) {
    const firstStop = even ? '東引' : '南竿';
    out.push(
      mk(22, 30, '基隆 → 馬祖', 'Keelung → Matsu', NEW_TAIMA, {
        zh: `${even ? '雙日先東後馬' : '單日先馬後東'}：先抵${firstStop}；經濟艙全票 1,050 元`,
        en: `${even ? 'Even date: Dongyin first' : 'Odd date: Nangan first'}; economy NT$1,050`,
      }),
    );
  } else {
    out.push({
      ...mk(22, 30, '基隆 → 馬祖', 'Keelung → Matsu', NEW_TAIMA),
      status: 'cancelled',
      statusZh: '週二例行航修停航',
      statusEn: 'No sailing (Tuesday maintenance)',
    });
  }
  // 臺馬之星為替代／加班船，無固定每日班次，以公告為準 — 不列靜態班次，避免誤導
  void TAIMA_STAR;
  return out;
}

// ---------- 島際交通船 ----------
export const INTER_ISLAND = [
  {
    id: 'nangan-beigan',
    routeZh: '南竿 ↔ 北竿',
    routeEn: 'Nangan ↔ Beigan',
    portsZh: '福澳港 ↔ 白沙港',
    firstDeparture: '07:00',
    lastDeparture: '17:30',
    frequencyZh: '每日約 15 班（約每 30–60 分鐘一班；南竿多為整點、北竿多為半點開）',
    frequencyEn: 'About 15 sailings daily (every 30–60 min)',
    departuresFromNangan: ['07:00', '07:30', '08:00', '08:30', '09:00', '10:00', '11:00', '11:30', '12:30', '13:30', '15:00', '16:00', '16:30', '17:10', '17:30'],
    departuresFromBeigan: ['07:00', '07:30', '08:00', '08:30', '09:30', '10:20', '11:00', '11:30', '12:00', '13:00', '15:20', '16:00', '16:30', '17:10', '17:30'],
    durationMin: 15,
    priceNtd: 160,
    operatorZh: '南北海運、鴻宇海運',
    bookingUrl: 'https://www.matsuebs.com/',
    noteZh: '30 分鐘內短程船班不提供線上購票，請現場購票（可刷悠遊卡）。',
    noteEn: 'Short crossings are sold at the pier only (EasyCard accepted).',
  },
  {
    id: 'nangan-juguang',
    routeZh: '南竿 ↔ 莒光（東莒／西莒）',
    routeEn: 'Nangan ↔ Juguang (Dongju / Xiju)',
    portsZh: '福澳港 ↔ 猛澳港／青帆港',
    firstDeparture: '07:00',
    lastDeparture: '14:30',
    frequencyZh: '每日 3 班往返（南竿 07:00、11:00、14:30 開；單月先西後東、雙月先東後西）',
    frequencyEn: '3 round trips daily (dep. Nangan 07:00, 11:00, 14:30)',
    departuresFromNangan: ['07:00', '11:00', '14:30'],
    durationMin: 50,
    priceNtd: 250,
    operatorZh: '南北海運（東海明珠、南北之星）',
    bookingUrl: 'https://www.matsuebs.com/',
    noteZh: '非設籍全票 250 元、半票 125 元；可線上訂位。',
    noteEn: 'NT$250 full fare for visitors; online booking available.',
  },
  {
    id: 'nangan-dongyin',
    routeZh: '南竿 ↔ 東引',
    routeEn: 'Nangan ↔ Dongyin',
    portsZh: '福澳港 ↔ 中柱港',
    firstDeparture: '06:30',
    lastDeparture: '09:30',
    frequencyZh: '每日各 1 班（搭臺馬航線客輪：單日 南竿 08:30／09:30 開、東引 06:30 開；雙日 東引 07:30 開）',
    frequencyEn: '1 sailing each way daily via the Keelung ferry',
    durationMin: 120,
    priceNtd: 400,
    operatorZh: '全港通航業（新臺馬輪）／世洋機械科技（臺馬之星）',
    bookingUrl: 'https://www.matsuebs.com/',
    noteZh: '船班隨當日先馬後東／先東後馬調整，出發前請看馬祖日報公告。',
    noteEn: 'Direction depends on the day; check the daily notice before travelling.',
  },
  {
    id: 'dongju-xiju',
    routeZh: '東莒 ↔ 西莒',
    routeEn: 'Dongju ↔ Xiju',
    portsZh: '猛澳港 ↔ 青帆港',
    firstDeparture: '07:30',
    lastDeparture: '17:20',
    frequencyZh: '每日 4 班往返（西莒 07:30、11:00、14:30、17:10 開；東莒 07:40、11:10、14:40、17:20 開）',
    frequencyEn: '4 round trips daily',
    durationMin: 10,
    priceNtd: 80,
    operatorZh: '莒光航業（莒光之星、莒光號）',
    bookingUrl: null,
    noteZh: '現場購票。',
    noteEn: 'Tickets sold at the pier.',
  },
];

export const LIVE_NOTICE = {
  zh: '航班／船班以業者公告為準，濃霧季（3–5 月）停航頻繁；東北季風期（10–3 月）海象不佳時臺馬航線常停航。',
  en: 'Schedules are subject to operator announcements. Fog season (Mar–May) brings frequent cancellations; the Keelung ferry often suspends in rough winter seas.',
};

export const STATIC_NOTICE = {
  zh: '航班／船班以業者公告為準，濃霧季（3–5 月）停航頻繁；東北季風期（10–3 月）海象不佳時臺馬航線常停航。本靜態班表依民航局 2026 年 11–12 月時刻表及馬祖 e 點通資料整理。',
  en: 'Schedules are subject to operator announcements. Fog season (Mar–May) brings frequent cancellations; the Keelung ferry often suspends in rough winter seas. Static timetable compiled from CAA (Nov–Dec 2026) and Matsu eTravel.',
};
