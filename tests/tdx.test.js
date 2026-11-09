// tests/tdx.test.js — TDX FIDS／船班看板解析（fixture 依 TDX OAS 結構手工建立）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFids, parseShipLiveBoard, normalizeStatus } from '../lib/tdx.js';
import { staticFlights, staticFerries } from '../lib/schedules.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

test('FIDS 出發：略過貨機、狀態對照、航班號組合', () => {
  const flights = parseFids(fx('tdx-fids-departure-LZN.json'), 'departure');
  assert.equal(flights.length, 4);
  assert.deepEqual(flights.map((f) => f.status), ['departed', 'delayed', 'cancelled', 'on_time']);
  assert.equal(flights[0].flightNo, 'B78752');
  assert.equal(flights[0].airline, '立榮航空');
  assert.equal(flights[0].fromZh, '南竿');
  assert.equal(flights[1].estimated, '2026-11-09T11:40:00+08:00');
  assert.equal(flights[2].airlineEn, 'Mandarin Airlines');
});

test('ShipLiveBoard：出發看板轉 ferries、依時間排序', () => {
  const ferries = parseShipLiveBoard(fx('tdx-ship-liveboard-lienchiang.json'));
  assert.equal(ferries.length, 3);
  assert.equal(ferries[0].routeZh, '南竿福澳港 → 北竿白沙港（吉順號）');
  assert.equal(ferries[0].status, 'departed');
  assert.equal(ferries[1].status, 'on_time');
  assert.equal(ferries[2].status, 'cancelled');
  assert.equal(ferries[2].cancelReason, '風浪過大');
});

test('狀態正規化', () => {
  assert.equal(normalizeStatus('延誤', ''), 'delayed');
  assert.equal(normalizeStatus('', 'Cancelled'), 'cancelled');
  assert.equal(normalizeStatus('已到', ''), 'arrived');
  assert.equal(normalizeStatus('', ''), 'unknown');
});

test('靜態班表：週一有高雄班、週二無高雄班；週二基隆船航修', () => {
  const mon = staticFlights('2026-11-09'); // 週一
  const tue = staticFlights('2026-11-10');
  assert.ok(mon.some((f) => f.flightNo === 'AE7925'));
  assert.ok(!tue.some((f) => f.flightNo === 'AE7925'));
  assert.equal(mon.length, 18);
  assert.ok(mon.every((f) => f.status === 'unknown' && f.scheduled.endsWith('+08:00')));
  const tueFerries = staticFerries('2026-11-10');
  const keelung = tueFerries.find((f) => f.routeZh.startsWith('基隆'));
  assert.equal(keelung.status, 'cancelled');
  const monFerries = staticFerries('2026-11-09'); // 單日 → 先東後馬
  assert.ok(monFerries.some((f) => f.routeZh.startsWith('東引 → 南竿')));
});
