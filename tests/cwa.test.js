// tests/cwa.test.js — 以真實 CWA JSON fixture 測解析器
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWeekly, parseTide, parseMarine, parseWarnings, wxToEn, numOrNull, windDirToEn } from '../lib/cwa.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

test('F-D0047-083 一週預報：南竿鄉 7 天、欄位完整', () => {
  const days = parseWeekly(fx('cwa-F-D0047-083-nangan.json'), '南竿鄉');
  assert.ok(days.size >= 7, `days=${days.size}`);
  const d = days.get('2026-11-09');
  assert.ok(d);
  assert.equal(d.tempMinC, 13);
  assert.equal(d.tempMaxC, 21);
  assert.equal(d.windDir, 'NE');
  assert.equal(d.windKmh, 40); // ">= 11" m/s → 11 m/s ≈ 40 km/h
  assert.equal(d.wxZh, '晴時多雲');
  assert.equal(d.pop, 0);
  assert.equal(d.popEstimated, false);
  const later = days.get('2026-11-14');
  assert.equal(later.popEstimated, true); // 第 4 天起 CWA 無 12 小時降雨機率
  assert.equal(later.pop, 45); // 陰短暫陣雨
});

test('F-A0021-001 潮汐：南竿 2026-11-09 四個事件、高度為 AboveTWVD', () => {
  const days = parseTide(fx('cwa-F-A0021-001-nangan.json'));
  const d = days.get('2026-11-09');
  assert.equal(d.range, '大');
  assert.equal(d.events.length, 4);
  assert.equal(d.events[1].type, '滿潮');
  assert.equal(d.events[1].heightCm, 262);
  assert.equal(d.events[1].iso, '2026-11-09T10:17:00+08:00');
});

test('O-B0075-001 海象：C6W08 海溫 24.0', () => {
  const m = parseMarine(fx('cwa-O-B0075-001-C6W08.json'), 'C6W08');
  assert.equal(m.seaTempC, 24);
  assert.equal(m.stationId, 'C6W08');
  assert.equal(m.observedAt, '2026-11-09T08:00:00+08:00');
});

test('W-C0033-001 特報：連江縣陸上強風特報 → type wind', () => {
  const alerts = parseWarnings(fx('cwa-W-C0033-001-lienchiang.json'), '連江縣');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'wind');
  assert.equal(alerts[0].severity, 'advisory');
  assert.equal(alerts[0].validUntil, '2026-11-09T23:00:00+08:00');
});

test('輔助轉換', () => {
  assert.equal(numOrNull('>= 11'), 11);
  assert.equal(numOrNull('-'), null);
  assert.equal(numOrNull(''), null);
  assert.equal(wxToEn('陰時多雲短暫陣雨'), 'Overcast with brief showers');
  assert.equal(wxToEn('晴'), 'Sunny');
  assert.equal(windDirToEn('偏北風'), 'N');
  assert.equal(windDirToEn('西南風'), 'SW');
});
