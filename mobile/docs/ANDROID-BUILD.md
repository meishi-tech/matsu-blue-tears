# Android 建置說明 — 馬祖藍眼淚預報

本文件說明如何從 `mobile/` 目錄產出 Google Play 上架用的 **AAB（Android App Bundle）** 與測試用的 **debug APK**。

- 套件名稱（applicationId）：`tw.com.meishi.matsubluetears`
- 目前版本：`versionName 1.0.0`、`versionCode 1`
- minSdk 24（Android 7.0）／targetSdk 36／compileSdk 36
- 產物位置：`mobile/dist/matsu-blue-tears-<versionName>-release.aab`、`mobile/dist/matsu-blue-tears-<versionName>-debug.apk`

---

## 1. 環境需求

| 元件 | 版本 | 備註 |
|---|---|---|
| Node.js | 22 LTS | 執行 Capacitor CLI 與 `scripts/sync-web.mjs` |
| JDK | Temurin 21 | Android Gradle Plugin 8.x 需 JDK 17 以上；本專案以 21 驗證 |
| Android SDK | `platform-tools`、`platforms;android-36`、`build-tools;36.0.0` | 以 command-line tools 的 `sdkmanager` 安裝即可，不需要 Android Studio |
| Gradle | 8.14.3（wrapper 自動下載） | 第一次建置會下載約 200 MB |

專案目錄內必須有：

- `android/local.properties`：`sdk.dir=<Android SDK 路徑>`（不進版控；`scripts/build-android.sh` 會自動寫入）
- `keys/keystore.properties` 與 `keys/upload-keystore.jks`：正式簽名用（不進版控，見第 3 節）

### 1.1 Linux（CI／沙箱）安裝範例

