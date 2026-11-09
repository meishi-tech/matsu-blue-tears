# 馬祖藍眼淚預報 — API 合約 v1

Base URL（production，2026-11-09 已部署並驗證）：`https://matsu-blue-tears.vercel.app/api/v1`
本機開發：`http://localhost:3000/api/v1`（`vercel dev`）

所有端點：GET、JSON、UTF-8、`Access-Control-Allow-Origin: *`、`Cache-Control: public, s-maxage=600, stale-while-revalidate=1800`。
所有時間為 ISO 8601 並帶 `+08:00`。日期（`date`）為 `YYYY-MM-DD`（台灣時區）。

每個回應都帶：

```json
{
  "ok": true,
  "generatedAt": "2026-11-09T09:00:00+08:00",
  "sources": {
    "cwa":  { "status": "live" | "unavailable" | "not_configured", "fetchedAt": "...", "datasets": ["F-D0047-083","F-A0021-001"], "errors": ["..."] /* 選填，部分資料集失敗時 */ },
    "tdx":  { "status": "live" | "unavailable" | "not_configured" | "not_used", "fetchedAt": "..." },   // not_used = 該端點不需 TDX（status/forecast/hotspots）
    "astro": { "status": "computed" }
  },
  "mode": "live" | "model"      // live = 至少 CWA 可用；model = 僅天文＋氣候平均推估
}
```

錯誤：`{ "ok": false, "error": { "code": "UPSTREAM_TIMEOUT", "message": "..." } }`，HTTP 200 以外只用於 5xx 真正故障；上游失敗時仍回 200 + `mode: "model"` 並讓前端照常運作。

---

## GET /status

今晚總覽（狀態列用）。

```json
{
  "ok": true, "generatedAt": "...", "sources": {...}, "mode": "live",
  "today": {
    "date": "2026-11-09",
    "score": 62,                 // 0-100 藍眼淚指數
    "level": "medium",           // "high" (>=70) | "medium" (40-69) | "low" (<40)
    "season": "off" | "early" | "peak" | "late",   // 10-2 off, 3-4 early, 5-7 peak, 8-9 late
    "tempC": 21,                 // 今晚氣溫（CWA）
    "windDir": "NE", "windKmh": 18,
    "wxZh": "多雲", "wxEn": "Cloudy", "pop": 20,  // 降雨機率 %
    "moon": { "phase": 0.73, "illumination": 0.68, "emoji": "🌖", "nameZh": "虧凸月", "nameEn": "Waning Gibbous" },
    "sunset": "2026-11-09T17:12:00+08:00",
    "moonrise": "...|null", "moonset": "...|null",
    "bestWindow": { "start": "2026-11-09T19:00:00+08:00", "end": "2026-11-09T22:30:00+08:00", "reasonZh": "日落後至月出前最暗", "reasonEn": "Darkest between sunset and moonrise" },
    "tide": { "nextType": "滿潮" | "乾潮", "nextTime": "...", "range": "大" | "中" | "小" } | null,   // model 模式為 null
    "seaTempC": 22.1 | null,
    "fogAlert": false,
    "weatherSource": "cwa" | "climatology",   // 後端新增：氣象欄位來自 CWA 或氣候平均
    "factors": { "season": 10, "moon": 100, "wind": 0, "sky": 73, "seaTemp": 50, "tide": 50 },   // 後端新增，同 /forecast
    "summaryZh": "今晚月光偏亮、東北風稍強，觀測機會中等。",
    "summaryEn": "Bright moon and a brisk NE wind tonight; moderate chance."
  }
}
```

## GET /forecast

未來 7 天（含今天）。

```json
{
  "ok": true, "generatedAt": "...", "sources": {...}, "mode": "live",
  "days": [
    {
      "date": "2026-11-09", "weekdayZh": "今天", "weekdayEn": "Today",
      "score": 62, "level": "medium",
      "moon": { "phase": 0.73, "illumination": 0.68, "emoji": "🌖", "nameZh": "虧凸月", "nameEn": "Waning Gibbous" },
      "tempC": 20, "tempMinC": 19, "tempMaxC": 23,     // tempC = 夜間氣溫（後端新增）
      "windDir": "NE", "windKmh": 18,
      "wxZh": "多雲", "wxEn": "Cloudy", "pop": 20,
      "sunset": "...", "moonrise": "...|null", "moonset": "...|null",
      "bestWindow": { "start": "...", "end": "...", "reasonZh": "...", "reasonEn": "..." },
      "viewTime": "17:40-00:25",                          // 後端新增，同 hotspots.viewTime
      "tides": [ { "time": "...", "type": "滿潮", "heightCm": 229 }, ... ],   // heightCm = CWA AboveTWVD（台灣高程基準，可為負）；model 模式為 []
      "tideRange": "大" | "中" | "小" | null,
      "seaTempC": 22.1 | null,
      "weatherSource": "cwa" | "climatology",
      "factors": {              // 各因子 0-100 分，前端可畫雷達／條列
        "season": 20, "moon": 35, "wind": 70, "sky": 80, "seaTemp": 55, "tide": 60
      }
    }
  ]
}
```

