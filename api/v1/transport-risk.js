// GET /api/v1/transport-risk — 未來 7 日臺馬航線／南北竿航班風險、可達性指數、房價係數建議 + 今日實況
// 規格：design/contract-transport-risk-v1.md A 節（docs/API-CONTRACT.md 摘要）
// 查詢參數：?date=YYYY-MM-DD 覆寫「今天」（測試／回測用；預設台灣時間今日）
//
// 今日實況（TDX）不直接打 TDX：本專案的 TDX 金鑰配額為每分鐘 5 次，而一次 tdx.loadAll() 就是 5 次
// （LZN/MFK 出發＋到達 FIDS 4 次 + 船班看板 1 次），/transport 與本端點同時冷啟動必定互相 429。
// 因此改讀同一主機上、已由 Vercel Edge 快取 10 分鐘的 /api/v1/transport，讓兩個端點共用同一份 TDX 結果；
// 沒有 host（單元測試、直接 import）時才退回 tdx.loadAll()。
import { wrap } from '../../lib/handler.js';
import { envelope } from '../../lib/build.js';
import * as cwa from '../../lib/cwa.js';
import * as tdx from '../../lib/tdx.js';
import { fetchJson } from '../../lib/http.js';
import { cacheGet, cacheSet, DEFAULT_TTL_SEC } from '../../lib/cache.js';
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

/** 由請求推出本站 base URL（SELF_BASE_URL 可覆寫）；無 host 回 null */
export function selfBaseUrl(req) {
  if (process.env.SELF_BASE_URL) return process.env.SELF_BASE_URL.replace(/\/$/, '');
  const host = req?.headers?.host;
  if (!host) return null;
  const proto = req.headers['x-forwarded-proto'] || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * 取今日實況：優先讀本站 /api/v1/transport（Edge 快取），轉成 tdx.loadAll() 相容結構；
 * TDX 退回靜態班表（scheduleSource != 'tdx'）時該類別視為無資料（null），避免把 unknown 狀態算成統計。
 */
export async function loadTodayTransport(req, { fetchJsonImpl = fetchJson, loadAllImpl = tdx.loadAll } = {}) {
  const base = selfBaseUrl(req);
  if (!base) return loadAllImpl();
  const key = `self:transport:${base}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const json = await fetchJsonImpl(`${base}/api/v1/transport`, { timeoutMs: 9000 });
  if (!json?.ok) throw new Error('/api/v1/transport returned ok=false');
  const t = json.sources?.tdx || {};
  const flightsLive = json.scheduleSource?.flights === 'tdx' && Array.isArray(json.flights);
  const ferriesLive = json.scheduleSource?.ferries === 'tdx' && Array.isArray(json.ferries);
  const out = {
    status: t.status || (flightsLive || ferriesLive ? 'live' : 'unavailable'),
    fetchedAt: t.fetchedAt || json.generatedAt || null,
    flights: flightsLive ? { flights: json.flights } : null,
    ferries: ferriesLive ? { ferries: json.ferries } : null,
    errors: t.errors || [],
    via: '/api/v1/transport',
  };
  // 完整結果快取 10 分鐘；/transport 本身被 TDX 429 打成部分結果時只留 60 秒，讓下次請求儘早拿到完整版
  const complete = flightsLive && ferriesLive && !out.errors.length;
  return cacheSet(key, out, complete ? DEFAULT_TTL_SEC : 60);
}

export default wrap(async (req) => {
  const now = new Date();
  const qs = new URL(req.url || '/', 'http://localhost').searchParams;
  const dateParam = qs.get('date');
  const today = isDateStr(dateParam) ? dateParam : todayStr(now);

  const settled = await Promise.allSettled([...CWA_DATASETS.map((d) => d.fetch()), loadTodayTransport(req)]);
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

  // ---- TDX（經 /transport 或直接）：整個 reject 時視為 unavailable ----
  const tdxData = tdxResult.status === 'fulfilled'
    ? tdxResult.value
    : { status: 'unavailable', fetchedAt: null, flights: null, ferries: null, errors: [tdxResult.reason?.message || String(tdxResult.reason)] };
  const tdxOk = tdxData.status === 'live' && !tdxData.errors?.length && tdxData.flights && tdxData.ferries;

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
        ...(tdxData.via ? { via: tdxData.via } : {}),
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
