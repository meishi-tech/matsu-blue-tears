// lib/http.js — 帶 timeout 的 fetch 封裝
// 所有上游（CWA、TDX）都透過這裡呼叫，避免 serverless function 被卡住。

export class HttpError extends Error {
  constructor(message, { status, url, code } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.code = code || (status ? 'UPSTREAM_HTTP' : 'UPSTREAM_TIMEOUT');
  }
}

/**
 * 以 GET/POST 取得 JSON，逾時即丟 HttpError(code=UPSTREAM_TIMEOUT)。
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=6000]
 * @param {object} [opts.headers]
 * @param {string} [opts.method='GET']
 * @param {string|URLSearchParams} [opts.body]
 */
export async function fetchJson(url, { timeoutMs = 6000, headers = {}, method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { accept: 'application/json', ...headers },
      body,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, { status: res.status, url });
    }
    return await res.json();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err?.name === 'AbortError') {
      throw new HttpError(`Timeout after ${timeoutMs}ms: ${new URL(url).host}`, { url, code: 'UPSTREAM_TIMEOUT' });
    }
    throw new HttpError(err?.message || 'fetch failed', { url, code: 'UPSTREAM_ERROR' });
  } finally {
    clearTimeout(timer);
  }
}
