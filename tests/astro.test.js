// tests/astro.test.js — 月相對照已知日期（timeanddate.com UTC 月相表）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMoonIllumination, describeMoon, nightAstro, getSunTimes, MATSU } from '../lib/astro.js';
import { taipeiDate } from '../lib/time.js';

test('2026-11-09 07:02 UTC 新月：照度 < 1%', () => {
  const m = getMoonIllumination(new Date('2026-11-09T07:02:00Z'));
  assert.ok(m.fraction < 0.01, `fraction=${m.fraction}`);
  assert.equal(describeMoon(new Date('2026-11-09T07:02:00Z')).nameZh, '新月');
});

test('2026-11-24 14:53 UTC 滿月：照度 > 99%', () => {
  const m = getMoonIllumination(new Date('2026-11-24T14:53:00Z'));
  assert.ok(m.fraction > 0.99, `fraction=${m.fraction}`);
  assert.equal(describeMoon(new Date('2026-11-24T14:53:00Z')).nameZh, '滿月');
});

test('2026-11-17 上弦、2026-12-01 下弦：照度約 50%', () => {
  const fq = getMoonIllumination(new Date('2026-11-17T11:47:00Z'));
  const tq = getMoonIllumination(new Date('2026-12-01T06:08:00Z'));
  assert.ok(Math.abs(fq.fraction - 0.5) < 0.03, `fq=${fq.fraction}`);
  assert.ok(Math.abs(tq.fraction - 0.5) < 0.03, `tq=${tq.fraction}`);
  assert.equal(describeMoon(new Date('2026-11-17T11:47:00Z')).nameZh, '上弦月');
  assert.equal(describeMoon(new Date('2026-12-01T06:08:00Z')).nameZh, '下弦月');
});

test('馬祖 2026-11-09 日落約 17:15 台灣時間', () => {
  const s = getSunTimes(taipeiDate('2026-11-09', 12), MATSU.lat, MATSU.lng);
  const hhmm = s.sunset.toLocaleTimeString('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' });
  assert.ok(['17:13', '17:14', '17:15', '17:16', '17:17'].includes(hhmm), hhmm);
});

test('nightAstro 結構與新月整晚皆暗', () => {
  const n = nightAstro('2026-11-09');
  assert.ok(n.sunset.endsWith('+08:00'));
  assert.equal(n.moon.nameZh, '新月');
  assert.equal(n.bestWindow.reasonZh, '月相接近新月，整晚皆暗');
  assert.match(n.viewTime, /^\d{2}:\d{2}-\d{2}:\d{2}$/);
  assert.ok(n.bestWindow.start < n.bestWindow.end);
});

test('滿月當晚 bestWindow 仍回傳有效區間', () => {
  const n = nightAstro('2026-11-24');
  assert.equal(n.moon.nameZh, '滿月');
  assert.ok(n.bestWindow.start && n.bestWindow.end);
  assert.ok(new Date(n.bestWindow.end) > new Date(n.bestWindow.start));
});
