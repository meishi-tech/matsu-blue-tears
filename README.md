# 馬祖藍眼淚預報 Matsu Blue Tears

馬祖藍眼淚（夜光藻）觀賞指數、七日預報、十處觀測點地圖、航班船班與濃霧特報、觀賞提醒。繁中／英文。
由梅石譯境 Meistone 開發，導流至 [matsu.live](https://matsu.live) 訂房。

- 網頁版（正式）：https://matsu-blue-tears.vercel.app
- API：https://matsu-blue-tears.vercel.app/api/v1 （合約見 `docs/API-CONTRACT.md`）
- 隱私權政策：https://matsu-blue-tears.vercel.app/privacy-policy.html
- GitHub Pages 預覽：https://meishi-tech.github.io/matsu-blue-tears/

## 目錄

```
web/        前端（單頁、PWA；Capacitor 直接打包這個目錄）
api/v1/     Vercel Serverless Functions：status / forecast / hotspots / transport
lib/        氣象署 CWA、TDX、天文計算、藍眼淚指數模型、熱點、靜態班表、快取
tests/      node --test 單元測試與真實 API fixture
mobile/     Capacitor 8 原生專案（ios/、android/）、圖示、建置腳本、keys/（不入版控）
store/      商店文案、截圖、Play 主題圖
docs/       API 合約、後端部署、上架流程與自查表
resources/  1024 母圖示
```

## 本機開發

```bash
npm test                        # 後端單元測試
npx vercel dev                  # 前端 + API 在 http://localhost:3000
node web/check.mjs              # 前端靜態檢查
```

## 部署

- 前端與 API：`vercel deploy --prod`（專案 meishi/matsu-blue-tears）。環境變數 `CWA_API_KEY`、`TDX_CLIENT_ID`、`TDX_CLIENT_SECRET` 設定後即切換為即時資料；未設定時以 `mode: "model"` 運作並在 App 內標示「模型推估」。
- GitHub Pages：push 到 main 後由 `.github/workflows/pages.yml` 自動發布 `web/`。
- Android：`cd mobile && ./scripts/build-android.sh` → `mobile/dist/*.aab`（見 `mobile/docs/ANDROID-BUILD.md`）。
- iOS：在 Mac 上 `cd mobile && npm install && npm run sync && npx cap open ios`（見 `mobile/docs/IOS-BUILD.md`）。

## 上架

依 `docs/RELEASE-CHECKLIST.md`，文案與隱私標籤在 `store/app-store-listing.md`。

## 資料來源與授權

- 交通部中央氣象署 [氣象資料開放平臺](https://opendata.cwa.gov.tw/)（政府資料開放授權條款 1.0，相容 CC BY 4.0）
- 交通部 [TDX 運輸資料流通服務平臺](https://tdx.transportdata.tw/)
- 地圖：MapLibre GL JS（BSD-3）、OpenFreeMap 圖磚、© OpenStreetMap 貢獻者
- 藍眼淚指數為本專案推估模型，非官方預報。
