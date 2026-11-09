# 馬祖藍眼淚預報 — 後端說明（部署與金鑰設定）

Production：`https://matsu-blue-tears.vercel.app/api/v1`（已部署，見下方「部署紀錄」）

後端為 Vercel Serverless Functions（Node 20+、ESM、零 npm 依賴），程式碼位於 `api/v1/` 與 `lib/`。
前端靜態檔在 `web/`，由 `vercel.json` 的 `outputDirectory` 指定；函式區域為 `hnd1`（東京）。

## 目錄

| 路徑 | 內容 |
|---|---|
| `api/v1/status.js` | GET /status 今晚總覽 |
| `api/v1/forecast.js` | GET /forecast 7 天預報 |
| `api/v1/hotspots.js` | GET /hotspots 熱點清單＋今晚分數 |
| `api/v1/transport.js` | GET /transport 航班／船班／島際／特報 |
| `lib/handler.js` | handler 外殼：CORS、OPTIONS、快取標頭、500 處理 |
| `lib/build.js` | 把 CWA（或氣候平均）＋天文＋模型組成 `days` / `today` |
| `lib/cwa.js` | 氣象署開放資料：一週預報、潮汐、浮標海溫、特報（解析器＋抓取） |
| `lib/tdx.js` | TDX：OAuth token 快取、航班 FIDS、船班即時看板 |
| `lib/schedules.js` | TDX 不可用時的靜態班表（民航局時刻表、馬祖 e 點通） |
| `lib/astro.js` | SunCalc 演算法移植：日落、月出沒、月相、最佳觀測窗口 |
| `lib/climate.js` | 連江縣各月氣候平均（model 模式用） |
| `lib/model.js` | 藍眼淚指數：六因子加權 |
| `lib/hotspots.js` | 10 個熱點座標、說明、地點修正 |
| `lib/cache.js` / `lib/http.js` / `lib/time.js` | 記憶體快取、含逾時的 fetch、台灣時區工具 |
| `tests/` | `node --test`；`tests/fixtures/` 為真實 CWA JSON 與依 TDX OAS 建立的樣本 |

## 執行模式：live 與 model

- **live**：`CWA_API_KEY` 存在且一週預報（F-D0047-083）抓取成功。潮汐、海溫、特報若個別失敗仍為 live，缺少的資料集會從 `sources.cwa.datasets` 消失，錯誤訊息放在 `sources.cwa.errors`。
- **model**：沒有金鑰或上游失敗。預報改用 `lib/astro.js` 天文計算＋ `lib/climate.js` 氣候平均；`tides` 為空陣列、`seaTempC`／`tide` 為 `null`，潮汐與海溫因子固定 50。`summaryZh/En` 會附註「天文＋氣候平均推估」。每個 day/today 另有 `weatherSource: "cwa" | "climatology"`。
- **所有端點在任何情況下都回 HTTP 200**（只有程式本身例外才回 500 並 `Cache-Control: no-store`）。

TDX 同理：沒有 `TDX_CLIENT_ID/SECRET` 或抓取失敗時，`flights`／`ferries` 改用靜態班表（`status: "unknown"`、`source: "static_timetable"`），並在 `sources.tdx.status` 與 `scheduleSource` 標示。

## 環境變數