## GET /hotspots

```json
{
  "ok": true, "generatedAt": "...", "sources": {...}, "mode": "live",
  "hotspots": [
    {
      "id": "beihai", "nameZh": "北海坑道", "nameEn": "Beihai Tunnel",
      "island": "nangan", "islandZh": "南竿", "islandEn": "Nangan",
      "lat": 26.1538, "lng": 119.9308,
      "score": 68, "intensity": "medium",
      "viewTime": "19:00-22:30",               // 今晚建議時段（取自 bestWindow）
      "seaTempC": 22.1 | null, "windDir": "NE", "windKmh": 18,
      "tideZh": "漲潮中" | "退潮中" | "接近滿潮" | "接近乾潮" | "無潮汐資料", "tideEn": "Rising" | "Falling" | "Near high tide" | "Near low tide" | "No tide data",   // 以 bestWindow.start 時刻判定
      "modifiers": { "aspect": 2, "light": 8, "shelter": 6 },   // 後端新增：地點修正明細
      "descZh": "坑道內搖櫓賞淚，需預約；無光害，弱光也可見。",
      "descEn": "Rowboat tours inside the tunnel (booking required); zero light pollution.",
      "tips": { "zh": "需預約搖櫓船；坑道外步道可免費觀賞。", "en": "..." },
      "bookingUrl": "https://..." | null,
      "accessZh": "南竿仁愛村，距梅石 8 分鐘車程", "accessEn": "..."
    }
  ]
}
```

固定熱點清單（lib/hotspots.js）：北海坑道、鐵堡、大漢據點、津沙聚落、芹壁村、橋仔、東莒福正沙灘、東莒大埔、西莒坤坵、東引。熱點分數 = 當日分數 ± 地點修正（面向、光害、遮蔽）。

## GET /transport

```json
{
  "ok": true, "generatedAt": "...", "sources": {...},
  "flights": [
    { "id": "B7-8701", "airline": "立榮航空", "airlineEn": "UNI AIR", "flightNo": "B78701",
      "from": "TSA", "fromZh": "台北松山", "to": "LZN", "toZh": "南竿",
      "scheduled": "2026-11-09T07:50:00+08:00", "estimated": "...|null",
      "status": "on_time" | "delayed" | "cancelled" | "departed" | "arrived" | "unknown",
      "statusZh": "準時", "statusEn": "On time",
      "bookingUrl": "https://www.uniair.com.tw/rwd/B2C/booking/ubk_search.aspx",
      "source": "tdx" | "static_timetable" }
  ],
  "ferries": [
    { "id": "...", "routeZh": "基隆 → 南竿（臺馬之星）", "routeEn": "Keelung → Nangan (Taima Star)",
      "operatorZh": "全港通航業" | null, "scheduled": "...", "estimated": "...|null", "status": "...", "statusZh": "...", "statusEn": "...",
      "noteZh": "...|null", "noteEn": "...|null", "cancelReason": "...|null",
      "bookingUrl": "https://www.matsuebs.com/home/SelectShip", "source": "tdx" | "static_timetable" }
  ],
  "scheduleSource": { "flights": "tdx" | "static_timetable", "ferries": "tdx" | "static_timetable" },
  "interIsland": [ { "id": "nangan-beigan", "routeZh": "南竿 ↔ 北竿", "routeEn": "...", "portsZh": "福澳港 ↔ 白沙港", "firstDeparture": "07:00", "lastDeparture": "17:30", "frequencyZh": "每日約 15 班", "frequencyEn": "...", "departuresFromNangan": ["07:00", "..."], "durationMin": 15, "priceNtd": 160, "operatorZh": "...", "bookingUrl": "...|null", "noteZh": "...", "noteEn": "..." } ],
  "alerts": [ { "type": "fog" | "wind" | "typhoon" | "rain" | "cold", "severity": "warning" | "advisory", "titleZh": "連江縣濃霧特報", "titleEn": "Dense fog advisory", "bodyZh": "...", "bodyEn": "...", "issuedAt": "...", "validUntil": "..." } ],
  "staticNotice": { "zh": "航班／船班以業者公告為準，濃霧季（3-5 月）停航頻繁。", "en": "..." }
}
```

