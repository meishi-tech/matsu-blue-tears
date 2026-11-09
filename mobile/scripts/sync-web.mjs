// 把 ../web 複製到 ./www（Capacitor webDir）。保持 web/ 為唯一的前端原始碼來源。
import { rmSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../web');
const dst = resolve(here, '../www');
if (!existsSync(src)) { console.error('找不到 web/ 目錄：' + src); process.exit(1); }
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true, filter: (p) => !/(^|\/)(mock|check\.mjs|\.DS_Store)$/.test(p) || p === src });
console.log('已同步 web/ → mobile/www');
