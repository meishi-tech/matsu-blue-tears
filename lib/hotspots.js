// lib/hotspots.js — 固定熱點清單與地點修正
//
// 座標來源：交通部觀光署馬祖國家風景區管理處景點頁（https://www.matsu-nsa.gov.tw）與維基百科條目。
// 修正值說明（加總後加到當日分數，範圍約 −15 ～ +12）：
//   aspect  面向：面向南／西南（夏季盛行風向迎風面）為正；面北為負。
//   light   光害：無光害（坑道、無人沙灘）為正；鄰近聚落燈光為負。
//   shelter 遮蔽：灣澳內浪靜、藍眼淚容易聚集為正。
// 北海坑道搖櫓需預約：馬祖國家風景區管理處南竿遊客中心 0836-22177；
//   線上預約 https://www.matsu-nsa.gov.tw/user/Article.aspx?a=2612&lang=1

export const HOTSPOTS = [
  {
    id: 'beihai',
    nameZh: '北海坑道',
    nameEn: 'Beihai Tunnel',
    island: 'nangan', islandZh: '南竿', islandEn: 'Nangan',
    lat: 26.1430, lng: 119.9288,
    modifiers: { aspect: 2, light: 8, shelter: 6 },
    descZh: '坑道內搖櫓賞淚，需預約；全無光害，弱光下也可見點點藍光。',
    descEn: 'Rowboat tours inside the sheltered tunnel (booking required); zero light pollution so even faint glows are visible.',
    tips: { zh: '搖櫓船每晚約 18:30–21:00 分梯次，旺季請提早一週預約；坑道外步道可免費觀賞。', en: 'Rowboat slots run roughly 18:30–21:00; book a week ahead in peak season. The outer walkway is free.' },
    bookingUrl: 'https://www.matsu-nsa.gov.tw/user/Article.aspx?a=2612&lang=1',
    accessZh: '南竿仁愛村，距梅石約 8 分鐘車程，停車方便。',
    accessEn: 'Ren’ai Village, Nangan — about 8 min by car from Meishi; parking available.',
  },
  {
    id: 'tiebao',
    nameZh: '鐵堡',
    nameEn: 'Iron Fort',
    island: 'nangan', islandZh: '南竿', islandEn: 'Nangan',
    lat: 26.1420, lng: 119.9209,
    modifiers: { aspect: 4, light: 2, shelter: 0 },
    descZh: '突出海面的岩礁據點，面向西南，浪花拍岸時藍光明顯。',
    descEn: 'A fortified rock jutting into the sea, facing southwest; waves breaking on the rocks light up well.',
    tips: { zh: '步道階梯濕滑，夜間請帶紅光手電筒；據點內禁止攀爬礁岩。', en: 'Steps get slippery; bring a red-light torch and stay off the rocks.' },
    bookingUrl: null,
    accessZh: '南竿仁愛村，鐵堡停車場步行 3 分鐘。',
    accessEn: 'Ren’ai Village, Nangan — 3 min walk from the Iron Fort car park.',
  },
  {
    id: 'dahan',
    nameZh: '大漢據點',
    nameEn: 'Dahan Stronghold',
    island: 'nangan', islandZh: '南竿', islandEn: 'Nangan',
    lat: 26.1406, lng: 119.9291,
    modifiers: { aspect: 3, light: 4, shelter: 2 },
    descZh: '北海坑道旁的岬角據點，坑道射口可俯瞰海面藍光。',
    descEn: 'Headland fort next to Beihai Tunnel; the gun ports look straight down on the glowing surf.',
    tips: { zh: '可與北海坑道一併安排；據點內部夜間照明少，注意腳步。', en: 'Combine with Beihai Tunnel; interior lighting is minimal at night.' },
    bookingUrl: null,
    accessZh: '南竿仁愛村，北海坑道停車場步行 5 分鐘。',
    accessEn: 'Ren’ai Village, Nangan — 5 min walk from the Beihai Tunnel car park.',
  },
  {
    id: 'jinsha',
    nameZh: '津沙聚落',
    nameEn: 'Jinsha Village',
    island: 'nangan', islandZh: '南竿', islandEn: 'Nangan',
    lat: 26.1461, lng: 119.9132,
    modifiers: { aspect: 5, light: -2, shelter: 4 },
    descZh: '南竿西南角的沙灘聚落，面向夏季南風，沙灘上可直接踩出藍光。',
    descEn: 'A beach village on Nangan’s southwest tip facing the summer southerlies; you can stir up glow with your feet.',
    tips: { zh: '退潮時沙灘面積大、較好走；聚落有民宿燈光，往海灘西側較暗。', en: 'Low tide exposes more beach; head to the darker west end away from guesthouse lights.' },
    bookingUrl: null,
    accessZh: '南竿津沙村，距福澳港約 15 分鐘車程。',
    accessEn: 'Jinsha Village, Nangan — about 15 min by car from Fu’ao Harbour.',
  },
  {
    id: 'qinbi',
    nameZh: '芹壁村',
    nameEn: 'Qinbi Village',
    island: 'beigan', islandZh: '北竿', islandEn: 'Beigan',
    lat: 26.2248, lng: 119.9837,
    modifiers: { aspect: -4, light: -4, shelter: 3 },
    descZh: '閩東石屋聚落前的芹壁澳口，面北、聚落燈光較亮，需風向配合。',
    descEn: 'The cove below the stone-house village faces north and has village lighting; needs the right wind.',
    tips: { zh: '往龜島方向的海堤較暗；北風天時澳內反而有機會聚集。', en: 'The seawall toward Turtle Islet is darker; northerly winds can push glow into the cove.' },
    bookingUrl: null,
    accessZh: '北竿芹壁村，距白沙港約 10 分鐘車程。',
    accessEn: 'Qinbi Village, Beigan — about 10 min by car from Baisha Harbour.',
  },
  {
    id: 'qiaozai',
    nameZh: '橋仔村',
    nameEn: 'Qiaozai Village',
    island: 'beigan', islandZh: '北竿', islandEn: 'Beigan',
    lat: 26.2333, lng: 119.9958,
    modifiers: { aspect: -3, light: 0, shelter: 5 },
    descZh: '北竿北側的漁村澳口，港內水面平靜，船隻划過時藍光明顯。',
    descEn: 'A quiet fishing cove on Beigan’s north shore; boats stirring the calm water leave glowing trails.',
    tips: { zh: '漁港碼頭請勿影響作業；可向在地業者詢問夜航賞淚船。', en: 'Keep clear of working boats; local operators run night boat tours.' },
    bookingUrl: null,
    accessZh: '北竿橋仔村，距白沙港約 12 分鐘車程。',
    accessEn: 'Qiaozai Village, Beigan — about 12 min by car from Baisha Harbour.',
  },
  {
    id: 'fuzheng',
    nameZh: '東莒福正沙灘',
    nameEn: 'Fuzheng Beach (Dongju)',
    island: 'dongju', islandZh: '東莒', islandEn: 'Dongju',
    lat: 25.9669, lng: 119.9834,
    modifiers: { aspect: 2, light: 6, shelter: 4 },
    descZh: '東莒燈塔下的白沙灘，幾乎無光害，是公認最穩定的賞淚點之一。',
    descEn: 'White-sand beach below Dongju Lighthouse with almost no light pollution; one of the most reliable spots.',
    tips: { zh: '需住宿東莒一晚；沙灘可同時看星空。', en: 'Requires an overnight stay on Dongju; great for stargazing too.' },
    bookingUrl: null,
    accessZh: '東莒福正村，距猛澳港約 10 分鐘車程。',
    accessEn: 'Fuzheng Village, Dongju — about 10 min by car from Meng’ao Harbour.',
  },
  {
    id: 'dapu',
    nameZh: '東莒大埔聚落',
    nameEn: 'Dapu Village (Dongju)',
    island: 'dongju', islandZh: '東莒', islandEn: 'Dongju',
    lat: 25.9552, lng: 119.9744,
    modifiers: { aspect: 6, light: 7, shelter: 3 },
    descZh: '東莒南側無人聚落的石滬與澳口，面南迎風，是最暗的觀測點。',
    descEn: 'Stone weirs and a south-facing cove by a near-empty village on Dongju’s south side; the darkest spot.',
    tips: { zh: '石滬礁石濕滑，建議漲潮前抵達；無路燈請備照明。', en: 'Weir rocks are slippery—arrive before the tide rises; no street lights, bring a torch.' },
    bookingUrl: null,
    accessZh: '東莒大坪村，距猛澳港約 8 分鐘車程。',
    accessEn: 'Daping Village, Dongju — about 8 min by car from Meng’ao Harbour.',
  },
  {
    id: 'kunqiu',
    nameZh: '西莒坤坵沙灘',
    nameEn: 'Kunqiu Beach (Xiju)',
    island: 'xiju', islandZh: '西莒', islandEn: 'Xiju',
    lat: 25.9766, lng: 119.9330,
    modifiers: { aspect: 2, light: 6, shelter: 2 },
    descZh: '西莒西側沙灘與方塊海，無光害、面向西方，日落後即可開始觀測。',
    descEn: 'Beach and tidal “block sea” on Xiju’s west coast; dark and west-facing, so viewing starts right after sunset.',
    tips: { zh: '退潮時可見方塊海地形；夜間海崖邊請勿靠近。', en: 'Low tide reveals the block-sea formations; keep away from cliff edges at night.' },
    bookingUrl: null,
    accessZh: '西莒坤坵村，距青帆港約 10 分鐘車程。',
    accessEn: 'Kunqiu Village, Xiju — about 10 min by car from Qingfan Harbour.',
  },
  {
    id: 'dongyin',
    nameZh: '東引（燈塔／后澳）',
    nameEn: 'Dongyin (Lighthouse / Hou’ao)',
    island: 'dongyin', islandZh: '東引', islandEn: 'Dongyin',
    lat: 26.3654, lng: 120.5105,
    modifiers: { aspect: -2, light: 5, shelter: -3 },
    descZh: '馬祖最北島嶼，海崖陡峭、水質清澈，季節稍晚；燈塔與后澳一帶最暗。',
    descEn: 'Matsu’s northernmost island with steep cliffs and clear water; the season runs a little later here.',
    tips: { zh: '懸崖邊風大，請勿越過護欄；需搭臺馬輪往返。', en: 'Strong winds on the cliffs—stay behind the railings; reached by the Keelung ferry.' },
    bookingUrl: null,
    accessZh: '東引樂華村，距中柱港約 10 分鐘車程。',
    accessEn: 'Lehua Village, Dongyin — about 10 min by car from Zhongzhu Harbour.',
  },
];

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** 地點修正總和 */
export function modifierSum(spot) {
  const m = spot.modifiers || {};
  return (m.aspect || 0) + (m.light || 0) + (m.shelter || 0);
}

export function intensityOf(score) {
  return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
}

/**
 * 把當日狀態套到每個熱點。
 * @param {object} day  { score, viewTime, seaTempC, windDir, windKmh, tideZh, tideEn }
 */
export function buildHotspots(day) {
  return HOTSPOTS.map((spot) => {
    const score = clamp(Math.round(day.score + modifierSum(spot)));
    const { modifiers, ...pub } = spot;
    return {
      ...pub,
      score,
      intensity: intensityOf(score),
      viewTime: day.viewTime,
      seaTempC: day.seaTempC ?? null,
      windDir: day.windDir,
      windKmh: day.windKmh,
      tideZh: day.tideZh,
      tideEn: day.tideEn,
      modifiers,
    };
  });
}
