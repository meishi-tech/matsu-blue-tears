// 簡易品質檢查：node web/check.mjs
// 1) 各 JS 檔語法檢查  2) 所有 JSON fixture 可解析且符合合約主要欄位  3) HTML 基本檢查
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail++; console.log('  ✗', m); };

console.log('JS 語法');
for (const f of ['app.js', 'i18n.js', 'sw.js']) {
  try { execFileSync(process.execPath, ['--check', path.join(dir, f)], { stdio: 'pipe' }); ok(f); }
  catch (e) { bad(f + ': ' + e.stderr.toString().split('\n')[0]); }
}

console.log('Mock fixtures');
const need = { status: ['today'], forecast: ['days'], hotspots: ['hotspots'], transport: ['flights', 'ferries', 'interIsland', 'alerts'] };
for (const [name, keys] of Object.entries(need)) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'mock', name + '.json'), 'utf8'));
    const missing = ['ok', 'generatedAt', 'sources', 'mode', ...keys].filter((k) => !(k in j));
    missing.length ? bad(name + '.json 缺欄位: ' + missing.join(', ')) : ok(name + '.json');
  } catch (e) { bad(name + '.json: ' + e.message); }
}

console.log('HTML / 資源');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
/user-scalable\s*=\s*no/.test(html) ? bad('index.html 含 user-scalable=no') : ok('無 user-scalable=no');
/viewport-fit=cover/.test(html) ? ok('viewport-fit=cover') : bad('缺 viewport-fit=cover');
for (const f of ['vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'manifest.webmanifest', 'sw.js', 'privacy-policy.html', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png']) {
  fs.existsSync(path.join(dir, f)) ? ok(f) : bad('缺少 ' + f);
}
// i18n 鍵值一致
const i18nSrc = fs.readFileSync(path.join(dir, 'i18n.js'), 'utf8');
const sandbox = { window: {}, navigator: { language: 'zh' }, localStorage: { getItem: () => null, setItem() {} }, document: { documentElement: {}, querySelectorAll: () => [] } };
new Function('window', 'navigator', 'localStorage', 'document', i18nSrc)(sandbox.window, sandbox.navigator, sandbox.localStorage, sandbox.document);
const D = sandbox.window.I18N.DICT;
const zhKeys = Object.keys(D.zh), enKeys = Object.keys(D.en);
const diff = zhKeys.filter((k) => !enKeys.includes(k)).concat(enKeys.filter((k) => !zhKeys.includes(k)));
diff.length ? bad('i18n 鍵不一致: ' + diff.join(', ')) : ok('i18n zh/en 鍵一致 (' + zhKeys.length + ')');
for (const m of html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)) if (!(m[1] in D.zh)) bad('index.html 使用未定義 i18n 鍵: ' + m[1]);
const appSrc = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
for (const m of appSrc.matchAll(/\bt\('([a-zA-Z0-9_]+)'/g)) {
  const k = m[1];
  const isPrefix = /_$/.test(k) && zhKeys.some((z) => z.startsWith(k));
  if (!(k in D.zh) && !isPrefix) bad('app.js 使用未定義 i18n 鍵: ' + k);
}
ok('app.js i18n 鍵均有定義');

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
