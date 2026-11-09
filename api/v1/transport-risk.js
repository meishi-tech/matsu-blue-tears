// GET /api/v1/transport-risk — 未來 7 日臺馬航線／南北竿航班風險、可達性指數、房價係數建議 + 今日實況
// 規格：design/contract-transport-risk-v1.md A 節（docs/API-CONTRACT.md 摘要）
// 查詢參數：?date=YYYY-MM-DD 覆寫「今天」（測試／回測用；預設台灣時間今日）
import { wrap } from '../../lib/handler.js';
import { envelope } from '../../lib/build.js';
import * as cwa from '../../lib/cwa.js';
import * as tdx from '../../lib/tdx.js';
import { buildTransportRisk, isDateStr } from '../../lib/transport-risk.js';
import { todayStr, toIso08 } from '../../lib/time.js';

const CWA_DATASETS = [
  { key: 'marine', id: cwa.DATASETS.marineForecast, fetch: () => cwa.fetchMarineForecast() },
  { key: 'j081', id: cwa.DATASETS.threeHourly, fetch: () => cwa.fetchThreeHourly('南竿鄉') },
  { key: 'j083', id: cwa.DATASETS.weekly, fetch: () => cwa.fetchWeeklyRaw('南竿鄉') },
  { key: 'alerts', id: cwa.DATASETS.warning, fetch: () => cwa.fetchWarningsRaw('連江縣') },
];

const isoOrNull = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : toIso08(d);
};

export default wrap(async (req) => {
  const now = new Date();
  const qs = new URL(req.url || '/', 'http://localhost').searchParams;
  const dateParam = qs.get('date');
  const today = isDateStr(dateParam) ? dateParam : todayStr(now);

  const settled = await Promise.allSettled([...CWA_DATASETS.map((d) => d.fetch()), tdx.loadAll()]);
  const cwaResults = settled.slice(0, CWA_DATASETS.length);
  const tdxResult = settled[CWA_DATASETS.length];

  // ---- CWA：四個資料集各自成功／失敗 ----
  const raw = {};
  const datasets = [];
  const errors = [];
  let cwaFetchedAt = null;
  CWA_DATASETS.forEach((d, i) => {
    const r = cwaResults[i];
    if (r.status === 'fulfilled' && r.value?.json) {
      raw[d.key] = r.value.json;
      datasets.push(d.id);
      if (!cwaFetchedAt || r.value.fetchedAt > cwaFetchedAt) cwaFetchedAt = r.value.fetchedAt;
    } else {
      raw[d.key] = null;
      const msg = r.status === 'rejected' ? (r.reason?.message || String(r.reason)) : 'CWA_API_KEY not configured';
      errors.push(`${d.id}: ${msg}`);
    }
  });
  const cwaStatus = !cwa.isConfigured()
    ? 'not_configured'
    : datasets.length === CWA_DATASETS.length ? 'live' : datasets.length ? 'partial' : 'unavailable';

  // ---- TDX：loadAll 本身已把個別失敗降級；整個 reject 時視為 unavailable ----
  const tdxData = tdxResult.status === 'fulfilled'
    ? tdxResult.value
    : { status: 'unavailable', fetchedAt: null, flights: null, ferries: null, errors: [tdxResult.reason?.message || String(tdxResult.reason)] };
  const tdxOk = tdxData.status === 'live' && !tdxData.errors?.length;

  const built = buildTransportRisk({ marine: raw.marine, j081: raw.j081, j083: raw.j083, alerts: raw.alerts, tdx: tdxData, today, now });

  return envelope({
    mode: cwaStatus === 'live' && tdxOk ? 'live' : 'degraded',
    sources: {
      cwa: {
        status: cwaStatus,
        fetchedAt: isoOrNull(cwaFetchedAt),
        datasets,
        issueTime: built.issueTime,
        ...(errors.length ? { errors } : {}),
      },
      tdx: {
        status: tdxData.status,
        fetchedAt: isoOrNull(tdxData.fetchedAt),
        ...(tdxData.errors?.length ? { errors: tdxData.errors } : {}),
      },
    },
    extra: {
      today: built.today,
      days: built.days,
      rules: built.rules,
    },
  });
});
