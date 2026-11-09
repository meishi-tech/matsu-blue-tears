# iOS 建置與上架說明 — 馬祖藍眼淚預報

iOS 版只能在 **macOS + Xcode** 編譯；Linux／CI 沙箱只能完成專案設定（本文件第 1 節列出的項目都已經做好）。

- Bundle ID：`tw.com.meishi.matsubluetears`
- 版本：`MARKETING_VERSION 1.0.0`、`CURRENT_PROJECT_VERSION 1`
- 最低支援：iOS 15.0
- 套件管理：Swift Package Manager（`ios/App/CapApp-SPM`），**不使用 CocoaPods**，不需要 `pod install`

---

## 1. 已在版本庫內完成的設定

| 項目 | 位置 | 說明 |
|---|---|---|
| App 顯示名稱、定位權限文案（預設繁中） | `ios/App/App/Info.plist` | `CFBundleDisplayName`、`NSLocationWhenInUseUsageDescription`、`ITSAppUsesNonExemptEncryption = false` |
| 多語系 Info.plist 字串 | `ios/App/App/en.lproj/InfoPlist.strings`、`zh-Hant.lproj/InfoPlist.strings` | 以 PBXVariantGroup「InfoPlist.strings」加入 App target 的 Resources；project `knownRegions` 含 `en`、`Base`、`zh-Hant` |
| 隱私權資訊清單 | `ios/App/App/PrivacyInfo.xcprivacy` | 不追蹤；收集「精確位置」（不連結身分、不用於追蹤、用途為 App 功能）；Required Reason API：UserDefaults（CA92.1）、File Timestamp（C617.1）。已加入 Resources |
| 圖示／啟動畫面 | `ios/App/App/Assets.xcassets` | 由 `@capacitor/assets` 產生（`npm run assets`） |
| 專案檔修補腳本 | `scripts/patch-ios-pbxproj.mjs` | 可重複執行；若將來 `npx cap add ios` 重建專案，再跑一次即可把上述資源加回去 |

> 補充：`Info.plist` 的 `CFBundleDevelopmentRegion` 目前是 `zh_TW`，Xcode 專案的區域代碼使用 `zh-Hant`。兩者都能運作，但若 Xcode 在 Localizations 面板顯示警告，可將其改為 `zh-Hant` 保持一致。

---

## 2. Mac 上的建置步驟

### 2.1 環境

- macOS 15 以上、**Xcode 26+**（App Store 自 2026 年起要求以 iOS 26 SDK 編譯）
- Node.js 22 LTS（`brew install node@22`）
- 已加入 Apple Developer Program 的 Apple ID，且在 Xcode → Settings → Accounts 登入

### 2.2 步驟

```bash
cd mobile
npm install                 # 安裝 Capacitor CLI 與外掛
npm run sync                # = npm run sync:web（../web → www）+ npx cap sync（複製到 ios/App/App/public 並更新 SPM 套件）
npx cap open ios            # 開啟 ios/App/App.xcodeproj
```

Xcode 開啟後：

1. 第一次開啟會自動解析 Swift Package（CapApp-SPM → Capacitor、各外掛）。若卡住，選 **File → Packages → Resolve Package Versions**。
2. 左側選 **App** 專案 → **App** target → **Signing & Capabilities**：
   - 勾選 **Automatically manage signing**
   - **Team** 選公司的開發者團隊（Meishi Tech）
   - Bundle Identifier 維持 `tw.com.meishi.matsubluetears`
   - **不需要**新增 Push Notifications capability：本 App 只用本機通知（`@capacitor/local-notifications`），沒有遠端推播。也不需要 Background Modes。
