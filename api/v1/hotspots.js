// GET /api/v1/hotspots — 熱點清單＋今晚各點分數
import { wrap } from '../../lib/handler.js';
import { loadSources, buildToday, envelope } from '../../lib/build.js';
import { buildHotspots } from '../../lib/hotspots.js';

export default wrap(async () => {
  const { cwaData, mode, sources } = await loadSources();
  const { hotspotInput } = buildToday(cwaData, mode);
  const hotspots = buildHotspots(hotspotInput);
  return envelope({ sources: { ...sources, tdx: { status: 'not_used', fetchedAt: null } }, mode, extra: { hotspots } });
});
