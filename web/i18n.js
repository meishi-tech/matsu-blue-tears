/* 馬祖藍眼淚預報 — i18n 字典 / UI string dictionary (zh-Hant, en) */
(function (global) {
  'use strict';

  var DICT = {
    zh: {
      appName: '馬祖藍眼淚預報',
      brand: '梅石譯境 Meistone',
      tab_map: '地圖', tab_forecast: '預報', tab_stay: '住宿', tab_transport: '交通', tab_me: '我的',
      close: '關閉',
      season_off: '非季節', season_early: '季初', season_peak: '盛季', season_late: '季末',
      score_label: '今晚藍眼淚指數 {n} 分',
      level_high: '高', level_medium: '中', level_low: '低',
      updated: '更新 {t}',
      mock_short: '備援資料',
      // 資料來源徽章
      badge_live: '資料來源：中央氣象署 / TDX，更新於 {t}',
      badge_model: '模型推估・尚未連接即時氣象資料',
      badge_cache: '離線快取・最後更新 {t}',
      badge_mock: '離線備援資料・非即時',
      badge_loading: '載入中…',
      note_model: '目前顯示為模型推估（天文計算＋氣候平均），尚未連接即時氣象資料；藍眼淚為自然現象，無法保證出現。',
      note_live: '資料來源：交通部中央氣象署氣象資料開放平臺、TDX 運輸資料流通服務。更新於 {t}。',
      note_cache: '目前離線，顯示的是最後一次成功取得的資料（{t}）。',
      note_mock: '目前無法連線到伺服器，顯示的是內建備援資料，僅供介面參考，非即時預報。',
      // 地圖
      locate_me: '定位我', locating: '定位中…',
      view_all: '全部觀測點', view_core: '南北竿', view_all_aria: '顯示全部觀測點（含東引、莒光）', view_core_aria: '聚焦南竿與北竿',
      geo_denied: '無法取得你的位置。若要顯示最近的觀賞點，請在系統設定中允許本 App 使用定位。',
      geo_unavailable: '目前無法取得定位，請稍後再試。',
      geo_unsupported: '此裝置不支援定位功能。',
      geo_far: '你目前距離馬祖較遠，以下是離你最近的觀賞點。',
      nearby_title: '離你最近的觀賞點',
      km: '公里',
      popup_tonight: '今晚建議', popup_wind: '風', popup_tide: '潮汐', popup_sea: '海溫', popup_score: '指數',
      popup_navigate: '導航', popup_book: '預約', popup_fav: '收藏', popup_unfav: '取消收藏',
      fav_added: '已加入收藏', fav_removed: '已從收藏移除',
      no_data: '—',
      // 預報
      forecast_title: '七日預報',
      best_window: '最佳觀賞時段',
      moon: '月相', illumination: '照度', tides: '潮汐', weather: '天氣', pop: '降雨機率', wind: '風', temp: '氣溫', sunset: '日落', moonrise: '月出', moonset: '月沒',
      factors_title: '六項因子',
      f_season: '季節', f_moon: '月光', f_wind: '風況', f_sky: '天空', f_seaTemp: '海溫', f_tide: '潮汐',
      expand_day: '展開 {d} 詳細預報', collapse_day: '收合 {d} 詳細預報',
      today: '今天',
      tide_high: '滿潮', tide_low: '乾潮',
      summary_fallback: '依據季節、月光、風況、天空、海溫與潮汐綜合評估。',
      // 住宿
      stay_title: '住宿推薦',
      stay_price_note: '以官網為準',
      stay_from: '/晚起',
      book_now: '立即預訂',
      stay1_name: '歷史建築梅石軍官茶室', stay1_label: '歷史建築 · 海景客房',
      stay1_tag1: '歷史建築', stay1_tag2: '海景', stay1_tag3: '藍眼淚最佳觀測點',
      stay2_name: '大梅石創生共享家', stay2_label: '共享空間 · 藝文體驗',
      stay2_tag1: '共享空間', stay2_tag2: '藝術家駐村', stay2_tag3: '深度體驗',
      // 交通
      transport_title: '交通方式',
      flights: '航班', ferries: '客輪', interisland: '島際交通',
      transport_static: '班表為參考，請以業者公告為準。',
      transport_live: 'TDX 即時班表，更新於 {t}。',
      transport_empty: '今日無班次資料。',
      sailings_per_day: '{n} 班／日', first_last: '首班 {a} · 末班 {b}', duration_min: '{n} 分鐘',
      status_on_time: '準時', status_delayed: '延誤', status_cancelled: '取消', status_departed: '已起飛', status_arrived: '已抵達', status_unknown: '依業者公告',
      alerts_title: '特報',
      // 我的
      me_title: '我的',
      favorites: '收藏景點', favorites_empty: '尚未收藏任何景點。到地圖點選熱點後按「收藏」即可加入。',
      view_on_map: '地圖', remove: '移除',
      reminder: '觀賞提醒',
      reminder_toggle: '今晚最佳時段提醒',
      reminder_sub_auto: '最佳時段開始前 30 分鐘通知',
      reminder_time: '自訂提醒時間',
      reminder_time_sub: '留空則使用最佳時段前 30 分鐘',
      reminder_denied: '通知權限未開啟。請在系統設定中允許本 App 傳送通知。',
      reminder_unsupported: '此環境不支援通知。',
      reminder_set: '已排定提醒：{t}',
      reminder_cleared: '已取消提醒',
      reminder_web_note: '網頁版提醒需保持此頁面開啟；安裝 App 後可在背景通知。',
      notif_title: '藍眼淚觀賞提醒',
      notif_body: '今晚最佳觀賞時段 {w} 即將開始，指數 {s} 分。',
      language: '語言',
      about: '關於',
      about_version: '版本',
      about_sources_title: '資料來源',
      about_sources: '交通部中央氣象署氣象資料開放平臺（政府資料開放授權條款 CC BY 4.0）、交通部 TDX 運輸資料流通服務、天文資料由 App 自行計算。地圖底圖：OpenFreeMap / OpenStreetMap 貢獻者。',
      about_disclaimer_title: '免責聲明',
      about_disclaimer: '藍眼淚（夜光藻發光）為自然現象，受季節、月光、風、潮汐、海溫等多重因素影響；本 App 提供之指數與預報僅供參考，無法保證實際出現。夜間前往海邊請注意安全。',
      privacy: '隱私權政策',
      contact: '聯絡梅石',
      contact_email: '寫信給我們', contact_web: '梅石官網 matsu.live',
      // 其他
      open_external: '在外部瀏覽器開啟',
      offline_toast: '目前離線，顯示最後一次更新的資料。',
      refresh_failed: '更新失敗，顯示先前資料。',
      weekday: ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
    },
    en: {
      appName: 'Matsu Blue Tears Forecast',
      brand: 'Meistone',
      tab_map: 'Map', tab_forecast: 'Forecast', tab_stay: 'Stay', tab_transport: 'Transport', tab_me: 'Me',
      close: 'Close',
      season_off: 'Off-season', season_early: 'Early season', season_peak: 'Peak season', season_late: 'Late season',
      score_label: 'Tonight\u2019s Blue Tears index: {n}',
      level_high: 'High', level_medium: 'Medium', level_low: 'Low',
      updated: 'Updated {t}',
      mock_short: 'Fallback data',
      badge_live: 'Source: CWA / TDX, updated {t}',
      badge_model: 'Model estimate \u00b7 no live weather yet',
      badge_cache: 'Offline cache \u00b7 last updated {t}',
      badge_mock: 'Offline fallback data \u00b7 not live',
      badge_loading: 'Loading\u2026',
      note_model: 'Showing a model estimate (astronomy + climate averages); live weather data is not connected yet. Blue Tears is a natural phenomenon and cannot be guaranteed.',
      note_live: 'Sources: Central Weather Administration Open Data, TDX Transport Data eXchange. Updated {t}.',
      note_cache: 'You are offline. Showing the last successfully fetched data ({t}).',
      note_mock: 'Cannot reach the server. Showing built-in fallback data for layout reference only; this is not a live forecast.',
      locate_me: 'Locate me', locating: 'Locating\u2026',
      view_all: 'All spots', view_core: 'Nangan & Beigan', view_all_aria: 'Show all viewing spots (incl. Dongyin, Juguang)', view_core_aria: 'Focus on Nangan and Beigan',
      geo_denied: 'We could not access your location. To see the nearest viewing spots, allow location access for this app in system settings.',
      geo_unavailable: 'Location is unavailable right now. Please try again later.',
      geo_unsupported: 'Location is not supported on this device.',
      geo_far: 'You are quite far from Matsu; here are the spots nearest to you.',
      nearby_title: 'Nearest viewing spots',
      km: 'km',
      popup_tonight: 'Tonight', popup_wind: 'Wind', popup_tide: 'Tide', popup_sea: 'Sea temp', popup_score: 'Index',
      popup_navigate: 'Navigate', popup_book: 'Book', popup_fav: 'Save', popup_unfav: 'Unsave',
      fav_added: 'Saved to favourites', fav_removed: 'Removed from favourites',
      no_data: '\u2014',
      forecast_title: '7-Day Forecast',
      best_window: 'Best viewing window',
      moon: 'Moon', illumination: 'Illumination', tides: 'Tides', weather: 'Weather', pop: 'Rain chance', wind: 'Wind', temp: 'Temp', sunset: 'Sunset', moonrise: 'Moonrise', moonset: 'Moonset',
      factors_title: 'Six factors',
      f_season: 'Season', f_moon: 'Moonlight', f_wind: 'Wind', f_sky: 'Sky', f_seaTemp: 'Sea temp', f_tide: 'Tide',
      expand_day: 'Expand details for {d}', collapse_day: 'Collapse details for {d}',
      today: 'Today',
      tide_high: 'High', tide_low: 'Low',
      summary_fallback: 'Combined assessment of season, moonlight, wind, sky, sea temperature and tide.',
      stay_title: 'Where to Stay',
      stay_price_note: 'see official site',
      stay_from: '/night from',
      book_now: 'Book now',
      stay1_name: 'Meishi Officers\u2019 Tearoom (Historic Building)', stay1_label: 'Historic building \u00b7 Sea-view rooms',
      stay1_tag1: 'Historic', stay1_tag2: 'Sea view', stay1_tag3: 'Prime Blue Tears spot',
      stay2_name: 'Da Mei Shi Co-Living', stay2_label: 'Shared space \u00b7 Arts experience',
      stay2_tag1: 'Co-living', stay2_tag2: 'Artist residency', stay2_tag3: 'Immersive stay',
      transport_title: 'Getting There',
      flights: 'Flights', ferries: 'Ferries', interisland: 'Inter-island',
      transport_static: 'Timetable for reference only; check operator notices.',
      transport_live: 'Live TDX timetable, updated {t}.',
      transport_empty: 'No services listed for today.',
      sailings_per_day: '{n} per day', first_last: 'First {a} \u00b7 Last {b}', duration_min: '{n} min',
      status_on_time: 'On time', status_delayed: 'Delayed', status_cancelled: 'Cancelled', status_departed: 'Departed', status_arrived: 'Arrived', status_unknown: 'See operator',
      alerts_title: 'Alerts',
      me_title: 'Me',
      favorites: 'Saved spots', favorites_empty: 'No saved spots yet. Tap a hotspot on the map and press \u201cSave\u201d.',
      view_on_map: 'Map', remove: 'Remove',
      reminder: 'Viewing reminder',
      reminder_toggle: 'Tonight\u2019s best-window reminder',
      reminder_sub_auto: 'Notify 30 minutes before the best window starts',
      reminder_time: 'Custom reminder time',
      reminder_time_sub: 'Leave empty to use 30 minutes before the best window',
      reminder_denied: 'Notifications are not allowed. Enable them for this app in system settings.',
      reminder_unsupported: 'Notifications are not supported in this environment.',
      reminder_set: 'Reminder scheduled: {t}',
      reminder_cleared: 'Reminder cancelled',
      reminder_web_note: 'Web reminders require this page to stay open; the installed app can notify in the background.',
      notif_title: 'Blue Tears reminder',
      notif_body: 'Tonight\u2019s best window {w} starts soon. Index {s}.',
      language: 'Language',
      about: 'About',
      about_version: 'Version',
      about_sources_title: 'Data sources',
      about_sources: 'Central Weather Administration Open Data Platform (Open Government Data License, CC BY 4.0), MOTC TDX Transport Data eXchange; astronomy computed in-app. Base map: OpenFreeMap / OpenStreetMap contributors.',
      about_disclaimer_title: 'Disclaimer',
      about_disclaimer: 'Blue Tears (bioluminescent Noctiluca) is a natural phenomenon affected by season, moonlight, wind, tide and sea temperature. The index and forecasts in this app are for reference only and do not guarantee a sighting. Stay safe near the shore at night.',
      privacy: 'Privacy Policy',
      contact: 'Contact Meishi',
      contact_email: 'Email us', contact_web: 'Meishi website matsu.live',
      open_external: 'Opens in external browser',
      offline_toast: 'You are offline. Showing the last updated data.',
      refresh_failed: 'Refresh failed; showing previous data.',
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    }
  };

  var current = 'zh';

  function detect() {
    try {
      var saved = localStorage.getItem('mbt:lang');
      if (saved === 'zh' || saved === 'en') return saved;
    } catch (e) { /* ignore */ }
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'zh';
    return /^zh/i.test(nav) ? 'zh' : 'en';
  }

  function t(key, vars) {
    var str = (DICT[current] && DICT[current][key]) || DICT.zh[key] || key;
    if (typeof str !== 'string') return str;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        str = str.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return str;
  }

  function applyStatic(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    (root || document).querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    document.documentElement.lang = current === 'zh' ? 'zh-Hant' : 'en';
    document.title = t('appName') + ' — ' + t('brand');
  }

  global.I18N = {
    DICT: DICT,
    t: t,
    get lang() { return current; },
    setLang: function (lang) {
      current = lang === 'en' ? 'en' : 'zh';
      try { localStorage.setItem('mbt:lang', current); } catch (e) { /* ignore */ }
    },
    init: function () { current = detect(); return current; },
    applyStatic: applyStatic,
    /** 依語言挑選 {Zh,En} 欄位 */
    pick: function (obj, base) {
      if (!obj) return '';
      var zh = obj[base + 'Zh'], en = obj[base + 'En'];
      if (current === 'en') return en || zh || '';
      return zh || en || '';
    }
  };
})(window);