TDX 不可用時：`flights` 與 `ferries` 回傳每日固定班表（lib/schedules.js，status `unknown`），`sources.tdx.status = "not_configured"|"unavailable"`。

## 後端實作備註（v1.0，2026-11-09）

- 以上標「後端新增」的欄位皆為向下相容的補充，前端可忽略。
- model 模式（無 CWA 金鑰／上游失敗）：氣象欄位取 `lib/climate.js` 連江縣各月氣候平均（氣象署馬祖站 2005–2020；風向依連江縣防救災資訊網），`summaryZh/En` 末尾會附「天文＋氣候平均推估」字句。
- CWA 一週預報第 4 天起無 12 小時降雨機率，`pop` 以天氣現象推估（陰 25、雨 45、雷 60、多雲 15、晴 5）。
- `/transport` 的 `flights`/`ferries` 回傳**今天**的班次；TDX 不可用時為靜態班表（民航局 2026-11/12 月時刻表、馬祖 e 點通），詳見 `docs/BACKEND.md`。

## 環境變數（Vercel）

| 變數 | 說明 |
|---|---|
| `CWA_API_KEY` | 氣象資料開放平臺授權碼 `CWA-XXXXXXXX-...` |
| `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET` | TDX 會員 API 金鑰 |
| `CACHE_TTL_SEC` | 預設 600 |

## 資料來源（後端實作參考）

- CWA 鄉鎮一週預報 連江縣：`GET https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-083?Authorization=KEY&LocationName=南竿鄉`
- CWA 鄉鎮 3 天逐 3 小時 連江縣：`F-D0047-081`
- CWA 潮汐預報 1 個月：`F-A0021-001?LocationId=09007010`（連江縣南竿鄉；北竿 09007020、莒光 09007030、東引 09007040 — 已驗證皆有資料）
- CWA 海象觀測（浮標海溫）：`O-B0075-001?StationID=C6W08`（馬祖浮標，東引鄉；已驗證。缺測時 `seaTempC: null`、海溫因子 50）
- CWA 天氣特報：`W-C0033-001?locationName=連江縣`（濃霧、強風）
- TDX 航班 FIDS：`https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport/Arrival/LZN`、`.../Departure/LZN`、`MFK`（北竿）
- TDX 船班：`https://tdx.transportdata.tw/api/basic/v3/Ship/ShipLiveBoard/Domestic/City/LienchiangCounty?$format=JSON`（路徑依 TDX 航運 OAS 驗證；回傳 `{UpdateTime, Items:[{PortName, DepartureLiveBoards[], ArrivalLiveBoards[]}]}`，後端只取出發看板）
- TDX 認證：`POST https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token`（client_credentials）
- 天文：自行計算（SunCalc 演算法）— 日落、月出月沒、月相、照度。

## 藍眼淚指數模型（lib/model.js）

score = Σ weight × factor，權重：季節 0.25、月光 0.20、風 0.20、天空(雲/雨) 0.15、海溫 0.10、潮汐 0.10。
- 季節：5-7 月 100、4 與 8 月 70、3 與 9 月 40、其他 10。
- 月光：100 × (1 − illumination)，若 bestWindow 內月亮在地平線下則加成至 ≥ 85。
- 風：S/SW/SE 風 8-20 km/h 100；0-8 60；20-30 40；>30 10；北風系 −20。
- 天空：pop 0-10% 100；線性降至 pop 70% 為 10；wx 含「雨」再 −20。
- 海溫：20-26°C 100；16-20 或 26-29 60；其他 25；無資料給 50。
- 潮汐：觀測時段內漲潮或滿潮前後 2 小時 100，退潮 50；無資料（model 模式）給 50。
- 風、天空無資料時給 50（僅理論上可能；model 模式用氣候平均仍有值）。
- 北風系扣 20 後可低於 10（例：N 風 35 km/h → 0）。
所有因子回傳於 `factors`，前端需以「模型推估」標示，並顯示資料來源狀態。
