// GET /api/v1/status — 今晚總覽
import { wrap } from '../../lib/handler.js';
import { loadSources, buildToday, envelope } from '../../lib/build.js';

export default wrap(async () => {
  const { cwaData, mode, sources } = await loadSources();
  const { today } = buildToday(cwaData, mode);
  return envelope({ sources: { ...sources, tdx: { status: 'not_used', fetchedAt: null } }, mode, extra: { today } });
});
