// GET /api/v1/transport — 航班、船班、島際交通、特報
import { wrap } from '../../lib/handler.js';
import { loadSources, envelope } from '../../lib/build.js';
import * as tdx from '../../lib/tdx.js';
import { staticFlights, staticFerries, INTER_ISLAND, STATIC_NOTICE, LIVE_NOTICE } from '../../lib/schedules.js';
import { todayStr } from '../../lib/time.js';

export default wrap(async () => {
  const [{ cwaData, mode, sources }, tdxData] = await Promise.all([loadSources(), tdx.loadAll()]);
  const today = todayStr();

  // TDX 任一資料集失敗就用靜態班表補上（並在 sources.tdx 標示）
  const flights = tdxData.flights?.flights?.length ? tdxData.flights.flights : staticFlights(today);
  const ferries = tdxData.ferries?.ferries?.length ? tdxData.ferries.ferries : staticFerries(today);
  const scheduleSource = {
    flights: tdxData.flights?.flights?.length ? 'tdx' : 'static_timetable',
    ferries: tdxData.ferries?.ferries?.length ? 'tdx' : 'static_timetable',
  };

  return envelope({
    sources: {
      ...sources,
      tdx: {
        status: tdxData.status,
        fetchedAt: tdxData.fetchedAt,
        ...(tdxData.errors?.length ? { errors: tdxData.errors } : {}),
      },
    },
    mode,
    extra: {
      flights,
      ferries,
      interIsland: INTER_ISLAND,
      alerts: cwaData?.warnings?.alerts || [],
      scheduleSource,
      staticNotice: scheduleSource.flights === 'tdx' && scheduleSource.ferries === 'tdx' ? LIVE_NOTICE : STATIC_NOTICE,
    },
  });
});
