// 把 InfoPlist.strings（en / zh-Hant）與 PrivacyInfo.xcprivacy 加進 Xcode 專案。
// 可重複執行：已存在的項目會略過。
// 用法：node scripts/patch-ios-pbxproj.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const pbxPath = resolve(here, '../ios/App/App.xcodeproj/project.pbxproj');
const appDir = resolve(here, '../ios/App/App');
let src = readFileSync(pbxPath, 'utf8');
const original = src;

const APP_GROUP_ID = '504EC3061FED79650016851F'; // App 群組
const RESOURCES_PHASE_ID = '504EC3021FED79650016851F'; // App target 的 Resources build phase

const newId = () => {
  let id;
  do { id = randomBytes(12).toString('hex').toUpperCase(); } while (src.includes(id));
  return id;
};
const insertBefore = (marker, line) => {
  if (!src.includes(marker)) throw new Error(`找不到區段標記：${marker}`);
  src = src.replace(marker, `${line}\n${marker}`);
};
const addToList = (ownerId, listKey, line) => {
  // 在 ownerId 物件的 listKey = ( ... ); 末尾加入一行
  const re = new RegExp(`(${ownerId} /\\*[^*]*\\*/ = \\{[\\s\\S]*?${listKey} = \\()([\\s\\S]*?)(\\n\\t\\t\\t\\);)`);
  const m = src.match(re);
  if (!m) throw new Error(`找不到 ${ownerId} 的 ${listKey}`);
  src = src.replace(re, (_, a, b, c) => `${a}${b}\n\t\t\t\t${line}${c}`);
};

const changes = [];

// ---------- 1. InfoPlist.strings（PBXVariantGroup） ----------
for (const lproj of ['en.lproj', 'zh-Hant.lproj']) {
  if (!existsSync(resolve(appDir, lproj, 'InfoPlist.strings'))) throw new Error(`缺少 ${lproj}/InfoPlist.strings`);
}
if (!/InfoPlist\.strings \*\/ = \{\s*isa = PBXVariantGroup/.test(src)) {
  const enRef = newId(), zhRef = newId(), groupId = newId(), buildId = newId();
  insertBefore('/* End PBXFileReference section */',
    `\t\t${enRef} /* en */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = en; path = en.lproj/InfoPlist.strings; sourceTree = "<group>"; };\n` +
    `\t\t${zhRef} /* zh-Hant */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = "zh-Hant"; path = "zh-Hant.lproj/InfoPlist.strings"; sourceTree = "<group>"; };`);
  insertBefore('/* End PBXVariantGroup section */',
    `\t\t${groupId} /* InfoPlist.strings */ = {\n\t\t\tisa = PBXVariantGroup;\n\t\t\tchildren = (\n\t\t\t\t${enRef} /* en */,\n\t\t\t\t${zhRef} /* zh-Hant */,\n\t\t\t);\n\t\t\tname = InfoPlist.strings;\n\t\t\tsourceTree = "<group>";\n\t\t};`);
  insertBefore('/* End PBXBuildFile section */',
    `\t\t${buildId} /* InfoPlist.strings in Resources */ = {isa = PBXBuildFile; fileRef = ${groupId} /* InfoPlist.strings */; };`);
  addToList(APP_GROUP_ID, 'children', `${groupId} /* InfoPlist.strings */,`);
  addToList(RESOURCES_PHASE_ID, 'files', `${buildId} /* InfoPlist.strings in Resources */,`);
  changes.push('InfoPlist.strings variant group');
}

// ---------- 2. PrivacyInfo.xcprivacy ----------
if (!existsSync(resolve(appDir, 'PrivacyInfo.xcprivacy'))) throw new Error('缺少 App/PrivacyInfo.xcprivacy');
if (!src.includes('PrivacyInfo.xcprivacy')) {
  const ref = newId(), buildId = newId();
  insertBefore('/* End PBXFileReference section */',
    `\t\t${ref} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };`);
  insertBefore('/* End PBXBuildFile section */',
    `\t\t${buildId} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${ref} /* PrivacyInfo.xcprivacy */; };`);
  addToList(APP_GROUP_ID, 'children', `${ref} /* PrivacyInfo.xcprivacy */,`);
  addToList(RESOURCES_PHASE_ID, 'files', `${buildId} /* PrivacyInfo.xcprivacy in Resources */,`);
  changes.push('PrivacyInfo.xcprivacy');
}

// ---------- 3. knownRegions 加入 zh-Hant ----------
{
  const re = /knownRegions = \(([\s\S]*?)\);/;
  const m = src.match(re);
  if (!m) throw new Error('找不到 knownRegions');
  if (!/"zh-Hant"/.test(m[1])) {
    src = src.replace(re, (_, body) => `knownRegions = (${body.replace(/\n\t\t\t$/, '')}\n\t\t\t\t"zh-Hant",\n\t\t\t);`);
    changes.push('knownRegions zh-Hant');
  }
}

// ---------- 4. 基本健全性檢查 ----------
const balance = (open, close) => {
  // 忽略註解 /* ... */ 與字串 "..."
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"/g, '""');
  let n = 0;
  for (const ch of stripped) { if (ch === open) n++; else if (ch === close) n--; if (n < 0) return false; }
  return n === 0;
};
if (!balance('{', '}') || !balance('(', ')')) throw new Error('括號不平衡，已中止（未寫入）');
const ids = [...src.matchAll(/^\t\t([0-9A-F]{24}) \//gm)].map((m) => m[1]);
if (new Set(ids).size !== ids.length) throw new Error('物件 ID 重複，已中止（未寫入）');

if (src !== original) {
  writeFileSync(pbxPath, src);
  console.log('已更新 project.pbxproj：' + changes.join('、'));
} else {
  console.log('project.pbxproj 無需變更（已包含所有項目）');
}
