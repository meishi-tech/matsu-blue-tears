// lib/astro.js — 日落／月出月沒／月相照度（無外部依賴）
//
// 演算法移植自 SunCalc（Vladimir Agafonkin，BSD-2-Clause，
// https://github.com/mourner/suncalc），以 Jean Meeus《Astronomical Algorithms》
// 的低精度公式計算，太陽時刻誤差約 ±1 分鐘、月出月沒約 ±數分鐘，足供觀測規劃。

import { taipeiDate, toIso08, toHm } from './time.js';

const { PI, sin, cos, tan, asin, atan2: atan, acos, sqrt, round, abs } = Math;
const rad = PI / 180;
const dayMs = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
const e = rad * 23.4397; // 黃赤交角

// 馬祖（南竿）參考座標 — 南竿機場附近；各島差距 <0.5°，對日月時刻影響 <2 分鐘
export const MATSU = { lat: 26.16, lng: 119.95 };

// ---------- 基礎公式 ----------
const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
const toDays = (date) => toJulian(date) - J2000;

const rightAscension = (l, b) => atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l));
const declination = (l, b) => asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
const azimuth = (H, phi, dec) => atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi));
const altitude = (H, phi, dec) => asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

function astroRefraction(h) {
  if (h < 0) h = 0; // 低於地平線時以 0 計算，避免 tan 發散
  return 0.0002967 / tan(h + 0.00312536 / (h + 0.08901179));
}

// ---------- 太陽 ----------
const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)); // 中心差
  const P = rad * 102.9372; // 近日點黃經
  return M + C + P + PI;
}
function sunCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

export function getSunPosition(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return { azimuth: azimuth(H, phi, c.dec), altitude: altitude(H, phi, c.dec) };
}

const SUN_TIMES = [
  [-0.833, 'sunrise', 'sunset'],
  [-0.3, 'sunriseEnd', 'sunsetStart'],
  [-6, 'dawn', 'dusk'],
  [-12, 'nauticalDawn', 'nauticalDusk'],
  [-18, 'nightEnd', 'night'],
  [6, 'goldenHourEnd', 'goldenHour'],
];
const J0 = 0.0009;
const julianCycle = (d, lw) => round(d - J0 - lw / (2 * PI));
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
const hourAngle = (h, phi, d) => acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d)));
const observerAngle = (height) => (-2.076 * sqrt(height)) / 60;
function getSetJ(h, lw, phi, dec, n, M, L) {
  const w = hourAngle(h, phi, dec);
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

/**
 * 太陽時刻（date 取該日中午附近最穩定；回傳 Date 物件）。
 */
export function getSunTimes(date, lat, lng, height = 0) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const dh = observerAngle(height);
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const result = { solarNoon: fromJulian(Jnoon), nadir: fromJulian(Jnoon - 0.5) };
  for (const [deg, riseName, setName] of SUN_TIMES) {
    const h0 = (deg + dh) * rad;
    const Jset = getSetJ(h0, lw, phi, dec, n, M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    result[riseName] = fromJulian(Jrise);
    result[setName] = fromJulian(Jset);
  }
  return result;
}

// ---------- 月亮 ----------
function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d); // 平黃經
  const M = rad * (134.963 + 13.064993 * d); // 平近點角
  const F = rad * (93.272 + 13.22935 * d); // 升交點距
  const l = L + rad * 6.289 * sin(M);
  const b = rad * 5.128 * sin(F);
  const dt = 385001 - 20905 * cos(M); // km
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
}

export function getMoonPosition(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  const pa = atan(sin(H), tan(phi) * cos(c.dec) - sin(c.dec) * cos(H));
  h += astroRefraction(h);
  return { azimuth: azimuth(H, phi, c.dec), altitude: h, distance: c.dist, parallacticAngle: pa };
}

/**
 * 月相與照度。
 * phase: 0 新月、0.25 上弦、0.5 滿月、0.75 下弦；fraction: 被照亮比例 0..1
 */
export function getMoonIllumination(date = new Date()) {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149_598_000; // 日地距離 km
  const phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra));
  const inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi));
  const angle = atan(
    cos(s.dec) * sin(s.ra - m.ra),
    sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra),
  );
  return {
    fraction: (1 + cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / PI,
    angle,
  };
}

