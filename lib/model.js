// lib/model.js — 藍眼淚指數（0–100）
//
// score = Σ weight × factor（各因子 0–100）
// 權重：季節 0.25、月光 0.20、風 0.20、天空(雲/雨) 0.15、海溫 0.10、潮汐 0.10
// 規則依 docs/API-CONTRACT.md「藍眼淚指數模型」。

export const WEIGHTS = {
  season: 0.25,
  moon: 0.2,
  wind: 0.2,
  sky: 0.15,
  seaTemp: 0.1,
  tide: 0.1,
};

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** 季節標籤：10–2 off、3–4 early、5–7 peak、8–9 late */
export function seasonOf(month) {
  if (month >= 5 && month <= 7) return 'peak';
  if (month === 3 || month === 4) return 'early';
  if (month === 8 || month === 9) return 'late';
  return 'off';
}

/** 季節因子：5–7 月 100、4 與 8 月 70、3 與 9 月 40、其他 10 */
export function seasonFactor(month) {
  if (month >= 5 && month <= 7) return 100;
  if (month === 4 || month === 8) return 70;
  if (month === 3 || month === 9) return 40;
  return 10;
}

/**
 * 月光因子：100 × (1 − illumination)；若觀測窗口內月亮在地平線下則加成至 ≥ 85
 * @param {number} illumination 0..1
 * @param {boolean} moonDownInWindow
 */
export function moonFactor(illumination, moonDownInWindow) {
  let f = 100 * (1 - clamp(illumination ?? 0.5, 0, 1));
  if (moonDownInWindow) f = Math.max(f, 85);
  return Math.round(clamp(f));
}

const SOUTHERLY = new Set(['S', 'SW', 'SE', 'SSW', 'SSE']);
const NORTHERLY = new Set(['N', 'NE', 'NW', 'NNE', 'NNW']);

/**
 * 風因子：S/SW/SE 風 8–20 km/h 100；0–8 60；20–30 40；>30 10；北風系 −20
 * 南風把外海的夜光藻推向北岸澳口，是馬祖藍眼淚大爆發的關鍵條件。
 */
export function windFactor(windDir, windKmh) {
  if (windKmh == null || Number.isNaN(windKmh)) return 50; // 無資料
  let f;
  if (windKmh > 30) f = 10;
  else if (windKmh > 20) f = 40;
  else if (windKmh >= 8) f = SOUTHERLY.has(windDir) ? 100 : 80;
  else f = 60;
  if (NORTHERLY.has(windDir)) f -= 20;
  return Math.round(clamp(f));
}

/**
 * 天空因子：pop 0–10% 100；線性降至 pop 70% 為 10；wx 含「雨」再 −20
 */
export function skyFactor(pop, wxZh = '') {
  if (pop == null || Number.isNaN(pop)) return 50;
  let f;
  if (pop <= 10) f = 100;
  else if (pop >= 70) f = 10;
  else f = 100 - ((pop - 10) / 60) * 90;
  if (/雨/.test(wxZh)) f -= 20;
  return Math.round(clamp(f));
}

/**
 * 海溫因子：20–26°C 100；16–20 或 26–29 60；其他 25；無資料給 50
 */
export function seaTempFactor(seaTempC) {
  if (seaTempC == null || Number.isNaN(seaTempC)) return 50;
  if (seaTempC >= 20 && seaTempC <= 26) return 100;
  if ((seaTempC >= 16 && seaTempC < 20) || (seaTempC > 26 && seaTempC <= 29)) return 60;
  return 25;
}

/**
 * 潮汐因子：觀測時段內漲潮或滿潮前後 2 小時 100，退潮 50；無資料 50
 * @param {Array<{time: Date, type: '滿潮'|'乾潮'}>} tides 當日（含隔日凌晨）潮汐事件
 * @param {Date} winStart
 * @param {Date} winEnd
 */
export function tideFactor(tides, winStart, winEnd) {
  if (!tides?.length || !winStart || !winEnd) return 50;
  const TWO_H = 2 * 3_600_000;
  const mid = new Date((winStart.getTime() + winEnd.getTime()) / 2);
  // 滿潮前後 2 小時與窗口有交集 → 100
  for (const t of tides) {
    if (t.type === '滿潮') {
      const a = t.time.getTime() - TWO_H;
      const b = t.time.getTime() + TWO_H;
      if (a <= winEnd.getTime() && b >= winStart.getTime()) return 100;
    }
  }
  // 否則看窗口中點是漲潮還是退潮：找中點前最近的一個事件
  const before = tides.filter((t) => t.time <= mid).sort((x, y) => y.time - x.time)[0];
  if (before) return before.type === '乾潮' ? 100 : 50; // 乾潮之後 = 漲潮中
  const after = tides.filter((t) => t.time > mid).sort((x, y) => x.time - y.time)[0];
  if (after) return after.type === '滿潮' ? 100 : 50; // 下一個是滿潮 = 漲潮中
  return 50;
}

