const PLACE = Object.freeze({
  placeId: 'ChIJmxtIi39rYogRSvt3otrmncA',
  dataCid: '13879503453328767818',
  dataId: '0x88626b7f8b481b9b:0xc09de6daa277fb4a',
  title: 'The Juicy Seafood and Bar',
  address: '4925 University Dr NW B, Huntsville, AL 35816',
  latitude: 34.7371329,
  longitude: -86.6548049
});

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(raw) {
  const p = raw?.place_results || {};
  const pt = p?.popular_times || {};
  const weekly = {};

  for (const [day, rows] of Object.entries(pt?.graph_results || {})) {
    weekly[String(day).toLowerCase()] = (Array.isArray(rows) ? rows : []).map((x) => ({
      time: x?.time || '',
      busynessScore: numberOrNull(x?.busyness_score),
      liveBusynessScore: numberOrNull(x?.live_busyness_score),
      current: Boolean(x?.current),
      info: x?.info || ''
    }));
  }

  let current = null;
  for (const rows of Object.values(weekly)) {
    for (const row of rows) {
      if (row.current) current = row;
    }
  }

  const liveScore = current?.liveBusynessScore ?? null;
  const usualScore = current?.busynessScore ?? null;

  return {
    ok: true,
    source: 'Google Maps Popular Times via SerpApi',
    provider: 'serpapi',
    queryMode: 'data_cid',
    placeId: p?.place_id || PLACE.placeId,
    dataCid: p?.data_cid || PLACE.dataCid,
    dataId: p?.data_id || PLACE.dataId,
    title: p?.title || PLACE.title,
    address: p?.address || PLACE.address,
    currentDay: pt?.current_day || null,
    info: pt?.live_hash?.info || current?.info || '',
    timeSpent: pt?.live_hash?.time_spent || '',
    liveScore,
    usualScore,
    delta:
      Number.isFinite(liveScore) && Number.isFinite(usualScore)
        ? liveScore - usualScore
        : null,
    weekly,
    fetchedAt: Date.now(),
    googleMapsUrl: p?.links?.directions || p?.link || null,
    searchId: raw?.search_metadata?.id || null
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // SerpApi itself caches identical queries for up to 1 hour unless no_cache=true.
  // Do not force no_cache here; this protects the user's monthly quota.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const key = process.env.SERPAPI_KEY;
  if (!key) {
    return res
      .status(503)
      .json({ ok: false, error: 'SERPAPI_KEY is not configured on the server' });
  }

  // Keep the existing frontend compatible. It currently sends place_id,
  // but the bridge deliberately queries the exact Maps listing via data_cid.
  const requestedPlaceId = String(req.query?.place_id || PLACE.placeId);
  if (requestedPlaceId !== PLACE.placeId) {
    return res.status(400).json({ ok: false, error: 'Place ID not allowed' });
  }

  try {
    const u = new URL('https://serpapi.com/search.json');
    u.searchParams.set('engine', 'google_maps');
    u.searchParams.set('data_cid', PLACE.dataCid);
    u.searchParams.set('hl', 'en');
    u.searchParams.set('gl', 'us');
    u.searchParams.set('api_key', key);

    const r = await fetch(u, {
      headers: { Accept: 'application/json' }
    });

    const raw = await r.json().catch(() => ({}));

    if (!r.ok || raw?.error) {
      return res.status(r.ok ? 502 : r.status).json({
        ok: false,
        error: raw?.error || `SerpApi HTTP ${r.status}`,
        queryMode: 'data_cid',
        dataCid: PLACE.dataCid
      });
    }

    const result = normalize(raw);

    if (!Object.keys(result.weekly).length) {
      return res.status(200).json({
        ...result,
        ok: false,
        error:
          'Exact Google Maps listing connected, but Google did not expose Popular Times for this fetch.',
        diagnostics: {
          returnedTitle: raw?.place_results?.title || null,
          returnedPlaceId: raw?.place_results?.place_id || null,
          returnedDataCid: raw?.place_results?.data_cid || null,
          hasPlaceResults: Boolean(raw?.place_results)
        }
      });
    }

    return res.status(200).json(result);
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: e?.message || String(e),
      queryMode: 'data_cid',
      dataCid: PLACE.dataCid
    });
  }
}