const hoursLater = (date, h) => new Date(date.valueOf() + (h * dayMs) / 24);

/**
 * 月出／月沒：以「台灣當地 0 時」為一天起點掃描 24 小時。
 * @param {string} dateStr YYYY-MM-DD（台灣日期）
 */
export function getMoonTimes(dateStr, lat, lng) {
  const t = taipeiDate(dateStr, 0, 0, 0);
  const hc = 0.133 * rad;
  let h0 = getMoonPosition(t, lat, lng).altitude - hc;
  let rise;
  let set;
  let ye;
  for (let i = 1; i <= 24; i += 2) {
    const h1 = getMoonPosition(hoursLater(t, i), lat, lng).altitude - hc;
    const h2 = getMoonPosition(hoursLater(t, i + 1), lat, lng).altitude - hc;
    const a = (h0 + h2) / 2 - h1;
    const b = (h2 - h0) / 2;
    const xe = -b / (2 * a);
    ye = (a * xe + b) * xe + h1;
    const dsc = b * b - 4 * a * h1;
    let roots = 0;
    let x1 = 0;
    let x2 = 0;
    if (dsc >= 0) {
      const dx = sqrt(dsc) / (abs(a) * 2);
      x1 = xe - dx;
      x2 = xe + dx;
      if (abs(x1) <= 1) roots++;
      if (abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
    }
    if (roots === 1) {
      if (h0 < 0) rise = i + x1;
      else set = i + x1;
    } else if (roots === 2) {
      rise = i + (ye < 0 ? x2 : x1);
      set = i + (ye < 0 ? x1 : x2);
    }
    if (rise !== undefined && set !== undefined) break;
    h0 = h2;
  }
  const result = { rise: null, set: null, alwaysUp: false, alwaysDown: false };
  if (rise !== undefined) result.rise = hoursLater(t, rise);
  if (set !== undefined) result.set = hoursLater(t, set);
  if (rise === undefined && set === undefined) result[ye > 0 ? 'alwaysUp' : 'alwaysDown'] = true;
  return result;
}

// ---------- 月相命名 ----------
const PHASES = [
  { max: 0.0625, emoji: '🌑', zh: '新月', en: 'New Moon' },
  { max: 0.1875, emoji: '🌒', zh: '眉月', en: 'Waxing Crescent' },
  { max: 0.3125, emoji: '🌓', zh: '上弦月', en: 'First Quarter' },
  { max: 0.4375, emoji: '🌔', zh: '盈凸月', en: 'Waxing Gibbous' },
  { max: 0.5625, emoji: '🌕', zh: '滿月', en: 'Full Moon' },
  { max: 0.6875, emoji: '🌖', zh: '虧凸月', en: 'Waning Gibbous' },
  { max: 0.8125, emoji: '🌗', zh: '下弦月', en: 'Last Quarter' },
  { max: 0.9375, emoji: '🌘', zh: '殘月', en: 'Waning Crescent' },
  { max: 1.0001, emoji: '🌑', zh: '新月', en: 'New Moon' },
];

export function describeMoon(date) {
  const { fraction, phase } = getMoonIllumination(date);
  const p = PHASES.find((x) => phase < x.max) || PHASES[0];
  return {
    phase: Math.round(phase * 1000) / 1000,
    illumination: Math.round(fraction * 1000) / 1000,
    emoji: p.emoji,
    nameZh: p.zh,
    nameEn: p.en,
  };
}

// ---------- 觀測窗口 ----------
/**
 * 計算某一天晚上的天文資訊與「最暗觀測窗口」。
 * 觀測候選時段：航海薄暮（太陽 -6°）起，至隔日 00:30 止。
 * 月光干擾定義：月亮在地平線上且照度 > 0.15。
 */
export function nightAstro(dateStr, { lat, lng } = MATSU) {
  const noon = taipeiDate(dateStr, 12);
  const sun = getSunTimes(noon, lat, lng);
  const moonTimes = getMoonTimes(dateStr, lat, lng);
  // 以晚上 21:00 的月相代表「今晚」
  const moon = describeMoon(taipeiDate(dateStr, 21));

  const winStart = sun.dusk; // 民用薄暮結束，天色已暗
  const winEnd = taipeiDate(dateStr, 24, 30); // 隔日 00:30
  const stepMin = 10;
  const samples = [];
  for (let t = winStart.getTime(); t <= winEnd.getTime(); t += stepMin * 60_000) {
    const d = new Date(t);
    const mp = getMoonPosition(d, lat, lng);
    const moonUp = mp.altitude > 0;
    samples.push({ t, moonUp, alt: mp.altitude, dark: !moonUp || moon.illumination <= 0.15 });
  }

  // 找最長連續 dark 區段
  let best = null;
  let cur = null;
  for (const s of samples) {
    if (s.dark) {
      if (!cur) cur = { start: s.t, end: s.t };
      else cur.end = s.t;
    } else if (cur) {
      if (!best || cur.end - cur.start > best.end - best.start) best = cur;
      cur = null;
    }
  }
  if (cur && (!best || cur.end - cur.start > best.end - best.start)) best = cur;

  let reasonZh;
  let reasonEn;
  let start;
  let end;
  let moonDownInWindow = false;

  if (best && best.end - best.start >= 50 * 60_000) {
    start = new Date(best.start);
    end = new Date(best.end);
    const firstDark = samples[0].dark;
    const lastDark = samples[samples.length - 1].dark;
    const allDark = samples.every((s) => s.dark);
    moonDownInWindow = samples
      .filter((s) => s.t >= best.start && s.t <= best.end)
      .every((s) => !s.moonUp);
    if (allDark && moon.illumination <= 0.15) {
      reasonZh = '月相接近新月，整晚皆暗';
      reasonEn = 'Near new moon; dark all evening';
    } else if (allDark) {
      reasonZh = '整晚月亮都在地平線下';
      reasonEn = 'Moon below the horizon all evening';
    } else if (firstDark && !lastDark) {
      reasonZh = '日落後至月出前最暗';
      reasonEn = 'Darkest between sunset and moonrise';
    } else if (!firstDark && lastDark) {
      reasonZh = '月沒後最暗';
      reasonEn = 'Darkest after moonset';
    } else {
      reasonZh = '月亮在地平線下的時段最暗';
      reasonEn = 'Darkest while the moon is below the horizon';
    }
  } else {
    // 整晚有月光：挑月亮高度最低的 2.5 小時
    const span = Math.round((150 / stepMin));
    let bestIdx = 0;
    let bestSum = Infinity;
    for (let i = 0; i + span < samples.length; i++) {
      let sum = 0;
      for (let k = i; k <= i + span; k++) sum += Math.max(samples[k].alt, 0);
      if (sum < bestSum) {
        bestSum = sum;
        bestIdx = i;
      }
    }
    start = new Date(samples[bestIdx].t);
    end = new Date(samples[Math.min(bestIdx + span, samples.length - 1)].t);
    if (moonTimes.set && moonTimes.set > winStart && moonTimes.set <= winEnd) {
      // 月沒時間太晚（午夜前後），窗口不足 50 分鐘；仍提示月沒時刻
      reasonZh = `月沒（${toHm(moonTimes.set)}）後最暗，但時間已晚；傍晚月亮較低時亦可嘗試`;
      reasonEn = `Darkest after moonset (${toHm(moonTimes.set)}), though late; early evening is a fallback`;
    } else {
      reasonZh = '整晚有月光，建議選月亮較低的時段';
      reasonEn = 'Moon up all evening; pick the hours when it is lowest';
    }
  }

  // 對齊到 5 分鐘（開始無條件進位、結束無條件捨去），顯示較乾淨
  const FIVE = 5 * 60_000;
  start = new Date(Math.ceil(start.getTime() / FIVE) * FIVE);
  end = new Date(Math.floor(end.getTime() / FIVE) * FIVE);

  return {
    sunset: toIso08(sun.sunset),
    dusk: toIso08(sun.dusk),
    moonrise: toIso08(moonTimes.rise),
    moonset: toIso08(moonTimes.set),
    moon,
    moonDownInWindow,
    bestWindow: {
      start: toIso08(start),
      end: toIso08(end),
      reasonZh,
      reasonEn,
    },
    viewTime: `${toHm(start)}-${toHm(end)}`,
    _raw: { sunset: sun.sunset, dusk: sun.dusk, windowStart: start, windowEnd: end },
  };
}
