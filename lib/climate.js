// lib/climate.js — 連江縣（馬祖）各月氣候平均，供「model 模式」（無 CWA 金鑰或上游失敗）使用
//
// 來源：
// - 氣溫、降雨日數：中央氣象署馬祖氣象站（站號 46799 / 467990，南竿）2005–2020 平均，
//   轉引自 Wikipedia「Matsu Islands」氣候表（Source: Central Weather Bureau）
//   https://en.wikipedia.org/wiki/Matsu_Islands
//   （馬祖站 2004 年設站，尚未納入氣象署 1991–2020 三十年平均表
//    https://www.cwa.gov.tw/V8/C/C/Statistics/monthlymean.html）
// - 盛行風向與風速：連江縣防救災資訊網「自然環境」—「4 月至 8 月東南風或南風；9 月至翌年 3 月屬東北風、
//   西北風或北風季節；11 月平均秒速約 9 公尺，8 月約 3 公尺」 https://www.lcfd.gov.tw/disaster/nature/
//   以及東引鄉公所「第三章 氣候」 https://www.dongyin.gov.tw/chhtml/Detail/2535?mcid=97206
// - 霧季：連江縣防救災資訊網「春夏交際多霧」（3–5 月）。
//
// 風速為依上述兩個端點（11 月 9 m/s、8 月 3 m/s）線性內插的月平均估計值，僅供模型推估。

export const MONTHLY = [
  // month: 1..12
  { month: 1, meanC: 10.6, maxC: 12.8, minC: 8.8, rainDays: 8.3, windDir: 'NE', windMs: 8.5, fog: false },
  { month: 2, meanC: 10.6, maxC: 13.3, minC: 8.5, rainDays: 11.4, windDir: 'NE', windMs: 8.0, fog: false },
  { month: 3, meanC: 12.8, maxC: 16.1, minC: 10.3, rainDays: 14.6, windDir: 'NE', windMs: 7.0, fog: true },
  { month: 4, meanC: 17.1, maxC: 20.6, minC: 14.4, rainDays: 13.6, windDir: 'SE', windMs: 5.5, fog: true },
  { month: 5, meanC: 21.5, maxC: 24.6, minC: 19.1, rainDays: 15.5, windDir: 'S', windMs: 4.5, fog: true },
  { month: 6, meanC: 25.2, maxC: 27.8, minC: 23.1, rainDays: 13.5, windDir: 'SW', windMs: 4.0, fog: false },
  { month: 7, meanC: 27.8, maxC: 30.8, minC: 25.6, rainDays: 6.1, windDir: 'SW', windMs: 3.5, fog: false },
  { month: 8, meanC: 28.0, maxC: 31.4, minC: 25.8, rainDays: 9.9, windDir: 'S', windMs: 3.0, fog: false },
  { month: 9, meanC: 26.4, maxC: 29.2, minC: 24.4, rainDays: 9.6, windDir: 'NE', windMs: 5.0, fog: false },
  { month: 10, meanC: 22.7, maxC: 25.0, minC: 20.8, rainDays: 6.0, windDir: 'NE', windMs: 7.5, fog: false },
  { month: 11, meanC: 18.4, maxC: 20.6, minC: 16.6, rainDays: 8.5, windDir: 'NE', windMs: 9.0, fog: false },
  { month: 12, meanC: 13.3, maxC: 15.5, minC: 11.4, rainDays: 7.3, windDir: 'N', windMs: 8.8, fog: false },
];

/** 取得某月（1..12）的氣候平均，並換算成 API 需要的欄位 */
export function climatology(month) {
  const m = MONTHLY[((month - 1) % 12 + 12) % 12];
  const daysInMonth = 30.4;
  return {
    tempC: Math.round(m.minC + (m.meanC - m.minC) * 0.5), // 夜間氣溫約介於日均溫與最低溫之間
    tempMinC: Math.round(m.minC),
    tempMaxC: Math.round(m.maxC),
    windDir: m.windDir,
    windKmh: Math.round(m.windMs * 3.6),
    pop: Math.round((m.rainDays / daysInMonth) * 100), // 以降雨日數比例近似降雨機率
    wxZh: m.fog ? '多雲時陰，易有霧' : m.rainDays >= 13 ? '多雲短暫雨' : '多雲',
    wxEn: m.fog ? 'Mostly cloudy, fog likely' : m.rainDays >= 13 ? 'Cloudy with showers' : 'Partly cloudy',
    fogSeason: m.fog,
  };
}
