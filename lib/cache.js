// lib/cache.js — 記憶體快取 + Vercel CDN cache header
//
// Serverless 實例在 warm 期間共用同一個 module scope，因此這裡的 Map 可以在
// 多次請求間保留。配合 `s-maxage` 讓 Vercel Edge Cache 在 TTL 內直接回應，
// 上游（CWA / TDX）每個資料集每 10 分鐘最多只會被打一次。

const store = new Map();

export const DEFAULT_TTL_SEC = Number.parseInt(process.env.CACHE_TTL_SEC || '600', 10) || 600;

/**
 * 取得快取值；過期或不存在回傳 undefined。
 */
export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlSec = DEFAULT_TTL_SEC) {
  store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  return value;
}

export function cacheClear() {
  store.clear();
}

/**
 * 以 key 包住一個 async loader：
 *  - 命中快取直接回傳
 *  - 同一時間多個請求只會觸發一次 loader（in-flight 去重）
 *  - loader 失敗時不會寫入快取（下一次請求會再試），但會短暫記錄失敗 30 秒
 *    避免上游掛掉時每個請求都等到 timeout。
 */
const inflight = new Map();

export async function cached(key, loader, ttlSec = DEFAULT_TTL_SEC) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  const failKey = `${key}::fail`;
  const recentFail = cacheGet(failKey);
  if (recentFail) throw recentFail;

  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const value = await loader();
      cacheSet(key, value, ttlSec);
      return value;
    } catch (err) {
      cacheSet(failKey, err, 30);
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/**
 * 寫入合約規定的回應 header。
 */
export function setApiHeaders(res, ttlSec = DEFAULT_TTL_SEC) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', `public, s-maxage=${ttlSec}, stale-while-revalidate=${ttlSec * 3}`);
}
