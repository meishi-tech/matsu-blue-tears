// tests/transport-risk.test.js — 交通可達性風險引擎（fixture 為 2026-11-09 16:30 真實預報，today=2026-11-09）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseBeaufort, parseWave, marineByDate, marineIssueTime, threeHourly, weekly, activeAlerts,
  ferryRisk, flightRisk, accessibility, pricingAdvice, buildTransportRisk, isDateStr, RULES,
} from '../lib/transport-risk.js';
import handler from '../api/v1/transport-risk.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const TODAY = '2026-11-09';

function build(overrides = {}) {
  const transport = fx('api-v1-transport-2026-11-09.json');
  return buildTransportRisk({
    marine: fx('cwa-F-A0012-001.json'),
    j081: fx('cwa-F-D0047-081-nangan.json'),
    j083: fx('cwa-F-D0047-083-nangan-1630.json'),
    alerts: fx('cwa-W-C0033-001-lienchiang-1628.json'),
    tdx: { status: 'live', flights: { flights: transport.flights }, ferries: { ferries: transport.ferries } },
    today: TODAY,
    now: new Date('2026-11-09T20:30:00+08:00'),
    ...overrides,
  });
}
const byDate = (out) => Object.fromEntries(out.days.map((d) => [d.date, d]));

test('parseBeaufort / parseWave', () => {
  assert.deepEqual(parseBeaufort('7至8陣風10級上午轉6至7陣風9級'), { sustainedMax: 8, gustMax: 10 });
  assert.deepEqual(parseBeaufort('4至5陣風7級'), { sustainedMax: 5, gustMax: 7 });
  assert.deepEqual(parseBeaufort(null), { sustainedMax: null, gustMax: null });
  assert.deepEqual(parseWave('5轉4再轉3公尺'), { waveMax: 5, waveMin: 3 });
  assert.deepEqual(parseWave('6轉5公尺'), { waveMax: 6, waveMin: 5 });
  assert.deepEqual(parseWave('1至2公尺'), { waveMax: 2, waveMin: 1 });
  assert.deepEqual(parseWave(''), { waveMax: null, waveMin: null });
});

test('F-A0012-001：臺灣北部海面／馬祖海面 5 天、IssueTime', () => {
  const marine = fx('cwa-F-A0012-001.json');
  const north = marineByDate(marine, '臺灣北部海面');
  const matsu = marineByDate(marine, '馬祖海面');
  assert.equal(Object.keys(north).length, 5);
  assert.equal(Object.keys(matsu).length, 5);
  assert.equal(north['2026-11-10'].raw.wind, '7至8陣風10級上午轉6至7陣風9級');
  assert.equal(north['2026-11-10'].raw.wave, '6轉5公尺');
  assert.equal(north['2026-11-10'].gustMax, 10);
  assert.equal(north['2026-11-10'].waveMax, 6);
  assert.equal(matsu['2026-11-09'].waveMax, 4);
  assert.equal(marineIssueTime(marine), '2026-11-09T16:30:00+08:00');
});

test('F-D0047-081 逐 3 小時、F-D0047-083 一週、W-C0033-001 特報', () => {
  const slots = threeHourly(fx('cwa-F-D0047-081-nangan.json'));
  assert.equal(slots.length, 56);
  assert.equal(slots[0].time, '2026-11-09T18:00:00+08:00');
  assert.equal(slots[0].bf, 6); // ">= 6"
  assert.equal(slots[0].wdir, '東北風');
  const week = weekly(fx('cwa-F-D0047-083-nangan-1630.json'));
  assert.equal(week['2026-11-10'].bf, 6);
  assert.equal(week['2026-11-10'].tmin, 15);
  assert.equal(week['2026-11-10'].tmax, 19);
  assert.equal(week['2026-11-10'].pop, 20);
  assert.equal(week['2026-11-15'].bf, 4);
  const alerts = activeAlerts(fx('cwa-W-C0033-001-lienchiang-1628.json'));
  assert.deepEqual(alerts, [{ phenomena: '陸上強風', start: '2026-11-09T16:28:00', end: '2026-11-10T23:00:00' }]);
});

