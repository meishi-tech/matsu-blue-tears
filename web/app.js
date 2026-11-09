/* 馬祖藍眼淚預報 — 前端主程式 / Main app logic
   資料流：API（matsu-blue-tears.vercel.app）→ localStorage 最後成功回應 → web/mock 備援
   執行環境：純網頁 / PWA / Capacitor（iOS、Android） */
(function () {
  'use strict';

  // ===== 常數 =====
  var APP_VERSION = '1.0.0';
  var DEFAULT_API_BASE = 'https://matsu-blue-tears.vercel.app/api/v1';
  var API_BASE = (function () {
    try {
      var q = new URLSearchParams(window.location.search).get('api');
      if (q) return q.replace(/\/+$/, '');
    } catch (e) { /* ignore */ }
    return DEFAULT_API_BASE;
  })();
  var ENDPOINTS = ['status', 'forecast', 'hotspots', 'transport'];
  var REFRESH_MS = 5 * 60 * 1000;
  var STORAGE = { cache: 'mbt:cache:', favs: 'mbt:favs', reminder: 'mbt:reminder', lang: 'mbt:lang' };
  var MATSU_CENTER = { lat: 26.16, lng: 119.95 };
  var BOOKING_URL = 'https://matsu.live/book-a-room';
  var MEISHI_URL = 'https://matsu.live';
  var MEISHI_MAIL = 'mailto:wuling5978@gmail.com?subject=' + encodeURIComponent('馬祖藍眼淚預報 App');

  var t = I18N.t;
  var pick = I18N.pick;

  // ===== 狀態 =====
  var state = {
    status: null, forecast: null, hotspots: null, transport: null,
    origin: {},            // endpoint -> 'live' | 'cache' | 'mock'
    userPos: null,
    markers: {},
    activePopup: null,
    map: null,
    mapReady: false,
    reminderTimer: null,
    viewAll: false
  };

  // ===== 工具 =====
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function fmtTime(iso) {
    if (!iso) return t('no_data');
    var d = new Date(iso);
    if (isNaN(d.getTime())) return t('no_data');
    try {
      return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }).format(d);
    } catch (e) { return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
  }
  function fmtWindow(bw) {
    if (!bw || !bw.start) return t('no_data');
    return fmtTime(bw.start) + '–' + fmtTime(bw.end);
  }
  function taiwanToday() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function fmtDateShort(ymd) {
    if (!ymd) return '';
    var p = ymd.split('-');
    return p.length === 3 ? p[1] + '/' + p[2] : ymd;
  }
  function weekdayOf(ymd) {
    var d = new Date(ymd + 'T12:00:00+08:00');
    if (isNaN(d.getTime())) return '';
    return t('weekday')[d.getUTCDay()];
  }
  function scoreColor(score) {
    // 0 → 低強度藍灰，50 → teal，100 → 生物發光青
    var s = Math.max(0, Math.min(100, Number(score) || 0));
    var lo = [92, 130, 153], mid = [26, 138, 158], hi = [0, 212, 255];
    var a, b, f;
    if (s < 50) { a = lo; b = mid; f = s / 50; } else { a = mid; b = hi; f = (s - 50) / 50; }
    var c = a.map(function (v, i) { return Math.round(v + (b[i] - v) * f); });
    return 'rgb(' + c.join(',') + ')';
  }
  function levelOf(score) { return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'; }
  function haversineKm(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function isCapacitor() { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  function capPlugin(name) {
    try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null; } catch (e) { return null; }
  }

  /** 外部連結：Capacitor 內用 Browser 外掛，否則新分頁 */
  function openExternal(url) {
    var Browser = capPlugin('Browser');
    if (Browser && typeof Browser.open === 'function') {
      Browser.open({ url: url }).catch(function () { window.open(url, '_blank', 'noopener'); });
      return;
    }
    window.open(url, '_blank', 'noopener');
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-external]');
    if (!a) return;
    if (isCapacitor() || capPlugin('Browser')) {
      e.preventDefault();
      openExternal(a.href);
    }
  });

  var toastTimer = null;
  function toast(msg, ms) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('active');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('active'); }, ms || 3500);
  }

  // ===== 本機儲存 =====
  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 容量不足時略過 */ }
  }

  // ===== 資料載入：API → 快取 → mock =====
  function fetchJson(url, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000) : null;
    return fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var fromSw = res.headers.get('X-MBT-From-Cache');
        return res.json().then(function (data) {
          if (fromSw && data && typeof data === 'object') {
            var d = new Date(fromSw);
            data.__swCachedAt = isNaN(d.getTime()) ? (data.generatedAt || null) : d.toISOString();
          }
          return data;
        });
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function loadEndpoint(name) {
    var url = API_BASE + '/' + name;
    return fetchJson(url).then(function (data) {
      if (!data || data.ok === false) throw new Error('API error');
      if (data.__swCachedAt) {
        // Service Worker 離線回應：視為快取，不寫回 localStorage
        state.origin[name] = 'cache';
        data.__cachedAt = data.__swCachedAt;
        return data;
      }
      lsSet(STORAGE.cache + name, { savedAt: new Date().toISOString(), data: data });
      state.origin[name] = 'live';
      return data;
    }).catch(function () {
      var cached = lsGet(STORAGE.cache + name, null);
      if (cached && cached.data) {
        state.origin[name] = 'cache';
        cached.data.__cachedAt = cached.savedAt;
        return cached.data;
      }
      return fetchJson('mock/' + name + '.json', 5000).then(function (data) {
        state.origin[name] = 'mock';
        return data;
      });
    });
  }

  function loadAll() {
    return Promise.all(ENDPOINTS.map(function (ep) {
      return loadEndpoint(ep).then(function (d) { state[ep] = d; }).catch(function (err) {
        console.warn('[data] ' + ep + ' unavailable:', err && err.message);
      });
    }));
  }

  /** 整體資料狀態（取最差的一個） */
  function overallOrigin() {
    var o = state.origin;
    if (ENDPOINTS.some(function (e) { return o[e] === 'mock'; })) return 'mock';
    if (ENDPOINTS.some(function (e) { return o[e] === 'cache'; })) return 'cache';
    return 'live';
  }
  function dataMode(payload) { return payload && payload.mode === 'live' ? 'live' : 'model'; }
  function payloadTime(payload) {
    if (!payload) return '';
    return fmtTime(payload.__cachedAt || payload.generatedAt);
  }

  // ===== 狀態列 / 徽章 =====
  function renderBadge() {
    var el = $('dataBadge');
    if (!el) return;
    var origin = overallOrigin();
    var payload = state.status || state.forecast;
    var cls = 'data-badge', text;
    if (origin === 'mock') { cls += ' data-badge--mock'; text = t('badge_mock'); }
    else if (origin === 'cache') { cls += ' data-badge--cache'; text = t('badge_cache', { t: payloadTime(payload) }); }
    else if (dataMode(payload) === 'live') { cls += ' data-badge--live'; text = t('badge_live', { t: payloadTime(payload) }); }
    else { cls += ' data-badge--model'; text = t('badge_model'); }
    el.className = cls;
    el.textContent = text;
  }

  function noteHtml(payload, endpointName) {
    var origin = state.origin[endpointName] || overallOrigin();
    if (origin === 'mock') return '<div class="panel-note panel-note--warn">' + esc(t('note_mock')) + '</div>';
    if (origin === 'cache') return '<div class="panel-note">' + esc(t('note_cache', { t: payloadTime(payload) })) + '</div>';
    if (dataMode(payload) === 'live') return '<div class="panel-note">' + esc(t('note_live', { t: payloadTime(payload) })) + '</div>';
    return '<div class="panel-note panel-note--model">' + esc(t('note_model')) + '</div>';
  }

  function renderStatusBar() {
    var s = state.status && state.status.today;
    var today = state.forecast && state.forecast.days && state.forecast.days[0];
    var score = s ? s.score : today ? today.score : null;
    var ring = $('scoreRing'), fill = $('scoreRingFill'), val = $('scoreRingValue');
    if (score != null) {
      var sc = Math.max(0, Math.min(100, Math.round(score)));
      val.textContent = sc;
      val.style.color = scoreColor(sc);
      fill.style.stroke = scoreColor(sc);
      fill.style.strokeDashoffset = String(Math.round(126 * (1 - sc / 100)));
      ring.setAttribute('aria-valuenow', String(sc));
      ring.setAttribute('aria-label', t('score_label', { n: sc }));
    }
    $('statusDate').textContent = (s && s.date ? s.date : taiwanToday()).replace(/-/g, '/');
    var seasonKey = s && s.season ? 'season_' + s.season : null;
    $('statusSeason').textContent = seasonKey ? t(seasonKey) : '';
    var temp = s ? (s.tempC != null ? s.tempC + '°C' : null) : today && today.tempMaxC != null ? today.tempMaxC + '°C' : null;
    $('wxTemp').textContent = temp || t('no_data');
    var moon = (s && s.moon) || (today && today.moon);
    $('wxMoon').textContent = moon ? moon.emoji || '' : '';
    var src = s || today;
    $('wxWind').textContent = src && src.windDir ? src.windDir + ' ' + (src.windKmh != null ? src.windKmh + ' km/h' : '') : t('no_data');
    var payload = state.status || state.forecast;
    var orig = state.origin.status || state.origin.forecast;
    $('updateTime').textContent = !payload ? '' : orig === 'mock' ? t('mock_short') : t('updated', { t: payloadTime(payload) });
  }

  // ===== 七日預報 =====
  var expandedDate = null;
  function renderForecast() {
    var list = $('forecastList'), note = $('forecastNote'), src = $('forecastSource');
    if (!list) return;
    var days = (state.forecast && state.forecast.days) || [];
    // 今天置頂：找出台灣今天的日期；若快取資料含過去日期則略過
    var todayStr = taiwanToday();
    var idx = days.findIndex(function (d) { return d.date === todayStr; });
    if (idx > 0) days = days.slice(idx).concat(days.slice(0, idx));
    if (expandedDate == null && days[0]) expandedDate = days[0].date;

    note.innerHTML = noteHtml(state.forecast, 'forecast');
    var html = '';
    days.forEach(function (day, i) {
      var isToday = day.date === todayStr || (i === 0 && idx === -1 && /今天|Today/i.test((day.weekdayZh || '') + (day.weekdayEn || '')));
      var color = scoreColor(day.score);
      var wd = isToday ? t('today') : weekdayOf(day.date) || pick(day, 'weekday');
      var open = day.date === expandedDate;
      var f = day.factors || {};
      var wxText = pick(day, 'wx');
      html +=
        '<div class="forecast-day' + (isToday ? ' forecast-day--today' : '') + '" aria-expanded="' + open + '" data-date="' + esc(day.date) + '">' +
          '<button class="forecast-day__summary" type="button" aria-expanded="' + open + '" aria-controls="fd-' + esc(day.date) + '" aria-label="' + esc(t(open ? 'collapse_day' : 'expand_day', { d: wd + ' ' + fmtDateShort(day.date) })) + '">' +
            '<div class="forecast-day__date"><div class="forecast-day__weekday">' + esc(wd) + '</div><div class="forecast-day__date-num">' + esc(fmtDateShort(day.date)) + '</div></div>' +
            '<div class="forecast-day__moon" aria-hidden="true">' + esc(day.moon ? day.moon.emoji : '') + '</div>' +
            '<div class="forecast-day__conditions"><div class="forecast-day__weather">' +
              '<span>' + esc(day.tempMinC != null ? day.tempMinC + '–' + day.tempMaxC + '°' : '') + '</span>' +
              '<span>' + esc((day.windDir || '') + ' ' + (day.windKmh != null ? day.windKmh + ' km/h' : '')) + '</span>' +
              (wxText ? '<span class="forecast-day__wx">' + esc(wxText) + (day.pop != null ? ' ' + day.pop + '%' : '') + '</span>' : '') +
            '</div></div>' +
            '<div class="forecast-day__score"><div class="forecast-day__score-bar"><div class="forecast-day__score-fill" style="width:' + (Number(day.score) || 0) + '%;background:' + color + ';box-shadow:0 0 6px ' + color + ';"></div></div>' +
              '<div class="forecast-day__score-value" style="color:' + color + ';">' + esc(day.score) + '</div></div>' +
            '<svg class="forecast-day__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
          '</button>' +
          '<div class="forecast-day__detail" id="fd-' + esc(day.date) + '">' +
            '<div class="forecast-day__best"><div class="forecast-day__best-label">' + esc(t('best_window')) + '</div>' +
              '<div class="forecast-day__best-time">' + esc(fmtWindow(day.bestWindow)) + '</div>' +
              (day.bestWindow ? '<div class="forecast-day__best-reason">' + esc(pick(day.bestWindow, 'reason')) + '</div>' : '') +
            '</div>' +
            '<div class="forecast-day__grid">' +
              cell(t('moon'), (day.moon ? esc(day.moon.emoji + ' ' + pick(day.moon, 'name')) : t('no_data')) + (day.moon && day.moon.illumination != null ? ' <small>' + Math.round(day.moon.illumination * 100) + '%</small>' : '')) +
              cell(t('tides'), tidesHtml(day.tides)) +
              cell(t('weather'), esc(wxText || t('no_data')) + (day.pop != null ? ' <small>' + esc(t('pop')) + ' ' + day.pop + '%</small>' : '')) +
              cell(t('sunset') + ' / ' + t('moonrise'), esc(fmtTime(day.sunset)) + ' / ' + esc(day.moonrise ? fmtTime(day.moonrise) : t('no_data'))) +
            '</div>' +
            '<div class="forecast-day__cell-label" style="margin-bottom:6px;">' + esc(t('factors_title')) + '</div>' +
            '<div class="factor-list">' + ['season', 'moon', 'wind', 'sky', 'seaTemp', 'tide'].map(function (k) {
              var v = Math.max(0, Math.min(100, Math.round(Number(f[k]) || 0)));
              return '<div class="factor"><span class="factor__name">' + esc(t('f_' + k)) + '</span><div class="factor__bar"><div class="factor__fill" style="width:' + v + '%;background:' + scoreColor(v) + ';"></div></div><span class="factor__val">' + v + '</span></div>';
            }).join('') + '</div>' +
            '<div class="forecast-day__text">' + esc(pick(day, 'summary') || daySummary(day)) + '</div>' +
          '</div>' +
        '</div>';
    });
    list.innerHTML = html;
    list.querySelectorAll('.forecast-day__summary').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.parentElement, d = card.getAttribute('data-date');
        expandedDate = expandedDate === d ? null : d;
        renderForecast();
      });
    });
    src.textContent = state.forecast ? t('about_sources').split('。')[0] : '';
  }
  function cell(label, valueHtml) {
    return '<div class="forecast-day__cell"><div class="forecast-day__cell-label">' + esc(label) + '</div><div class="forecast-day__cell-value">' + valueHtml + '</div></div>';
  }
  function tidesHtml(tides) {
    if (!tides || !tides.length) return esc(t('no_data'));
    return tides.map(function (td) {
      var type = td.type === '滿潮' ? t('tide_high') : td.type === '乾潮' ? t('tide_low') : td.type;
      return esc(type) + ' ' + esc(fmtTime(td.time));
    }).join('<br>');
  }
  /** 依因子組一句摘要（API 未提供 summary 時） */
  function daySummary(day) {
    var f = day.factors || {};
    var keys = Object.keys(f);
    if (!keys.length) return t('summary_fallback');
    var sorted = keys.slice().sort(function (a, b) { return f[b] - f[a]; });
    var best = sorted[0], worst = sorted[sorted.length - 1];
    var lvl = t('level_' + levelOf(day.score));
    if (I18N.lang === 'en') {
      return 'Overall ' + lvl.toLowerCase() + ' chance (' + day.score + '). Strongest factor: ' + t('f_' + best).toLowerCase() + '; weakest: ' + t('f_' + worst).toLowerCase() + '.';
    }
    return '整體機會' + lvl + '（' + day.score + ' 分）。最有利因子：' + t('f_' + best) + '；最不利因子：' + t('f_' + worst) + '。';
  }

  // ===== 地圖 =====
  function initMap() {
    if (typeof maplibregl === 'undefined') { console.warn('MapLibre not loaded'); return; }
    state.map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [MATSU_CENTER.lng, MATSU_CENTER.lat],
      zoom: 10,
      minZoom: 7,
      maxZoom: 16,
      maxBounds: [[118.4, 24.4], [122.0, 28.0]], // 寬鬆限制：太緊會讓 fitBounds 在直式手機上被迫放大而裁切光點
      attributionControl: false
    });
    state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    state.map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenFreeMap © OpenStreetMap' }), 'bottom-left');
    state.map.on('error', function (e) { /* 離線時圖磚載入失敗屬預期，不視為錯誤 */ if (e && e.error && !/tile|Failed to fetch|NetworkError/i.test(String(e.error.message))) console.warn('[map]', e.error.message); });
    state.map.on('styleimagemissing', function (e) {
      // 底圖樣式引用但未提供的圖示：補一個透明 1×1，避免 console 警告
      try { if (!state.map.hasImage(e.id)) state.map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); } catch (err) { /* ignore */ }
    });
    state.map.on('load', function () {
      try {
        state.map.getStyle().layers.forEach(function (layer) {
          if (layer.type === 'fill' && /water/i.test(layer.id)) state.map.setPaintProperty(layer.id, 'fill-color', '#0A1628');
          if (layer.type === 'line' && /boundary|admin/i.test(layer.id)) state.map.setLayoutProperty(layer.id, 'visibility', 'none');
        });
      } catch (e) { /* ignore */ }
      state.mapReady = true;
      renderMarkers(true);
    });
  }

  function renderMarkers(fit) {
    if (!state.mapReady) return;
    var spots = (state.hotspots && state.hotspots.hotspots) || [];
    Object.keys(state.markers).forEach(function (id) { state.markers[id].remove(); });
    state.markers = {};
    var bounds = new maplibregl.LngLatBounds();
    spots.forEach(function (spot) {
      var score = Number(spot.score) || 0, color = scoreColor(score);
      var wrapper = document.createElement('div');
      wrapper.className = 'marker-hotspot-wrapper';
      wrapper.setAttribute('role', 'button');
      wrapper.setAttribute('tabindex', '0');
      wrapper.setAttribute('aria-label', pick(spot, 'name') + ' · ' + t('popup_score') + ' ' + score);
      var inner = document.createElement('div');
      inner.className = 'marker-hotspot marker-hotspot--' + (spot.intensity || levelOf(score));
      var pulseSize = Math.round(22 + score * 0.2), pulseDur = (3.6 - score / 50).toFixed(2) + 's';
      inner.innerHTML =
        '<div class="marker-hotspot__pulse" style="width:' + pulseSize + 'px;height:' + pulseSize + 'px;background:radial-gradient(circle, ' + color.replace('rgb', 'rgba').replace(')', ',0.35)') + ' 0%, transparent 70%);animation-duration:' + pulseDur + ';"></div>' +
        '<div class="marker-hotspot__core" style="background:' + color + ';border-color:' + color + ';box-shadow:0 0 ' + Math.round(4 + score / 10) + 'px ' + color + ';"></div>';
      wrapper.appendChild(inner);
      var open = function (e) { if (e) e.stopPropagation(); showPopup(spot); };
      wrapper.addEventListener('click', open);
      wrapper.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      state.markers[spot.id] = new maplibregl.Marker({ element: wrapper, anchor: 'center' }).setLngLat([spot.lng, spot.lat]).addTo(state.map);
      bounds.extend([spot.lng, spot.lat]);
    });
    if (fit && spots.length) fitView(state.viewAll ? 'all' : 'core', false);
  }

  /** 視野：core = 南竿＋北竿（主要觀測點，填滿畫面）；all = 全部熱點（含東引／莒光） */
  var FIT_PADDING = { top: 72, bottom: 110, left: 56, right: 72 };
  function fitView(mode, animate) {
    var spots = (state.hotspots && state.hotspots.hotspots) || [];
    if (!state.mapReady || !spots.length) return;
    var subset = mode === 'all' ? spots : spots.filter(function (s) { return s.island === 'nangan' || s.island === 'beigan'; });
    if (!subset.length) subset = spots;
    var b = new maplibregl.LngLatBounds();
    subset.forEach(function (s) { b.extend([s.lng, s.lat]); });
    state.viewAll = mode === 'all';
    state.map.fitBounds(b, { padding: FIT_PADDING, duration: animate ? 900 : 1200, maxZoom: 12.5 });
    updateViewBtn();
  }
  function updateViewBtn() {
    var btn = $('viewAllBtn');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(state.viewAll));
    btn.textContent = t(state.viewAll ? 'view_core' : 'view_all');
    btn.setAttribute('aria-label', t(state.viewAll ? 'view_core_aria' : 'view_all_aria'));
  }

  function showPopup(spot) {
    if (state.activePopup) state.activePopup.remove();
    var fav = isFav(spot.id);
    var score = Number(spot.score) || 0, color = scoreColor(score), lvl = spot.intensity || levelOf(score);
    var navUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + spot.lat + ',' + spot.lng;
    var html =
      '<div class="popup-card">' +
        '<div class="popup-card__header"><div>' +
          '<div class="popup-card__name-zh">' + esc(I18N.lang === 'en' ? spot.nameEn : spot.nameZh) + '</div>' +
          '<div class="popup-card__name-en">' + esc(I18N.lang === 'en' ? (spot.islandEn || '') + ' · ' + spot.nameZh : (spot.islandZh || '') + ' · ' + spot.nameEn) + '</div>' +
        '</div>' +
        '<span class="popup-card__intensity popup-card__intensity--' + esc(lvl) + '" style="color:' + color + ';background:' + color.replace('rgb', 'rgba').replace(')', ',0.15)') + ';"><span class="popup-card__intensity-dot"></span><span class="popup-card__score">' + score + '</span> · ' + esc(t('level_' + lvl)) + '</span></div>' +
        '<div class="popup-card__desc">' + esc(pick(spot, 'desc')) + (spot.tips ? ' ' + esc(spot.tips[I18N.lang] || spot.tips.zh || '') : '') + '</div>' +
        '<div class="popup-card__details">' +
          detail(t('popup_tonight'), spot.viewTime || t('no_data')) +
          detail(t('popup_wind'), spot.windDir ? spot.windDir + ' ' + spot.windKmh + ' km/h' : t('no_data')) +
          detail(t('popup_tide'), pick(spot, 'tide') || t('no_data')) +
          detail(t('popup_sea'), spot.seaTempC != null ? spot.seaTempC + '°C' : t('no_data')) +
        '</div>' +
        (pick(spot, 'access') ? '<div class="popup-card__access"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span>' + esc(pick(spot, 'access')) + '</span></div>' : '') +
        '<div class="popup-card__actions">' +
          '<a class="popup-card__btn popup-card__btn--primary" href="' + esc(navUrl) + '" target="_blank" rel="noopener noreferrer" data-external aria-label="' + esc(t('popup_navigate') + ' ' + pick(spot, 'name')) + '">' + esc(t('popup_navigate')) + '</a>' +
          (spot.bookingUrl ? '<a class="popup-card__btn popup-card__btn--secondary" href="' + esc(spot.bookingUrl) + '" target="_blank" rel="noopener noreferrer" data-external aria-label="' + esc(t('popup_book') + ' ' + pick(spot, 'name')) + '">' + esc(t('popup_book')) + '</a>' : '') +
          '<button type="button" class="popup-card__btn popup-card__btn--secondary popup-card__btn--icon' + (fav ? ' is-fav' : '') + '" data-fav="' + esc(spot.id) + '" aria-pressed="' + fav + '" aria-label="' + esc(fav ? t('popup_unfav') : t('popup_fav')) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg></button>' +
        '</div>' +
      '</div>';
    state.activePopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '300px', offset: 15, anchor: 'top', focusAfterOpen: false })
      .setLngLat([spot.lng, spot.lat]).setHTML(html).addTo(state.map);
    var el = state.activePopup.getElement();
    var closeBtn = el.querySelector('.maplibregl-popup-close-button');
    if (closeBtn) closeBtn.setAttribute('aria-label', t('close'));
    var favBtn = el.querySelector('[data-fav]');
    if (favBtn) favBtn.addEventListener('click', function () { toggleFav(spot.id); showPopup(spot); });
    // 將標記移到畫面上三分之一處，讓彈窗在下方有足夠空間
    state.map.flyTo({ center: [spot.lng, spot.lat], zoom: Math.max(state.map.getZoom(), 12.5), speed: 0.8, offset: [0, -Math.round(state.map.getContainer().clientHeight * 0.22)] });
  }
  function detail(label, value) {
    return '<div class="popup-card__detail"><div class="popup-card__detail-label">' + esc(label) + '</div><div class="popup-card__detail-value">' + esc(value) + '</div></div>';
  }

  // --- 定位 ---
  var userMarker = null;
  function locateMe() {
    var btn = $('locateBtn');
    if (!navigator.geolocation) { toast(t('geo_unsupported')); return; }
    btn.disabled = true; btn.classList.add('map-fab--busy'); btn.setAttribute('aria-label', t('locating'));
    var done = function () { btn.disabled = false; btn.classList.remove('map-fab--busy'); btn.setAttribute('aria-label', t('locate_me')); };
    if (state.activePopup) state.activePopup.remove();
    navigator.geolocation.getCurrentPosition(function (pos) {
      done();
      state.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      renderNearby();
    }, function (err) {
      done();
      toast(err && err.code === 1 ? t('geo_denied') : t('geo_unavailable'), 5000);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }
  function renderNearby() {
    var card = $('nearbyCard');
    var spots = (state.hotspots && state.hotspots.hotspots) || [];
    if (!state.userPos || !spots.length || !state.mapReady) { card.classList.remove('active'); return; }
    var withDist = spots.map(function (s) { return { spot: s, km: haversineKm(state.userPos, s) }; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 2);
    var far = withDist[0].km > 80;
    card.innerHTML =
      '<div class="nearby-card__title"><span>' + esc(t('nearby_title')) + '</span><button type="button" class="nearby-card__close" aria-label="' + esc(t('close')) + '">×</button></div>' +
      (far ? '<div class="me-row__sub" style="margin-bottom:6px;">' + esc(t('geo_far')) + '</div>' : '') +
      withDist.map(function (d) {
        return '<button type="button" class="nearby-card__item" data-spot="' + esc(d.spot.id) + '" aria-label="' + esc(pick(d.spot, 'name') + ' ' + d.km.toFixed(1) + ' ' + t('km')) + '">' +
          '<div><div class="nearby-card__name">' + esc(pick(d.spot, 'name')) + '</div><div class="nearby-card__sub">' + esc(pick(d.spot, 'island')) + ' · ' + esc(t('popup_tonight')) + ' ' + esc(d.spot.viewTime || t('no_data')) + ' · ' + esc(t('popup_score')) + ' ' + esc(d.spot.score) + '</div></div>' +
          '<div class="nearby-card__dist">' + (d.km < 10 ? d.km.toFixed(1) : Math.round(d.km)) + ' <small>' + esc(t('km')) + '</small></div></button>';
      }).join('');
    card.classList.add('active');
    card.querySelector('.nearby-card__close').addEventListener('click', function () { card.classList.remove('active'); });
    card.querySelectorAll('[data-spot]').forEach(function (b) {
      b.addEventListener('click', function () {
        var sp = spots.find(function (s) { return s.id === b.getAttribute('data-spot'); });
        if (sp) showPopup(sp);
      });
    });
    if (userMarker) userMarker.remove();
    var el = document.createElement('div'); el.className = 'marker-user'; el.setAttribute('aria-label', 'You');
    userMarker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([state.userPos.lng, state.userPos.lat]).addTo(state.map);
    if (!far) {
      var b = new maplibregl.LngLatBounds([state.userPos.lng, state.userPos.lat], [state.userPos.lng, state.userPos.lat]);
      withDist.forEach(function (d) { b.extend([d.spot.lng, d.spot.lat]); });
      state.map.fitBounds(b, { padding: { top: 72, bottom: 180, left: 56, right: 56 }, maxZoom: 13, duration: 1000 });
    } else {
      state.map.flyTo({ center: [withDist[0].spot.lng, withDist[0].spot.lat], zoom: 11 });
    }
  }

  // ===== 收藏 =====
  function getFavs() { var f = lsGet(STORAGE.favs, []); return Array.isArray(f) ? f : []; }
  function isFav(id) { return getFavs().indexOf(id) !== -1; }
  function toggleFav(id) {
    var favs = getFavs(), i = favs.indexOf(id);
    if (i === -1) { favs.push(id); toast(t('fav_added')); } else { favs.splice(i, 1); toast(t('fav_removed')); }
    lsSet(STORAGE.favs, favs);
    renderMe();
  }

  // ===== 觀賞提醒 =====
  function getReminder() { var r = lsGet(STORAGE.reminder, { enabled: false, time: '' }); return r && typeof r === 'object' ? r : { enabled: false, time: '' }; }
  function reminderTarget() {
    var s = state.status && state.status.today;
    var today = state.forecast && state.forecast.days && state.forecast.days[0];
    var bw = (s && s.bestWindow) || (today && today.bestWindow);
    var r = getReminder();
    var when;
    if (r.time && /^\d{2}:\d{2}$/.test(r.time)) {
      when = new Date(taiwanToday() + 'T' + r.time + ':00+08:00');
    } else if (bw && bw.start) {
      when = new Date(new Date(bw.start).getTime() - 30 * 60 * 1000);
    }
    if (!when || isNaN(when.getTime())) return null;
    return { when: when, window: fmtWindow(bw), score: s ? s.score : today ? today.score : '' };
  }
  function scheduleReminder() {
    var r = getReminder();
    clearTimeout(state.reminderTimer);
    var LN = capPlugin('LocalNotifications');
    if (LN && typeof LN.cancel === 'function') LN.cancel({ notifications: [{ id: 1001 }] }).catch(function () {});
    if (!r.enabled) return Promise.resolve(null);
    var target = reminderTarget();
    if (!target) return Promise.resolve(null);
    var title = t('notif_title'), body = t('notif_body', { w: target.window, s: target.score });
    if (LN && typeof LN.schedule === 'function') {
      // Capacitor：先要求權限，再排程本機通知
      var perm = typeof LN.requestPermissions === 'function' ? LN.requestPermissions() : Promise.resolve({ display: 'granted' });
      return perm.then(function (p) {
        if (p && p.display && p.display !== 'granted') { toast(t('reminder_denied'), 5000); return null; }
        if (target.when.getTime() <= Date.now()) return target;
        return LN.schedule({ notifications: [{ id: 1001, title: title, body: body, schedule: { at: target.when, allowWhileIdle: true } }] }).then(function () { return target; });
      }).catch(function (e) { console.warn('[notify]', e); return null; });
    }
    if (!('Notification' in window)) { toast(t('reminder_unsupported')); return Promise.resolve(null); }
    var ask = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.permission === 'denied' ? Promise.resolve('denied') : Notification.requestPermission();
    return Promise.resolve(ask).then(function (p) {
      if (p !== 'granted') { toast(t('reminder_denied'), 5000); return null; }
      var delay = target.when.getTime() - Date.now();
      if (delay > 0 && delay < 2147483647) {
        state.reminderTimer = setTimeout(function () {
          try { new Notification(title, { body: body, icon: 'icons/icon-192.png', tag: 'mbt-reminder' }); } catch (e) { toast(title + ' — ' + body, 8000); }
        }, delay);
      }
      return target;
    });
  }

  // ===== 「我的」頁 =====
  function renderMe() {
    var body = $('meBody');
    if (!body) return;
    var favs = getFavs();
    var spots = (state.hotspots && state.hotspots.hotspots) || [];
    var r = getReminder();
    var target = r.enabled ? reminderTarget() : null;
    var chev = '<svg class="me-row__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';
    var chevDown = '<svg class="me-row__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    var icon = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };

    var favHtml = favs.length ? favs.map(function (id) {
      var sp = spots.find(function (s) { return s.id === id; });
      if (!sp) return '';
      return '<div class="me-row"><div class="me-row__main"><div>' + esc(pick(sp, 'name')) + '</div><div class="me-row__sub">' + esc(pick(sp, 'island')) + ' · ' + esc(t('popup_tonight')) + ' ' + esc(sp.viewTime || t('no_data')) + ' · ' + esc(t('popup_score')) + ' ' + esc(sp.score) + '</div></div>' +
        '<button type="button" class="fav-row__go" data-go="' + esc(id) + '" aria-label="' + esc(t('view_on_map') + ' ' + pick(sp, 'name')) + '">' + esc(t('view_on_map')) + '</button>' +
        '<button type="button" class="fav-row__remove" data-unfav="' + esc(id) + '" aria-label="' + esc(t('remove') + ' ' + pick(sp, 'name')) + '">' + esc(t('remove')) + '</button></div>';
    }).join('') : '<div class="me-empty">' + esc(t('favorites_empty')) + '</div>';

    body.innerHTML =
      '<section class="me-section"><h3 class="me-section__title">' + icon('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>') + esc(t('favorites')) + '</h3><div class="me-card">' + favHtml + '</div></section>' +

      '<section class="me-section"><h3 class="me-section__title">' + icon('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>') + esc(t('reminder')) + '</h3><div class="me-card">' +
        '<div class="me-row"><div class="me-row__main"><label for="reminderToggle">' + esc(t('reminder_toggle')) + '</label><div class="me-row__sub" id="reminderSub">' + esc(target ? t('reminder_set', { t: fmtTime(target.when.toISOString()) }) : t('reminder_sub_auto')) + '</div></div>' +
          '<span class="switch"><input type="checkbox" id="reminderToggle" ' + (r.enabled ? 'checked' : '') + '><label class="switch__track" for="reminderToggle"><span class="sr-only">' + esc(t('reminder_toggle')) + '</span></label></span></div>' +
        '<div class="me-row"><div class="me-row__main"><label for="reminderTime">' + esc(t('reminder_time')) + '</label><div class="me-row__sub">' + esc(t('reminder_time_sub')) + '</div></div>' +
          '<input class="time-input" type="time" id="reminderTime" value="' + esc(r.time || '') + '" ' + (r.enabled ? '' : 'disabled') + ' aria-label="' + esc(t('reminder_time')) + '"></div>' +
        (!isCapacitor() ? '<div class="me-row"><div class="me-row__sub">' + esc(t('reminder_web_note')) + '</div></div>' : '') +
      '</div></section>' +

      '<section class="me-section"><h3 class="me-section__title">' + icon('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>') + esc(t('language')) + '</h3><div class="me-card"><div class="me-row"><div class="me-row__main">' + esc(t('language')) + '</div>' +
        '<div class="segmented" role="group" aria-label="' + esc(t('language')) + '"><button type="button" data-lang="zh" aria-pressed="' + (I18N.lang === 'zh') + '">繁體中文</button><button type="button" data-lang="en" aria-pressed="' + (I18N.lang === 'en') + '">English</button></div></div></div></section>' +

      '<section class="me-section"><h3 class="me-section__title">' + icon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>') + esc(t('about')) + '</h3>' +
        '<details class="me-card"><summary class="me-row"><div class="me-row__main">' + esc(t('appName')) + '<div class="me-row__sub">' + esc(t('about_version')) + ' ' + APP_VERSION + ' · ' + esc(t('brand')) + '</div></div>' + chevDown + '</summary>' +
          '<div class="about-block"><p><strong>' + esc(t('about_sources_title')) + '</strong><br>' + esc(t('about_sources')) + '</p>' +
          '<p><a href="https://opendata.cwa.gov.tw/" target="_blank" rel="noopener noreferrer" data-external>opendata.cwa.gov.tw</a> · <a href="https://tdx.transportdata.tw/" target="_blank" rel="noopener noreferrer" data-external>tdx.transportdata.tw</a> · <a href="https://data.gov.tw/license" target="_blank" rel="noopener noreferrer" data-external>CC BY 4.0</a></p>' +
          '<p><strong>' + esc(t('about_disclaimer_title')) + '</strong><br>' + esc(t('about_disclaimer')) + '</p></div></details>' +
        '<div class="me-card" style="margin-top:8px;">' +
          '<a class="me-row" href="privacy-policy.html"><div class="me-row__main">' + esc(t('privacy')) + '</div>' + chev + '</a>' +
          '<a class="me-row" href="' + MEISHI_MAIL + '"><div class="me-row__main">' + esc(t('contact')) + '<div class="me-row__sub">' + esc(t('contact_email')) + ' · wuling5978@gmail.com</div></div>' + chev + '</a>' +
          '<a class="me-row" href="' + MEISHI_URL + '" target="_blank" rel="noopener noreferrer" data-external><div class="me-row__main">' + esc(t('contact_web')) + '<div class="me-row__sub">' + esc(t('open_external')) + '</div></div>' + chev + '</a>' +
        '</div></section>';

    body.querySelectorAll('[data-unfav]').forEach(function (b) { b.addEventListener('click', function () { toggleFav(b.getAttribute('data-unfav')); }); });
    body.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () {
        var sp = spots.find(function (s) { return s.id === b.getAttribute('data-go'); });
        closeAllPanels(); setActiveTab('map');
        if (sp && state.mapReady) showPopup(sp);
      });
    });
    body.querySelectorAll('[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () { setLanguage(b.getAttribute('data-lang')); });
    });
    var toggle = $('reminderToggle'), timeIn = $('reminderTime');
    toggle.addEventListener('change', function () {
      var cur = getReminder(); cur.enabled = toggle.checked; lsSet(STORAGE.reminder, cur);
      scheduleReminder().then(function (tg) {
        if (!cur.enabled) toast(t('reminder_cleared'));
        else if (tg) toast(t('reminder_set', { t: fmtTime(tg.when.toISOString()) }));
        else { cur.enabled = false; lsSet(STORAGE.reminder, cur); }
        renderMe();
      });
    });
    timeIn.addEventListener('change', function () {
      var cur = getReminder(); cur.time = timeIn.value || ''; lsSet(STORAGE.reminder, cur);
      scheduleReminder().then(function () { renderMe(); });
    });
  }

  function setLanguage(lang) {
    I18N.setLang(lang);
    I18N.applyStatic();
    renderAll(false);
    if (state.activePopup) state.activePopup.remove();
  }

  // ===== 交通 =====
  function renderTransport() {
    var body = $('transportBody');
    if (!body) return;
    var tr = state.transport;
    if (!tr) { body.innerHTML = '<div class="me-empty">' + esc(t('badge_loading')) + '</div>'; return; }
    var tdxLive = tr.sources && tr.sources.tdx && tr.sources.tdx.status === 'live';
    var html = '';
    (tr.alerts || []).forEach(function (a) {
      html += '<div class="transport-alert" role="alert"><div class="transport-alert__title">⚠ ' + esc(pick(a, 'title')) + '</div><div class="transport-alert__body">' + esc(pick(a, 'body')) + (a.validUntil ? ' （~' + esc(fmtTime(a.validUntil)) + '）' : '') + '</div></div>';
    });
    if (state.origin.transport === 'mock') html += '<div class="panel-note panel-note--warn">' + esc(t('note_mock')) + '</div>';
    else if (state.origin.transport === 'cache') html += '<div class="panel-note">' + esc(t('note_cache', { t: payloadTime(tr) })) + '</div>';
    else html += '<div class="panel-note' + (tdxLive ? '' : ' panel-note--model') + '">' + esc(tdxLive ? t('transport_live', { t: payloadTime(tr) }) : t('transport_static')) + (tr.staticNotice ? ' ' + esc(tr.staticNotice[I18N.lang] || tr.staticNotice.zh || '') : '') + '</div>';

    var planeIcon = '<svg class="transport-section__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>';
    var shipIcon = '<svg class="transport-section__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10V3"/></svg>';
    var islandIcon = '<svg class="transport-section__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';
    var statusHtml = function (it) {
      var st = it.status || 'unknown';
      var label = (I18N.lang === 'en' ? it.statusEn : it.statusZh) || t('status_' + st);
      return '<span class="transport-status transport-status--' + esc(st) + '">' + esc(label) + '</span>';
    };
    var item = function (url, left, right, label) {
      return '<a class="transport-item" href="' + esc(url || '#') + '" target="_blank" rel="noopener noreferrer" data-external aria-label="' + esc(label) + '"><div>' + left + '</div><div class="transport-item__time">' + right + '</div></a>';
    };

    html += '<section class="transport-section"><h3 class="transport-section__title">' + planeIcon + esc(t('flights')) + '</h3>';
    var byTime = function (x, y) { return String(x.scheduled || '').localeCompare(String(y.scheduled || '')); };
    if (tr.flights && tr.flights.length) {
      tr.flights.slice().sort(byTime).forEach(function (f) {
        var route = (I18N.lang === 'en' ? f.from + ' → ' + f.to : (f.fromZh || f.from) + ' → ' + (f.toZh || f.to));
        html += item(f.bookingUrl,
          '<div class="transport-item__route">' + esc(route) + '</div><div class="transport-item__detail">' + esc((I18N.lang === 'en' ? f.airlineEn : f.airline) || '') + ' · ' + esc(f.flightNo || '') + '</div>',
          '<div class="transport-item__duration">' + esc(fmtTime(f.scheduled)) + (f.estimated && f.estimated !== f.scheduled ? ' <small>→ ' + esc(fmtTime(f.estimated)) + '</small>' : '') + '</div>' + statusHtml(f),
          route + ' ' + fmtTime(f.scheduled));
      });
    } else html += '<div class="transport-empty">' + esc(t('transport_empty')) + '</div>';
    html += '</section>';

    html += '<section class="transport-section"><h3 class="transport-section__title">' + shipIcon + esc(t('ferries')) + '</h3>';
    if (tr.ferries && tr.ferries.length) {
      tr.ferries.slice().sort(byTime).forEach(function (f) {
        html += item(f.bookingUrl,
          '<div class="transport-item__route">' + esc(pick(f, 'route')) + '</div><div class="transport-item__detail">' + esc(f.operatorZh || '') + '</div>',
          '<div class="transport-item__duration">' + esc(fmtTime(f.scheduled)) + '</div>' + statusHtml(f),
          pick(f, 'route') + ' ' + fmtTime(f.scheduled));
      });
    } else html += '<div class="transport-empty">' + esc(t('transport_empty')) + '</div>';
    html += '</section>';

    html += '<section class="transport-section"><h3 class="transport-section__title">' + islandIcon + esc(t('interisland')) + '</h3>';
    (tr.interIsland || []).forEach(function (r) {
      var freq = (I18N.lang === 'en' ? r.frequencyEn : r.frequencyZh) || '';
      html += item(r.bookingUrl,
        '<div class="transport-item__route">' + esc(pick(r, 'route')) + '</div><div class="transport-item__detail">' + esc(freq) + (r.firstDeparture ? ' · ' + esc(t('first_last', { a: r.firstDeparture, b: r.lastDeparture })) : '') + '</div>',
        '<div class="transport-item__duration">' + esc(r.durationMin != null ? t('duration_min', { n: r.durationMin }) : '') + '</div><div class="transport-item__freq">' + (r.priceNtd != null ? 'NT$' + esc(r.priceNtd) + ' →' : '') + '</div>',
        pick(r, 'route'));
    });
    html += '</section>';
    body.innerHTML = html;
  }

  // ===== 面板 / 導覽 =====
  var panelMap = { forecast: 'panelForecast', stay: 'panelStay', transport: 'panelTransport', profile: 'panelProfile' };
  function openPanel(id) { var p = $(id); if (!p) return; p.classList.add('active'); p.setAttribute('aria-hidden', 'false'); }
  function closeAllPanels() {
    document.querySelectorAll('.panel-overlay').forEach(function (p) { p.classList.remove('active'); p.setAttribute('aria-hidden', 'true'); });
  }
  function setActiveTab(tab) {
    document.querySelectorAll('.nav-bar__item').forEach(function (item) {
      var on = item.getAttribute('data-tab') === tab;
      item.classList.toggle('active', on);
      item.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }
  document.querySelectorAll('.nav-bar__item').forEach(function (item) {
    item.addEventListener('click', function () {
      var tab = item.getAttribute('data-tab');
      closeAllPanels();
      if (tab === 'map') { setActiveTab('map'); return; }
      if (panelMap[tab]) { openPanel(panelMap[tab]); setActiveTab(tab); }
    });
  });
  document.querySelectorAll('[data-close-panel]').forEach(function (el) {
    el.addEventListener('click', function () { closeAllPanels(); setActiveTab('map'); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeAllPanels(); setActiveTab('map'); } });
  $('locateBtn').addEventListener('click', locateMe);
  $('viewAllBtn').addEventListener('click', function () { if (state.activePopup) state.activePopup.remove(); fitView(state.viewAll ? 'core' : 'all', true); });

  // ===== 渲染 =====
  function renderAll(fitMap) {
    renderBadge();
    renderStatusBar();
    renderForecast();
    renderTransport();
    renderMe();
    renderMarkers(fitMap);
    updateViewBtn();
    renderNearby();
  }

  // ===== Service Worker（僅 http/https；Capacitor WKWebView 不支援時安全略過） =====
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('[sw]', e && e.message); });
    } catch (e) { /* ignore */ }
  }

  // ===== 啟動 =====
  function init() {
    I18N.init();
    I18N.applyStatic();
    renderStatusBar();
    renderMe();
    initMap();
    loadAll().then(function () {
      renderAll(true);
      if (getReminder().enabled) scheduleReminder().then(function () { renderMe(); });
      if (overallOrigin() !== 'live') toast(overallOrigin() === 'cache' ? t('offline_toast') : t('badge_mock'), 4000);
    });
    setInterval(function () {
      loadAll().then(function () {
        renderAll(false);
      });
    }, REFRESH_MS);
    window.addEventListener('online', function () { loadAll().then(function () { renderAll(false); }); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') loadAll().then(function () { renderAll(false); });
    });
    registerSW();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // 除錯用（不影響正式功能）
  window.__MBT = { state: state, version: APP_VERSION, apiBase: API_BASE };
})();