/** 窗口中點的潮況描述 */
export function tideState(tides, at) {
  if (!tides?.length || !at) return { zh: '資料不足', en: 'No data' };
  const before = tides.filter((t) => t.time <= at).sort((x, y) => y.time - x.time)[0];
  const after = tides.filter((t) => t.time > at).sort((x, y) => x.time - y.time)[0];
  const ref = before || after;
  if (!ref) return { zh: '資料不足', en: 'No data' };
  const rising = before ? before.type === '乾潮' : after.type === '滿潮';
  const HOUR = 3_600_000;
  if (after && Math.abs(after.time - at) < HOUR) {
    return after.type === '滿潮' ? { zh: '接近滿潮', en: 'Near high tide' } : { zh: '接近乾潮', en: 'Near low tide' };
  }
  return rising ? { zh: '漲潮中', en: 'Rising' } : { zh: '退潮中', en: 'Falling' };
}

export function levelOf(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * 綜合計算。
 * @param {object} input
 * @param {number} input.month
 * @param {number} input.illumination
 * @param {boolean} input.moonDownInWindow
 * @param {string} input.windDir  8 方位英文（NE 等）
 * @param {number} input.windKmh
 * @param {number} input.pop
 * @param {string} input.wxZh
 * @param {number|null} input.seaTempC
 * @param {Array} input.tides
 * @param {Date} input.winStart
 * @param {Date} input.winEnd
 */
export function computeScore(input) {
  const factors = {
    season: seasonFactor(input.month),
    moon: moonFactor(input.illumination, input.moonDownInWindow),
    wind: windFactor(input.windDir, input.windKmh),
    sky: skyFactor(input.pop, input.wxZh),
    seaTemp: seaTempFactor(input.seaTempC),
    tide: tideFactor(input.tides, input.winStart, input.winEnd),
  };
  let score = 0;
  for (const k of Object.keys(WEIGHTS)) score += WEIGHTS[k] * factors[k];
  score = Math.round(clamp(score));
  return { score, level: levelOf(score), factors };
}

/** 中英文摘要（狀態列一句話） */
export function summarize({ score, level, factors, moon, windDir, windKmh, pop, season, fogAlert, mode }) {
  const zh = [];
  const en = [];

  if (season === 'off') {
    zh.push('非藍眼淚季節（主要為 4–9 月）');
    en.push('Off-season (blue tears peak Apr–Sep)');
  } else if (season === 'peak') {
    zh.push('正值藍眼淚旺季');
    en.push('Peak blue-tears season');
  }

  if (moon.illumination >= 0.7) {
    zh.push('月光偏亮');
    en.push('bright moon');
  } else if (moon.illumination <= 0.2 || factors.moon >= 85) {
    zh.push('月光干擾小');
    en.push('little moonlight');
  }

  if (windKmh != null) {
    const dir = windDir || '';
    if (windKmh > 30) {
      zh.push(`${dir} 風強勁`);
      en.push(`strong ${dir} wind`);
    } else if (windKmh > 20) {
      zh.push(`${dir} 風稍強`);
      en.push(`brisk ${dir} wind`);
    } else if (factors.wind >= 90) {
      zh.push('南風有利藍眼淚靠岸');
      en.push('favourable southerly wind');
    }
  }

  if (pop != null && pop >= 50) {
    zh.push('降雨機率高');
    en.push('high chance of rain');
  }
  if (fogAlert) {
    zh.push('有濃霧特報');
    en.push('dense fog advisory in effect');
  }

  const chanceZh = level === 'high' ? '觀測機會高' : level === 'medium' ? '觀測機會中等' : '觀測機會偏低';
  const chanceEn = level === 'high' ? 'good chance tonight' : level === 'medium' ? 'moderate chance tonight' : 'low chance tonight';

  let summaryZh = `${zh.length ? zh.join('、') + '，' : ''}${chanceZh}（指數 ${score}）。`;
  let summaryEn = `${en.length ? capitalize(en.join(', ')) + '; ' : ''}${chanceEn} (index ${score}).`;
  if (mode === 'model') {
    summaryZh += ' 目前為天文＋氣候平均推估，非即時氣象。';
    summaryEn += ' Estimated from astronomy and climate normals, not live weather.';
  }
  return { summaryZh, summaryEn };
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
