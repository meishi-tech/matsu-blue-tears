// lib/handler.js — Serverless handler 共用外殼：CORS/OPTIONS、快取標頭、錯誤處理
import { setApiHeaders } from './cache.js';
import { toIso08 } from './time.js';

/**
 * 把「產生 payload 的 async 函式」包成 Vercel handler。
 * 任何上游失敗都應在 lib 層被降級成 model 模式；這裡只處理真正的程式錯誤（500）。
 */
export function wrap(produce) {
  return async function handler(req, res) {
    setApiHeaders(res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET only' } }));
    }
    try {
      const payload = await produce(req);
      res.statusCode = 200;
      res.end(JSON.stringify(payload));
    } catch (err) {
      // 不快取錯誤回應
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 500;
      res.end(JSON.stringify({
        ok: false,
        generatedAt: toIso08(new Date()),
        error: { code: err?.code || 'INTERNAL_ERROR', message: err?.message || String(err) },
      }));
    }
  };
}
