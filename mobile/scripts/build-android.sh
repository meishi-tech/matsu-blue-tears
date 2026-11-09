#!/usr/bin/env bash
# 馬祖藍眼淚預報 — Android 建置腳本（可重複執行）
# 流程：同步 web/ → www/ → Capacitor sync → Gradle bundleRelease + assembleDebug → 複製到 dist/
#
# 用法：
#   scripts/build-android.sh            # 完整建置（AAB + debug APK）
#   SKIP_SYNC=1 scripts/build-android.sh # 跳過 web 同步，只跑 Gradle
#   ONLY=aab|apk scripts/build-android.sh # 只產出其中一種
#
# 可用環境變數（未設定時使用下列預設，對應 Linux 沙箱；Mac 請改成自己的路徑）：
#   JAVA_HOME     預設 /home/user/jdk21
#   ANDROID_HOME  預設 /home/user/android-sdk
#   NODE_BIN      預設 /home/user/node22/bin（存在時才會加進 PATH）
set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$MOBILE_DIR"

export JAVA_HOME="${JAVA_HOME:-/home/user/jdk21}"
export ANDROID_HOME="${ANDROID_HOME:-/home/user/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
NODE_BIN="${NODE_BIN:-/home/user/node22/bin}"
[ -d "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "找不到 JDK：$JAVA_HOME（請設定 JAVA_HOME）" >&2; exit 1
fi
if [ ! -d "$ANDROID_HOME/platforms" ]; then
  echo "找不到 Android SDK：$ANDROID_HOME（請設定 ANDROID_HOME）" >&2; exit 1
fi

# 讓 Gradle 找得到 SDK（local.properties 不進版控）
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

# 讀取版本號（來自 android/app/build.gradle）
VERSION_NAME="$(sed -nE 's/^[[:space:]]*versionName[[:space:]]+"([^"]+)".*/\1/p' android/app/build.gradle | head -1)"
VERSION_CODE="$(sed -nE 's/^[[:space:]]*versionCode[[:space:]]+([0-9]+).*/\1/p' android/app/build.gradle | head -1)"
APP_SLUG="matsu-blue-tears"
echo "==> 版本 ${VERSION_NAME} (versionCode ${VERSION_CODE})"

if [ ! -f keys/keystore.properties ]; then
  echo "!! 警告：找不到 keys/keystore.properties，release AAB 會使用 debug 簽名，無法上傳 Play Console。" >&2
fi

if [ "${SKIP_SYNC:-0}" != "1" ]; then
  echo "==> 同步 web/ → www/ 並執行 cap sync android"
  npm run sync:web
  npx cap sync android
fi

ONLY="${ONLY:-}"
TASKS=()
case "$ONLY" in
  aab) TASKS=(bundleRelease) ;;
  apk) TASKS=(assembleDebug) ;;
  "")  TASKS=(bundleRelease assembleDebug) ;;
  *) echo "ONLY 只接受 aab 或 apk" >&2; exit 1 ;;
esac

echo "==> Gradle ${TASKS[*]}"
( cd android && ./gradlew "${TASKS[@]}" --no-daemon )

mkdir -p dist
AAB_SRC=android/app/build/outputs/bundle/release/app-release.aab
APK_SRC=android/app/build/outputs/apk/debug/app-debug.apk
if [ -f "$AAB_SRC" ] && [ "$ONLY" != "apk" ]; then
  cp "$AAB_SRC" "dist/${APP_SLUG}-${VERSION_NAME}-release.aab"
fi
if [ -f "$APK_SRC" ] && [ "$ONLY" != "aab" ]; then
  cp "$APK_SRC" "dist/${APP_SLUG}-${VERSION_NAME}-debug.apk"
fi

echo "==> 產物："
ls -la dist/

# 驗證摘要（build-tools 內的 aapt2 / JDK keytool）
BT_DIR="$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)"
if [ -n "$BT_DIR" ] && [ -f "dist/${APP_SLUG}-${VERSION_NAME}-debug.apk" ]; then
  echo "==> APK badging："
  "$BT_DIR/aapt2" dump badging "dist/${APP_SLUG}-${VERSION_NAME}-debug.apk" \
    | grep -E "^package|^targetSdkVersion|^uses-permission|^application-label:|^launchable" || true
fi
if [ -f "dist/${APP_SLUG}-${VERSION_NAME}-release.aab" ]; then
  echo "==> AAB 簽章："
  keytool -printcert -jarfile "dist/${APP_SLUG}-${VERSION_NAME}-release.aab" 2>/dev/null | grep -E "Owner|Valid" || echo "（未簽名或無法讀取）"
fi
echo "完成。"