| 變數 | 取得方式 | 說明 |
|---|---|---|
| `CWA_API_KEY` | [氣象資料開放平臺 → 取得授權碼](https://opendata.cwa.gov.tw/user/authkey)，格式 `CWA-xxxxxxxx-xxxx-...` | 免費；每日有呼叫上限，本專案每 10 分鐘最多打一次 |
| `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET` | [TDX 會員中心 → API 金鑰](https://tdx.transportdata.tw/user/dataservice/key) | 免費會員每日 20,000 次；token 快取 24 小時 |
| `CACHE_TTL_SEC` | 選填 | 預設 600 |

設定方式（擇一）：

```bash
# Vercel 專案（production）
vercel env add CWA_API_KEY production --scope meishi --token "$VERCEL_TOKEN"
vercel env add TDX_CLIENT_ID production --scope meishi --token "$VERCEL_TOKEN"
vercel env add TDX_CLIENT_SECRET production --scope meishi --token "$VERCEL_TOKEN"
# 之後重新部署即生效：vercel deploy --prod --scope meishi --token "$VERCEL_TOKEN"

# 本機開發
cp .env.example .env.local   # 填入金鑰後執行 npm run dev（= vercel dev）
```

金鑰加入後**不需改程式**，`lib/cwa.js`／`lib/tdx.js` 的 `isConfigured()` 會自動切換為 live。

## 資料來源與欄位對應

### 中央氣象署（CWA）
| 資料集 | 用途 | 參數 | 備註 |
|---|---|---|---|
| `F-D0047-083` 連江縣鄉鎮一週預報 | 氣溫、風向風速、天氣、降雨機率 | `LocationName=南竿鄉` | 12 小時分段；第 4 天起無降雨機率，改以天氣現象推估（`popEstimated: true`）。風速 `>= 11` 以 11 m/s 計 |
| `F-A0021-001` 潮汐預報 | 每日滿／乾潮時刻與高度 | `LocationId=09007010`（南竿鄉；北竿 09007020、莒光 09007030、東引 09007040 已驗證） | `heightCm` 使用 `AboveTWVD`（相對台灣高程基準） |
| `O-B0075-001` 海象觀測（浮標） | 海溫 | `StationID=C6W08`（馬祖浮標，東引鄉 26.377N 120.536E） | 浮標偶有缺測；缺測時 `seaTempC: null`、因子 50 |
| `W-C0033-001` 天氣特報 | 濃霧／強風／颱風／大雨／低溫 | `locationName=連江縣` | `alerts[].type`：fog / wind / typhoon / rain / cold |

CWA 結構為 PascalCase（`records.Locations[0].Location[0].WeatherElement[]`），解析器以 `tests/fixtures/` 內真實回應驗證。

### 交通部 TDX
| 端點 | 用途 |
|---|---|
| `POST /auth/realms/TDXConnect/protocol/openid-connect/token` | client_credentials 取 token（快取到期前 5 分鐘） |
| `GET /api/basic/v2/Air/FIDS/Airport/Departure/{LZN,MFK}`、`/Arrival/{LZN,MFK}` | 南竿、北竿即時航班（排除貨機、去重） |
| `GET /api/basic/v3/Ship/ShipLiveBoard/Domestic/City/LienchiangCounty` | 連江縣各港出發看板 |

備註文字對照為 `on_time / delayed / cancelled / departed / arrived / unknown`。

### 靜態班表（`lib/schedules.js`）
- 航班：民航局「國內定期航線班機時刻表」2026 年 11、12 月（https://www.caa.gov.tw/RegularFlight.aspx?a=268&lang=1）。
- 臺馬航線：馬祖 e 點通（https://etravel.matsu.gov.tw/inter_island_flight_schedules）；新臺馬輪 22:30 基隆開、週二航修、單日先馬後東／雙日先東後馬。
- 島際：南竿鄉公所、馬祖國家風景區、馬祖 e 點通。
- 班表每季會調整，更新時只需改 `FLIGHT_TIMETABLE` / `INTER_ISLAND` 常數並補上來源註解。

### 氣候平均（`lib/climate.js`）
- 氣溫、降雨日數：氣象署馬祖站（46799）2005–2020 平均（轉引自 Wikipedia「Matsu Islands」氣候表；馬祖站尚未列入氣象署 1991–2020 三十年平均）。
- 風向風速：連江縣防救災資訊網「自然環境」（4–8 月南／東南風、9–3 月東北風；11 月約 9 m/s、8 月約 3 m/s，其餘月份內插）。

### 天文
`lib/astro.js` 為 SunCalc（BSD-2，Vladimir Agafonkin）演算法的 ESM 移植，座標 26.16N 119.95E。單元測試對照 timeanddate.com 2026-11-09 新月、11-24 滿月、11-17 上弦、12-01 下弦。

## 快取策略
- 記憶體：`lib/cache.js` 以資料集為 key，TTL 600 秒（潮汐 3600 秒），同一 key 併發請求共用一個上游呼叫；失敗結果記 30 秒避免連續重打。
- CDN：`Cache-Control: public, s-maxage=600, stale-while-revalidate=1800`。
- 因此同一函式實例每 10 分鐘最多打一次上游；Vercel 多實例時各自快取，整體仍遠低於 CWA／TDX 配額。

## 本機開發與測試

```bash
npm test                 # node --test tests/（26 個測試）
npm run dev              # vercel dev → http://localhost:3000/api/v1/status
```

## 部署

```bash
# 首次：連結到 meishi 團隊的 matsu-blue-tears 專案
vercel link --yes --project matsu-blue-tears --scope meishi --token "$VERCEL_TOKEN"
# 部署 production
vercel deploy --prod --yes --scope meishi --token "$VERCEL_TOKEN"
# 驗證
curl -s https://matsu-blue-tears.vercel.app/api/v1/status | head -c 600
```

### 部署紀錄
- 2026-11-09：首次 production 部署成功。專案 `meishi/matsu-blue-tears`（prj_FZBiltRKmLpU2W8mKUxefGhGdRue），
  deployment `https://matsu-blue-tears-lxxpui2bj-meishi.vercel.app`，別名 `https://matsu-blue-tears.vercel.app`。
  四個端點皆回 200、`mode: "model"`（尚未設定 CWA／TDX 金鑰），CDN 快取第二次請求 `x-vercel-cache: HIT`。
- `vercel link` 時嘗試自動連結 GitHub repo 失敗（token 對 repo 無 write 權限），不影響 CLI 部署；之後可在 Vercel 後台手動連結 Git。
- `.vercelignore` 排除 `mobile/`（378 MB）、`store/`、`resources/`、`docs/`、`tests/`，避免上傳過大。
- `vercel.json` 的 `memory` 設定在 Active CPU 計費下會被忽略（Vercel 警告，無害）。
