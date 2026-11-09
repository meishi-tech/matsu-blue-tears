// tests/model.test.js — 藍眼淚指數模型邊界測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seasonOf, seasonFactor, moonFactor, windFactor, skyFactor, seaTempFactor, tideFactor, tideState, levelOf, computeScore, WEIGHTS,
} from '../lib/model.js';

test('季節分類與分數', () => {
  assert.equal(seasonOf(11), 'off');
  assert.equal(seasonOf(3), 'early');
  assert.equal(seasonOf(6), 'peak');
  assert.equal(seasonOf(8), 'late');
  assert.equal(seasonFactor(5), 100);
  assert.equal(seasonFactor(4), 70);
  assert.equal(seasonFactor(8), 70);
  assert.equal(seasonFactor(3), 40);
  assert.equal(seasonFactor(9), 40);
  assert.equal(seasonFactor(12), 10);
});

test('月光因子：新月 100、滿月 0、窗口內月沒加成至 ≥85', () => {
  assert.equal(moonFactor(0, false), 100);
  assert.equal(moonFactor(1, false), 0);
  assert.equal(moonFactor(0.5, false), 50);
  assert.ok(moonFactor(0.9, true) >= 85);
});

test('風因子：南風 8–20 km/h 最佳、北風扣 20、強風最低', () => {
  assert.equal(windFactor('S', 12), 100);
  assert.equal(windFactor('SW', 5), 60);
  assert.equal(windFactor('SE', 25), 40);
  assert.equal(windFactor('S', 35), 10);
  assert.equal(windFactor('NE', 12), 60); // 80 − 20（北風系）
  assert.equal(windFactor('N', 35), 0); // 10 − 20 → 夾在 0
  assert.equal(windFactor(null, null), 50); // 無資料
});

test('天空因子：pop 0–10 為 100、70 為 10、含雨再扣 20', () => {
  assert.equal(skyFactor(0), 100);
  assert.equal(skyFactor(10), 100);
  assert.equal(skyFactor(70), 10);
  assert.equal(skyFactor(100), 10);
  assert.equal(skyFactor(40, '多雲短暫雨'), skyFactor(40) - 20);
  assert.equal(skyFactor(null), 50);
});

test('海溫因子', () => {
  assert.equal(seaTempFactor(23), 100);
  assert.equal(seaTempFactor(18), 60);
  assert.equal(seaTempFactor(27), 60);
  assert.equal(seaTempFactor(12), 25);
  assert.equal(seaTempFactor(null), 50);
});

test('潮汐因子與狀態', () => {
  const t = (iso, type) => ({ time: new Date(iso), type });
  const win = [new Date('2026-11-09T09:40:00Z'), new Date('2026-11-09T16:25:00Z')]; // 17:40–00:25 台灣
  // 滿潮 22:11（14:11Z）落在窗口 → 100
  assert.equal(tideFactor([t('2026-11-09T08:26:00Z', '乾潮'), t('2026-11-09T14:11:00Z', '滿潮')], ...win), 100);
  // 退潮中：滿潮在窗口前 4 小時以上、乾潮在窗口之後 → 50
  assert.equal(tideFactor([t('2026-11-09T05:00:00Z', '滿潮'), t('2026-11-09T17:00:00Z', '乾潮')], ...win), 50);
  assert.equal(tideFactor([], ...win), 50);
  assert.equal(tideState([t('2026-11-09T08:26:00Z', '乾潮'), t('2026-11-09T14:11:00Z', '滿潮')], new Date('2026-11-09T10:00:00Z')).zh, '漲潮中');
  assert.equal(tideState([t('2026-11-09T14:11:00Z', '滿潮')], new Date('2026-11-09T13:30:00Z')).zh, '接近滿潮');
});

test('等級邊界與加權總和', () => {
  assert.equal(levelOf(70), 'high');
  assert.equal(levelOf(69), 'medium');
  assert.equal(levelOf(40), 'medium');
  assert.equal(levelOf(39), 'low');
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  const best = computeScore({ month: 6, illumination: 0, moonDownInWindow: true, windDir: 'S', windKmh: 12, pop: 0, wxZh: '晴', seaTempC: 24, tides: [], winStart: null, winEnd: null });
  assert.equal(best.score, 95); // 潮汐無資料 50 × 0.1 → 95
  assert.equal(best.level, 'high');
  const worst = computeScore({ month: 12, illumination: 1, moonDownInWindow: false, windDir: 'N', windKmh: 40, pop: 100, wxZh: '陰有雨', seaTempC: 10, tides: [], winStart: null, winEnd: null });
  assert.ok(worst.score <= 10);
  assert.equal(worst.level, 'low');
});