3. 頂部裝置選擇器改為 **Any iOS Device (arm64)**。
4. **Product → Archive**。完成後 Organizer 會自動開啟。
5. 在 Organizer 選剛建好的 Archive → **Distribute App** → **App Store Connect** → **Upload**，簽名選 Automatically manage signing，一路 Next 至 Upload。
6. 到 [App Store Connect](https://appstoreconnect.apple.com) → 該 App → TestFlight 等候處理（通常 5–30 分鐘），之後即可加到版本送審。

### 2.3 在模擬器／實機測試

- 模擬器：裝置選任一 iPhone 模擬器，⌘R。
- 實機：手機以線連接，裝置選該手機；第一次需在手機 **設定 → 一般 → VPN 與裝置管理** 信任開發者憑證。

### 2.4 升版

每次上傳 App Store Connect，`CURRENT_PROJECT_VERSION`（Build）必須比同一 `MARKETING_VERSION` 之前上傳的大。修改方式：

- Xcode：App target → **General** → Identity 的 **Version**（= MARKETING_VERSION）與 **Build**（= CURRENT_PROJECT_VERSION）
- 或直接編輯 `ios/App/App.xcodeproj/project.pbxproj` 中 Debug/Release 兩處的 `MARKETING_VERSION` 與 `CURRENT_PROJECT_VERSION`

建議與 Android 的 `versionName` / `versionCode` 保持一致（見 `docs/ANDROID-BUILD.md` 第 5 節）。

---

## 3. 常見錯誤

| 錯誤訊息／症狀 | 原因與解法 |
|---|---|
| `Signing for "App" requires a development team` | 未在 Signing & Capabilities 選 Team；或 Apple ID 尚未加入 Developer Program |
| `No profiles for 'tw.com.meishi.matsubluetears' were found` | 開啟 Automatically manage signing 讓 Xcode 自動建立 profile；若 Bundle ID 被其他帳號註冊，需改 ID 或轉移 |
| `Missing package product 'Capacitor'` / SPM 解析失敗 | File → Packages → Reset Package Caches，再 Resolve Package Versions；確認已跑過 `npx cap sync` |
| `public` 資料夾為空或畫面空白 | 沒有執行 `npm run sync`；`ios/App/App/public` 不進版控，每台機器都要先 sync |
| `ITMS-91053: Missing API declaration` | PrivacyInfo.xcprivacy 未被打包。確認 Xcode 左側 App 群組內有 `PrivacyInfo.xcprivacy` 且 Target Membership 勾選 App；或重跑 `node scripts/patch-ios-pbxproj.mjs` |
| `ITMS-90683: Missing purpose string` | Info.plist 缺少 `NSLocationWhenInUseUsageDescription`（本專案已包含）；若新增使用其他隱私 API 的外掛需再補對應 key |
| Archive 選項為灰色 | 裝置選擇器停在模擬器，改為 Any iOS Device (arm64) |
| `The app references non-public selectors` / WebView 相關警告 | 一般為誤報，可忽略；若被拒審，更新 Capacitor 至最新 patch |
| App Store Connect 顯示 `CFBundleVersion must be higher` | 升版 `CURRENT_PROJECT_VERSION`（見 2.4） |
| 本機通知沒跳出 | 第一次啟動時使用者未允許通知；到 設定 → 馬祖藍眼淚預報 → 通知 開啟。不需 Push Notifications capability |
| 語言切換後顯示名稱仍是中文 | 系統語言為英文才會套用 `en.lproj/InfoPlist.strings`（Matsu Blue Tears）；確認 InfoPlist.strings 在 Resources 內 |

---

## 4. 首次上架 App Store Connect 的檢查清單

- [ ] 在 App Store Connect 建立 App（Bundle ID `tw.com.meishi.matsubluetears`、主要語言「繁體中文」）
- [ ] App 隱私權：資料類型選「精確位置」→ 用途「App 功能」→ 未連結身分、不用於追蹤（與 PrivacyInfo.xcprivacy 一致）
- [ ] 出口合規：已在 Info.plist 設 `ITSAppUsesNonExemptEncryption = false`，不需每次回答
- [ ] 隱私權政策網址：`web/privacy-policy.html` 部署後的公開網址
- [ ] 截圖：6.9 吋與 6.5 吋 iPhone 各至少 1 張（可用模擬器 ⌘S 擷取）
- [ ] 審查備註：說明 App 為離線可用的藍眼淚預報，定位僅用於計算與觀測點距離
