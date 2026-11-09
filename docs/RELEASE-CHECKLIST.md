# 上架流程與自查表（2026-11 現行規定）

本文件取代 2026-05 的「上架審核完整教學.pdf」中已過時的部分。規定來源：
- Apple：2026-04-28 起上傳 App Store Connect 必須用 Xcode 26 以上、iOS 26 SDK 編譯；2026-09-09 起必須 target iOS 13 以上（本專案 deployment target 為 iOS 15）。[Apple Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)
- Google：2026-08-31 起新 App 與更新必須 targetSdk 36（Android 16）。本專案 `mobile/android/variables.gradle` 已是 36。[Google Play 目標 API 等級](https://support.google.com/googleplay/android-developer/answer/11926878)

## 零、角色分工

| 事項 | 誰做 | 狀態 |
|---|---|---|
| 程式、後端、原生專案、圖示、截圖、文案、隱私政策 | Teammate（已完成，見本 repo） | 完成 |
| 氣象署授權碼、TDX 金鑰 | 使用者註冊 → 交給 Teammate 設定到 Vercel | 待提供 |
| Apple Developer Program（US$99/年）、Google Play Console（US$25） | 使用者本人（需身分證件、信用卡、D-U-N-S 若以公司名義） | 待確認 |
| Android AAB 建置 | Teammate 已在沙箱產出 `mobile/dist/*.aab` | 完成 |
| iOS Archive 與上傳 | 必須在 Mac 的 Xcode 26 上做（可由 Teammate 透過你的 Mac 協助） | 待執行 |
| 商店後台填表、送審按鈕 | 使用者本人帳號（Teammate 可用你的瀏覽器協助填） | 待執行 |

## 一、帳號

### Apple Developer Program
1. 到 https://developer.apple.com/programs/enroll/ 用 Apple ID 登入，選「個人」或「組織」（組織需 D-U-N-S 編號與公司英文名，審核 1-2 週；個人 1-3 天）。
2. 付 US$99。開通信到了才能用 App Store Connect。
3. 個人名義上架時，商店顯示的開發者名稱是你的本名；想顯示「梅石科技」必須用組織名義。

### Google Play Console
1. https://play.google.com/console/signup，US$25 一次性。
2. 2023 年起的新個人帳號須通過身分驗證，並且**必須先用至少 12 位測試者做 14 天封閉測試**才能申請正式上架。組織帳號不受此限。這是最常被忽略的時程風險。
3. 建議開啟 Play App Signing（預設），上傳金鑰用 `mobile/keys/upload-keystore.jks`。

## 二、後端金鑰

1. 氣象署：https://opendata.cwa.gov.tw/ → 會員註冊 → 登入 → 「取得授權碼」。格式 `CWA-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`。
2. TDX：https://tdx.transportdata.tw/ → 註冊會員 → 會員中心 → 「API 金鑰」→ 新增，得到 Client Id / Client Secret。
3. 交給 Teammate 或自行在 Vercel 專案 `matsu-blue-tears` → Settings → Environment Variables 設定 `CWA_API_KEY`、`TDX_CLIENT_ID`、`TDX_CLIENT_SECRET`，然後 Redeploy。
4. 驗證：`curl https://matsu-blue-tears.vercel.app/api/v1/status` 的 `mode` 應為 `live`。

## 三、Android 上架

1. Play Console → 建立應用程式（名稱「馬祖藍眼淚預報」、預設語言 繁體中文、類型 應用程式、免費／付費）。
2. 左側「設定應用程式」逐項完成：隱私權政策網址、應用程式存取權（無登入）、廣告（無）、內容分級問卷（參考類：無敏感內容）、目標對象（18 歲以上即可；勾 13 歲以下會觸發家庭政策）、新聞應用程式（否）、資料安全（見 `store/app-store-listing.md` 第六節）、政府應用程式（否）。
3. 「主要商店資訊」：貼文案、上傳圖示 512、主題圖片 1024×500、手機截圖至少 2 張（建議 5 張，在 `store/screenshots/android/`）。
4. 「正式版」→ 建立新版本 → 上傳 `mobile/dist/matsu-blue-tears-1.0.0-release.aab` → 版本資訊貼 What's New。
5. 個人帳號：先在「測試」→「封閉測試」建立測試群組與版本，邀 12 人安裝並持續 14 天，之後才可「申請正式版存取權」。
6. 送審。首次審核通常 1-7 天。

## 四、iOS 上架

### 4.1 在 Mac 上建置（一次性環境）
```bash
# 需要 macOS 15.6+、Xcode 26（App Store 下載，約 15 GB）、Node 22
xcode-select --install
cd matsu-blue-tears/mobile
npm install
npm run sync          # 複製 ../web → www，並同步到 ios/、android/
npx cap open ios      # 開啟 Xcode
```
### 4.2 Xcode 設定
1. 左側點 `App` 專案 → TARGETS App → Signing & Capabilities → 勾 Automatically manage signing → Team 選你的開發者帳號。Bundle Identifier 已是 `tw.com.meishi.matsubluetears`。
2. General → 確認 Display Name「馬祖藍眼淚預報」、Version 1.0.0、Build 1、Minimum Deployments iOS 15.0。
3. 若 `en.lproj`／`zh-Hant.lproj`／`PrivacyInfo.xcprivacy` 沒出現在左側，將 `ios/App/App/` 裡的這幾個項目拖進 App 群組（勾 Copy items if needed 不勾、Add to targets 勾 App）。
4. 上方裝置選「Any iOS Device (arm64)」→ Product → Archive。
5. Organizer → Distribute App → App Store Connect → Upload。等 10-30 分鐘處理完成。

### 4.3 App Store Connect
1. https://appstoreconnect.apple.com → 我的 App → 新增 App：平台 iOS、名稱「馬祖藍眼淚預報」、主要語言 繁體中文、Bundle ID 選剛才的、SKU `MATSU-BLUETEARS-001`。
2. 「App 資訊」：類別 旅遊／天氣、內容版權、年齡分級問卷（全部「無」→ 4+）。
3. 「定價與供應狀況」：免費或選價格層級；地區全選或只選台灣。
4. 「App 隱私權」：見 `store/app-store-listing.md` 第五節。
5. 版本頁：截圖（6.9" 與 6.5" 各 5 張，在 `store/screenshots/ios/`）、宣傳文字、描述、關鍵字、支援網址、隱私政策網址、版權；「建置版本」選剛上傳的；「App 審查資訊」貼第七節的審核備註並填你的聯絡電話與 Email；「不需登入」。
6. 新增英文（美國）本地化，貼英文文案與同一組截圖。
7. 「提交以供審查」。

## 五、送審前自查（兩個商店共用）

- [ ] `curl .../api/v1/status` 回 `ok: true`；若 `mode` 為 `model`，App 內應看得到「模型推估」標示（允許上架，但建議先補金鑰）。
- [ ] 實機安裝 APK／TestFlight：五個分頁都能開；關閉網路後重開 App 仍顯示上次預報。
- [ ] 定位：拒絕權限時畫面有友善提示而不是空白或錯誤。
- [ ] 提醒：開啟後系統跳出通知權限；拒絕後開關回到關閉並說明原因。
- [ ] 訂房、立榮、船票連結都在系統瀏覽器開啟（不是卡在 App 裡的 WebView）。
- [ ] 隱私政策網址可公開存取、內容提到定位、通知、本機儲存、無帳號、無追蹤。
- [ ] 「我的」頁沒有任何點了沒反應的項目（Apple 4.2 / 2.1）。
- [ ] 中英切換後所有字串都有翻譯，沒有殘留另一語言。
- [ ] 截圖是實際畫面、不含裝置外框以外的誤導元素、不含「免費」「最佳」等 Apple 不允許的價格與排名用語。
- [ ] 版本號 iOS `1.0.0 (1)`、Android `1.0.0 (versionCode 1)` 一致。
- [ ] Android 上傳金鑰 `mobile/keys/` 已備份到安全位置（遺失即無法更新 App）。

## 六、常見退件與對策

| 退件理由 | 對策 |
|---|---|
| 4.2 Minimum Functionality：像網站 | 審核備註已說明原生功能；若仍退件，回覆列出定位、本機通知、離線、收藏四項並附操作影片 |
| 2.1 Performance：崩潰或功能無效 | 多半是沒金鑰時某面板空白；確認 model 模式每個面板都有內容 |
| 5.1.1 Data Collection：定位用途不清 | Info.plist 用途說明已寫；App 隱私權標籤要與實際一致（只勾精確位置） |
| 2.3.7 Metadata：關鍵字塞其他品牌 | 關鍵字只用地名與現象名，不要放「KKday」「Klook」等 |
| Google：資料安全表與實際不符 | 位置「僅於裝置處理」與「不分享」要一致；不要勾「收集裝置 ID」 |
| Google：個人帳號未完成 14 天封閉測試 | 提早開始封閉測試；或改用組織帳號 |

## 七、上架後

- 每年 4 月前用新 Xcode 重新 Archive 一次以符合 Apple 的 SDK 新規；每年 8 月前把 `variables.gradle` 的 targetSdk 升到新一級。
- 氣象署授權碼沒有到期日，但 TDX 金鑰一年需在會員中心續期一次。
- 版本更新：改 `mobile/package.json`、`android/app/build.gradle` versionCode+1、Xcode Build+1，`npm run sync` 後重新 Archive／`npm run build:android`。