```bash
# JDK 21
curl -fsSL --retry 3 -o jdk21.tar.gz \
  "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
mkdir -p ~/jdk21 && tar -xzf jdk21.tar.gz -C ~/jdk21 --strip-components=1
export JAVA_HOME=~/jdk21

# Android command-line tools
mkdir -p ~/android-sdk/cmdline-tools
curl -fsSL --retry 3 -o cmdtools.zip \
  "https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip"
python3 -c "import zipfile;zipfile.ZipFile('cmdtools.zip').extractall('$HOME/android-sdk/cmdline-tools')"
mv ~/android-sdk/cmdline-tools/cmdline-tools ~/android-sdk/cmdline-tools/latest
export ANDROID_HOME=~/android-sdk
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

> 若網路環境有 TLS 攔截代理（企業網路／沙箱），Java 會因不信任代理憑證而下載失敗（`PKIX path building failed`）。解法：把代理 CA 匯入 JDK 信任庫：
> `keytool -importcert -noprompt -cacerts -storepass changeit -alias proxy-ca -file <ca.crt>`

### 1.2 Mac 安裝範例

```bash
brew install --cask temurin@21
brew install --cask android-commandlinetools   # 或直接安裝 Android Studio 並用 SDK Manager 安裝上述套件
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME=~/Library/Android/sdk
```

---

## 2. 建置步驟

### 2.1 一鍵建置（建議）

```bash
cd mobile
npm install
JAVA_HOME=<jdk 路徑> ANDROID_HOME=<sdk 路徑> scripts/build-android.sh
```

腳本會依序：

1. 寫入 `android/local.properties`
2. `npm run sync:web`（把 `../web` 複製到 `www/`）→ `npx cap sync android`
3. `./gradlew bundleRelease assembleDebug --no-daemon`
4. 複製產物到 `dist/`，並用 `aapt2 dump badging` 與 `keytool -printcert` 印出驗證摘要

可選環境變數：`SKIP_SYNC=1`（略過 web 同步）、`ONLY=aab` 或 `ONLY=apk`。

### 2.2 手動步驟

```bash
cd mobile
npm run sync:web && npx cap sync android
cd android && ./gradlew bundleRelease assembleDebug --no-daemon
# 產物：
#   app/build/outputs/bundle/release/app-release.aab
#   app/build/outputs/apk/debug/app-debug.apk
```

### 2.3 驗證產物

```bash
BT=$ANDROID_HOME/build-tools/36.0.0
$BT/aapt2 dump badging dist/matsu-blue-tears-1.0.0-debug.apk | grep -E "^package|targetSdk|uses-permission|application-label:"
keytool -printcert -jarfile dist/matsu-blue-tears-1.0.0-release.aab | grep -E "Owner|Valid"
```

預期：`package: name='tw.com.meishi.matsubluetears' versionCode='1' versionName='1.0.0'`、`targetSdkVersion:'36'`、`application-label:'馬祖藍眼淚預報'`，權限為 INTERNET、ACCESS_COARSE/FINE_LOCATION、POST_NOTIFICATIONS、SCHEDULE_EXACT_ALARM、RECEIVE_BOOT_COMPLETED、WAKE_LOCK、ACCESS_NETWORK_STATE。AAB 簽章 Owner 應為 `CN=Meishi Tech, O=Meishi Tech, L=Lienchiang, C=TW`。

要安裝 debug APK 到裝置測試：`adb install -r dist/matsu-blue-tears-1.0.0-debug.apk`。

---

## 3. 簽名金鑰（keystore）保管 — 請務必閱讀

正式版 AAB 由 `keys/upload-keystore.jks`（alias `upload`，RSA 2048，效期 10000 天）簽名；密碼存在 `keys/keystore.properties`：

```properties
storePassword=<24 字元隨機密碼>
keyPassword=<同上>
keyAlias=upload
storeFile=upload-keystore.jks   # 相對於 keys/ 目錄
```

`android/app/build.gradle` 會在建置時讀取這個檔案；**檔案不存在時不會報錯，而是退回 debug 簽名**（方便 CI／新機器編譯），但這樣的 AAB 無法上傳 Play Console。

### 警告

- **`keys/` 整個目錄已列入 `.gitignore`，絕不可 commit。** 請把 `upload-keystore.jks` 與 `keystore.properties` 另外備份到密碼管理器／加密雲端硬碟（至少兩份）。
- **遺失 keystore 或密碼 = 無法再更新同一個 App。** Play 會拒絕以不同金鑰簽名的更新，只能改新的套件名稱重新上架，所有評分、下載數歸零。
- 強烈建議在 Play Console 第一次上傳時啟用 **Play App Signing**（預設即啟用）：Google 會保管「應用程式簽署金鑰」，我們手上的只是「上傳金鑰」。若上傳金鑰遺失，可向 Google 申請重設上傳金鑰，風險大幅降低。
- 不要把密碼貼進聊天工具、issue 或 CI log。CI 請用 secret 變數在建置時產生 `keys/keystore.properties`。

### 在新機器重建 keystore（僅限尚未上架、或刻意重新產生時）

```bash
mkdir -p keys
keytool -genkeypair -v -keystore keys/upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Meishi Tech, O=Meishi Tech, L=Lienchiang, C=TW"
# 接著手動建立 keys/keystore.properties（格式如上）
```

---

## 4. 在本機 Mac 重現

```bash
git clone <repo> && cd <repo>/mobile
npm install
# 把備份的 keys/upload-keystore.jks 與 keys/keystore.properties 放回 mobile/keys/
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME=~/Library/Android/sdk
scripts/build-android.sh
```

若想用 Android Studio：`npx cap open android`，選 **Build → Generate Signed App Bundle**，或直接在 Gradle 面板執行 `bundleRelease`（簽名設定已寫在 `build.gradle`，會自動讀 `keys/keystore.properties`）。

---

## 5. 如何升版

每次上傳 Play 的 AAB，`versionCode` 必須比上一次大（整數、單調遞增）；`versionName` 是顯示給使用者的字串。

修改 **`mobile/android/app/build.gradle`**：

```groovy
defaultConfig {
    applicationId "tw.com.meishi.matsubluetears"
    ...
    versionCode 2          // 每次上傳 +1
    versionName "1.0.1"    // 語意化版本
}
```

建議同步更新：

- `mobile/package.json` 的 `"version"`（文件一致性，不影響建置）
- iOS：`ios/App/App.xcodeproj/project.pbxproj` 的 `MARKETING_VERSION`（對應 versionName）與 `CURRENT_PROJECT_VERSION`（對應 versionCode）

`scripts/build-android.sh` 會從 `build.gradle` 讀 `versionName` 來命名 `dist/` 檔案，不需另外改腳本。

---

## 6. 常見問題

| 症狀 | 原因／解法 |
|---|---|
| `SDK location not found` | 沒有 `android/local.properties` 或 `ANDROID_HOME`；執行 `scripts/build-android.sh` 會自動寫入 |
| `Failed to download any source lists` / `PKIX path building failed` | Java 不信任網路代理憑證，見 1.1 節把 CA 匯入 `cacerts` |
| release AAB 的簽章 Owner 是 `CN=Android Debug` | 找不到 `keys/keystore.properties`，退回 debug 簽名；放回 keys 後重跑 |
| Play Console 拒絕上傳：versionCode 已使用 | 依第 5 節把 `versionCode` +1 |
| 背景執行 `gradlew` 被沙箱終止 | 在前景執行（不要加 `&`） |
| `www/` 內容過舊 | `www/` 是由 `../web` 複製而來，不要直接編輯；重跑 `npm run sync:web` |
