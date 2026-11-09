// GET /api/v1/forecast — 未來 7 天（含今天）
import { wrap } from '../../lib/handler.js';
import { loadSources, buildDays, envelope } from '../../lib/build.js';

export default wrap(async () => {
  const { cwaData, mode, sources } = await loadSources();
  const days = buildDays(cwaData, mode);
  return envelope({ sources: { ...sources, tdx: { status: 'not_used', fetchedAt: null } }, mode, extra: { days } });
});