test('ferryRisk 門檻：陣風 10／浪 4 → 95；持續 7／陣風 9／浪 3 → 65；6 級／浪 2.5 → 40；浪 2 → 25；其餘 5；無海面以陸上推估', () => {
  const area = (wind, wave) => ({ ...parseBeaufort(wind), ...parseWave(wave), raw: { wind, wave } });
  assert.equal(ferryRisk({ north: area('5至6陣風8級', '4公尺'), dow: 1 }).score, 95);
  assert.equal(ferryRisk({ north: area('6至7陣風9級', '2至3公尺'), dow: 1 }).score, 65);
  assert.equal(ferryRisk({ north: area('5至6陣風8級', '2.5至3公尺'), dow: 1 }).score, 65); // 浪高 3 → 65
  assert.equal(ferryRisk({ north: area('5至6陣風8級', '2公尺'), dow: 1 }).score, 40);
  assert.equal(ferryRisk({ north: area('4至5陣風7級', '1至2公尺'), dow: 1 }).score, 25);
  assert.equal(ferryRisk({ north: area('3至4級', '1公尺'), dow: 1 }).score, 5);
  const r = ferryRisk({ landBf: 7, dow: 2 });
  assert.equal(r.score, 65);
  assert.equal(r.maintenance, true);
  assert.deepEqual(ferryRisk({ dow: 3 }), { score: null, level: null, reasons: ['無資料'], maintenance: false });
});

test('flightRisk：濃霧特報至少 70、颱風 100、一週路徑；accessibility 下限 55', () => {
  const week = { rhDay: 80, rhNight: 82, bf: 7, wxAny: '多雲' };
  const base = flightRisk({ date: '2026-11-12', slots: null, week, alerts: [] });
  assert.equal(base.parts.wind, 35);
  const fog = flightRisk({ date: '2026-04-12', slots: null, week, alerts: [{ phenomena: '濃霧', start: '2026-04-12T05:00:00', end: '2026-04-12T10:00:00' }] });
  assert.equal(fog.parts.fog, 70);
  assert.equal(fog.level, 'red'); // 70 + 0.25*35 ≈ 79
  const ty = flightRisk({ date: '2026-08-12', slots: null, week, alerts: [{ phenomena: '海上陸上颱風', start: '2026-08-11T00:00:00', end: '2026-08-13T00:00:00' }] });
  assert.equal(ty.score, 100);
  assert.equal(accessibility({ score: 0, level: 'green' }, { score: 95, level: 'red' }), 72);
  assert.equal(accessibility({ score: 90, level: 'red' }, { score: 5, level: 'green' }), 55);
  assert.equal(accessibility({ score: null, level: null }, { score: null, level: null }), null);
});

test('pricingAdvice：抵達困難給 strandedRateHint 85–90；其他為 null；假日 dowFactor 1.1', () => {
  const hard = pricingAdvice({ offset: 1, idx: 30, prevIdx: 60, wxGood: true, dow: 3, isHighSeason: false });
  assert.deepEqual(hard.tags, ['抵達困難']);
  assert.deepEqual(hard.strandedRateHint, { minPct: 85, maxPct: 90 });
  assert.equal(hard.transportFactor, 1.0);
  const rebound = pricingAdvice({ offset: 2, idx: 70, prevIdx: 30, wxGood: true, dow: 5, isHighSeason: false });
  assert.deepEqual(rebound.tags, ['回補日']);
  assert.equal(rebound.transportFactor, 1.08);
  assert.equal(rebound.dowFactor, 1.1);
  assert.equal(rebound.strandedRateHint, null);
  const good = pricingAdvice({ offset: 3, idx: 80, prevIdx: 80, wxGood: true, dow: 6, isHighSeason: false });
  assert.equal(good.transportFactor, 1.05);
  const watch = pricingAdvice({ offset: 5, idx: 45, prevIdx: 45, wxGood: true, dow: 1, isHighSeason: false });
  assert.deepEqual(watch.tags, ['觀察區']);
  assert.equal(watch.actions.length, 1);
});

