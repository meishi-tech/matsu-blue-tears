// tests/build.test.js — 以 fixture 模擬 CWA live 資料，驗證 live／model 兩種模式的組裝結果
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWeekly, parseTide, parseMarine, parseWarnings } from '../lib/cwa.js';
import { buildDays, buildToday } from '../lib/build.js';
import { buildHotspots, HOTSPOTS } from '../lib/hotspots.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const now = new Date('2026-11-09T01:00:00Z'); // 2026-11-09 09:00 台灣

const liveCwa = {
  status: 'live',
  weekly: { days: parseWeekly(fx('cwa-F-D0047-083-nangan.json')) },
  tide: { days: parseTide(fx('cwa-F-A0021-001-nangan.json')) },
  marine: parseMarine(fx('cwa-O-B0075-001-C6W08.json')),
  warnings: { alerts: parseWarnings(fx('cwa-W-C0033-001-lienchiang.json')) },
};

test('live 模式：7 天、CWA 欄位、潮汐與海溫', () => {
  const days = buildDays(liveCwa, 'live', now);
  assert.equal(days.length, 7);
  assert.equal(days[0].date, '2026-11-09');
  assert.equal(days[0].weekdayZh, '今天');
  assert.equal(days[1].weekdayEn, 'Tomorrow');
  assert.equal(days[0].weatherSource, 'cwa');
  assert.equal(days[0].wxZh, '晴時多雲');
  assert.equal(days[0].tides.length, 4);
  assert.equal(days[0].tides[1].heightCm, 262);
  assert.equal(days[0].seaTempC, 24);
  assert.equal(days[0].factors.seaTemp, 100);
  assert.equal(days[0].factors.tide, 100); // 滿潮 22:11 在觀測窗口內
  for (const d of days) {
    assert.ok(d.score >= 0 && d.score <= 100);
    assert.ok(['high', 'medium', 'low'].includes(d.level));
    assert.ok(!('_astroRaw' in d));
  }
});

test('live 模式 today：下一個潮汐、海溫、特報', () => {
  const { today, hotspotInput, alerts } = buildToday(liveCwa, 'live', now);
  assert.equal(today.tide.nextType, '滿潮');
  assert.equal(today.tide.nextTime, '2026-11-09T10:17:00+08:00');
  assert.equal(today.tide.range, '大');
  assert.equal(today.seaTempC, 24);
  assert.equal(today.fogAlert, false);
  assert.equal(alerts.length, 1);
  assert.equal(today.season, 'off');
  assert.ok(!today.summaryZh.includes('氣候平均'));
  assert.ok(['漲潮中', '退潮中', '接近滿潮', '接近乾潮'].includes(hotspotInput.tideZh));
});

test('model 模式：無 CWA 時用氣候平均，潮汐／海溫為 null 且因子 50', () => {
  const modelCwa = { status: 'not_configured', weekly: null, tide: null, marine: null, warnings: null };
  const days = buildDays(modelCwa, 'model', now);
  assert.equal(days[0].weatherSource, 'climatology');
  assert.deepEqual(days[0].tides, []);
  assert.equal(days[0].seaTempC, null);
  assert.equal(days[0].factors.seaTemp, 50);
  assert.equal(days[0].factors.tide, 50);
  const { today, hotspotInput } = buildToday(modelCwa, 'model', now);
  assert.equal(today.tide, null);
  assert.ok(today.summaryZh.includes('推估'));
  assert.equal(hotspotInput.tideZh, '無潮汐資料');
});

test('熱點：10 個、分數夾在 0–100、含 tide 文字', () => {
  const { hotspotInput } = buildToday(liveCwa, 'live', now);
  const spots = buildHotspots(hotspotInput);
  assert.equal(spots.length, 10);
  assert.equal(HOTSPOTS.length, 10);
  for (const s of spots) {
    assert.ok(s.score >= 0 && s.score <= 100);
    assert.ok(s.lat > 25.9 && s.lat < 26.4 && s.lng > 119.9 && s.lng < 120.6);
    assert.ok(s.viewTime);
    assert.ok(s.tideZh && s.tideEn);
  }
  assert.equal(spots.find((s) => s.id === 'beihai').bookingUrl.startsWith('https://'), true);
});