test('buildTransportRisk（today=2026-11-09）：契約列出的預期值', () => {
  const out = build();
  assert.equal(out.days.length, 7);
  assert.deepEqual(out.days.map((d) => d.offset), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(out.days.map((d) => d.zone), ['action', 'action', 'action', 'action', 'watch', 'watch', 'watch']);
  const d = byDate(out);

  // 船
  assert.equal(d['2026-11-10'].ferry.level, 'red');
  assert.equal(d['2026-11-10'].ferry.score, 95);
  assert.equal(d['2026-11-10'].ferry.levelZh, '停航機率高');
  assert.equal(d['2026-11-10'].ferry.maintenance, true); // 週二航修旗標，不計分
  assert.equal(d['2026-11-10'].dowZh, '二');
  assert.deepEqual(d['2026-11-10'].ferry.raw, { wind: '7至8陣風10級上午轉6至7陣風9級', wave: '6轉5公尺' });
  assert.match(d['2026-11-10'].ferry.reasons[0], /^臺灣北部海面：7至8陣風10級上午轉6至7陣風9級，浪高6轉5公尺$/);
  assert.equal(d['2026-11-11'].ferry.level, 'red');
  assert.equal(d['2026-11-11'].ferry.score, 95);
  assert.equal(d['2026-11-12'].ferry.level, 'orange');
  assert.equal(d['2026-11-12'].ferry.score, 65);
  assert.equal(d['2026-11-13'].ferry.level, 'orange');
  assert.equal(d['2026-11-13'].ferry.score, 65);
  assert.equal(d['2026-11-14'].ferry.level, 'yellow');
  assert.equal(d['2026-11-14'].ferry.score, 25);
  assert.equal(d['2026-11-15'].ferry.level, 'green');
  assert.equal(d['2026-11-15'].confidence, 'low');
  assert.equal(d['2026-11-15'].confidenceZh, '低');
  assert.equal(d['2026-11-15'].ferry.raw, null);
  assert.match(d['2026-11-15'].ferry.reasons[0], /無海面預報，以南竿陸上風力 4 級推估/);

  // 機
  assert.equal(d['2026-11-09'].flight.level, 'yellow');
  assert.equal(d['2026-11-09'].flight.score, 25);
  assert.equal(d['2026-11-09'].flight.levelZh, '注意');
  assert.deepEqual(d['2026-11-09'].flight.parts, { fog: 0, wind: 25, other: 0 });
  assert.ok(d['2026-11-09'].flight.reasons.some((r) => /陸上強風特報（至 11-10 23:00）/.test(r)), JSON.stringify(d['2026-11-09'].flight.reasons));
  assert.equal(d['2026-11-10'].flight.score, 25);
  assert.equal(d['2026-11-12'].flight.level, 'green');

  // 可達性／信心／房價
  assert.equal(d['2026-11-09'].accessibility, 54);
  assert.equal(d['2026-11-10'].accessibility, 54);
  assert.equal(d['2026-11-10'].confidence, 'high');
  assert.deepEqual(d['2026-11-10'].pricing.tags, ['交通存疑']);
  assert.equal(d['2026-11-10'].pricing.transportFactor, 1.0);
  assert.equal(d['2026-11-10'].pricing.dowFactor, 1.0);
  assert.equal(d['2026-11-10'].pricing.strandedRateHint, null);
  assert.equal(d['2026-11-12'].accessibility, 78);
  assert.equal(d['2026-11-12'].confidence, 'medium');
  assert.deepEqual(d['2026-11-13'].pricing.tags, ['觀察區']);
  assert.equal(d['2026-11-13'].pricing.dowFactor, 1.1);
  assert.equal(d['2026-11-15'].accessibility, 91);

  // 天氣欄位
  assert.equal(d['2026-11-10'].wx, '陰時多雲');
  assert.equal(d['2026-11-10'].tmin, 15);
  assert.equal(d['2026-11-10'].tmax, 19);
  assert.equal(d['2026-11-10'].pop, 20);

  // 規則與 issueTime
  assert.equal(out.issueTime, '2026-11-09T16:30:00+08:00');
  assert.deepEqual(out.rules, RULES);
  assert.deepEqual(RULES.clamp, [0.85, 1.3]);
});

test('today：TDX 實況合併（航班統計、臺馬航線、特報）', () => {
  const { today } = build();
  assert.equal(today.date, TODAY);
  assert.equal(today.flights.total, 18);
  assert.equal(today.flights.cancelled, 0);
  assert.equal(today.flights.delayed, 0);
  assert.equal(today.flights.arrivedOrDeparted, 17);
  assert.equal(today.flights.remaining, 1);
  assert.equal(today.flights.lastFlight.flightNo, 'B78776');
  assert.equal(today.flights.lastFlight.scheduled, '2026-11-09T17:30:00+08:00');
  assert.equal(today.ferries.taima.length, 3);
  assert.ok(today.ferries.taima.every((f) => /基隆/.test(f.routeZh)));
  assert.equal(today.ferries.taima[2].status, 'cancelled');
  assert.equal(today.ferries.taima[2].cancelReason, '海象不佳');
  assert.equal(today.ferries.tonightDeparture.status, 'unknown'); // 看板無今晚基隆出發班次
  assert.deepEqual(today.alerts, [{ type: 'wind', titleZh: '連江縣陸上強風特報', validUntil: '2026-11-10T23:00:00+08:00' }]);
});

test('today：11:00 前看板無今晚班次 → pending；看板有取消班次 → cancelled', () => {
  const early = build({ now: new Date('2026-11-09T08:00:00+08:00') });
  assert.equal(early.today.ferries.tonightDeparture.status, 'pending');
  const transport = fx('api-v1-transport-2026-11-09.json');
  const ferries = [...transport.ferries, {
    routeZh: '基隆港 → 南竿福澳港（新臺馬）', scheduled: '2026-11-09T22:30:00+08:00', status: 'cancelled', statusZh: '取消', cancelReason: '海象不佳',
  }];
  const withTonight = build({ tdx: { status: 'live', flights: { flights: transport.flights }, ferries: { ferries } } });
  assert.equal(withTonight.today.ferries.tonightDeparture.status, 'cancelled');
  assert.match(withTonight.today.ferries.tonightDeparture.note, /海象不佳/);
});

test('降級：缺海面預報仍回 7 天（以陸上風級推估）；TDX 缺 → today.flights/ferries null', () => {
  const out = build({ marine: null, tdx: null });
  assert.equal(out.days.length, 7);
  assert.equal(out.issueTime, null);
  const d = byDate(out);
  assert.equal(d['2026-11-10'].ferry.score, 40); // 陸上 6 級
  assert.equal(d['2026-11-10'].ferry.raw, null);
  assert.equal(d['2026-11-10'].confidence, 'high'); // 有逐 3 小時
  assert.equal(d['2026-11-13'].confidence, 'low');
  assert.equal(out.today.flights, null);
  assert.equal(out.today.ferries, null);
  const none = build({ marine: null, j081: null, j083: null, alerts: null, tdx: null });
  assert.equal(none.days[0].ferry.score, null);
  assert.equal(none.days[0].flight.score, null);
  assert.equal(none.days[0].accessibility, null);
  assert.deepEqual(none.today.alerts, []);
});

test('isDateStr', () => {
  assert.equal(isDateStr('2026-11-09'), true);
  assert.equal(isDateStr('2026-13-40'), true); // 格式正確即可（Date 會自動進位），不擋
  assert.equal(isDateStr('20261109'), false);
  assert.equal(isDateStr(null), false);
});

test('handler：無 CWA／TDX 金鑰時回 200、mode degraded、7 天結構完整、?date 覆寫', async () => {
  const saved = { CWA_API_KEY: process.env.CWA_API_KEY, TDX_CLIENT_ID: process.env.TDX_CLIENT_ID, TDX_CLIENT_SECRET: process.env.TDX_CLIENT_SECRET };
  delete process.env.CWA_API_KEY;
  delete process.env.TDX_CLIENT_ID;
  delete process.env.TDX_CLIENT_SECRET;
  try {
    const res = mockRes();
    await handler({ method: 'GET', url: '/api/v1/transport-risk?date=2026-11-09' }, res);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'degraded');
    assert.equal(body.sources.cwa.status, 'not_configured');
    assert.deepEqual(body.sources.cwa.datasets, []);
    assert.equal(body.sources.cwa.errors.length, 4);
    assert.equal(body.sources.tdx.status, 'not_configured');
    assert.equal(body.today.date, '2026-11-09');
    assert.equal(body.today.flights, null);
    assert.equal(body.days.length, 7);
    assert.equal(body.days[1].date, '2026-11-10');
    assert.equal(body.days[0].ferry.score, null);
    assert.equal(body.rules.version, '2026.11-v1');
    assert.match(res.headers['Cache-Control'], /s-maxage=/);
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
});

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(s) { this.body = s || ''; },
  };
}
