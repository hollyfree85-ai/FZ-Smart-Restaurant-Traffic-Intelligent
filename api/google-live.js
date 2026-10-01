const PLACE = Object.freeze({
  placeId: 'ChIJmxtIi39rYogRSvt3otrmncA',
  dataCid: '13879503453328767818',
  dataId: '0x88626b7f8b481b9b:0xc09de6daa277fb4a',
  title: 'The Juicy Seafood and Bar',
  address: '4925 University Dr NW B, Huntsville, AL 35816',
  latitude: 34.7371329,
  longitude: -86.6548049
});

// Durable shared cache is deliberately outside Quick Board's flexibleFloorV1 tree,
// so table Ready / Clear Shift / live-board cleanup cannot erase it.
const SHARED_LAST_GOOD_URL =
  'https://table-live-by-iwanto-zhang-default-rtdb.firebaseio.com/' +
  'juicyTableLive/JUICY-HUNTSVILLE/fzSmartTrafficIntelligenceV1/googlePopularTimesLastGood.json';
const SHARED_SCHEMA = 'FZ_GOOGLE_POPULAR_TIMES_LAST_GOOD_V1';
const MAX_SHARED_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasWeekly(weekly) {
  return Boolean(
    weekly &&
      typeof weekly === 'object' &&
      Object.values(weekly).some((rows) => Array.isArray(rows) && rows.length)
  );
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
    for (const row of rows) if (row.current) current = row;
  }

  const liveScore = current?.liveBusynessScore ?? null;
  const usualScore = current?.busynessScore ?? null;

  return {
    ok: true,
    connected: true,
    source: 'Google Maps Popular Times via SerpApi',
    provider: 'serpapi',
    queryMode: 'place_id',
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

function sharedPayload(result) {
  // Popular Times is durable; live-busyness values are intentionally NOT stored as
  // current live truth because they would become stale across devices/hours.
  return {
    schema: SHARED_SCHEMA,
    ok: true,
    connected: true,
    source: result?.source || 'Google Maps Popular Times via SerpApi',
    provider: 'serpapi',
    queryMode: 'place_id',
    placeId: result?.placeId || PLACE.placeId,
    dataCid: result?.dataCid || PLACE.dataCid,
    dataId: result?.dataId || PLACE.dataId,
    title: result?.title || PLACE.title,
    address: result?.address || PLACE.address,
    currentDay: result?.currentDay || null,
    info: result?.info || '',
    timeSpent: result?.timeSpent || '',
    liveScore: null,
    usualScore: null,
    delta: null,
    weekly: result?.weekly || {},
    fetchedAt: Number(result?.fetchedAt) || Date.now(),
    sharedSavedAt: Date.now(),
    googleMapsUrl: result?.googleMapsUrl || null,
    searchId: result?.searchId || null
  };
}

async function readSharedLastGood() {
  try {
    const r = await fetch(SHARED_LAST_GOOD_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
    });
    if (!r.ok) return null;
    const x = await r.json().catch(() => null);
    if (
      !x ||
      x.schema !== SHARED_SCHEMA ||
      x.placeId !== PLACE.placeId ||
      x.dataCid !== PLACE.dataCid ||
      !hasWeekly(x.weekly)
    ) return null;
    const age = Date.now() - (Number(x.fetchedAt) || 0);
    if (!Number.isFinite(age) || age < 0 || age > MAX_SHARED_AGE_MS) return null;
    return x;
  } catch {
    return null;
  }
}

async function writeSharedLastGood(result) {
  if (!result?.ok || !hasWeekly(result.weekly)) return false;
  try {
    const existing = await readSharedLastGood();
    if ((Number(existing?.fetchedAt) || 0) > (Number(result?.fetchedAt) || 0)) return true;
    const r = await fetch(SHARED_LAST_GOOD_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(sharedPayload(result))
    });
    return r.ok;
  } catch {
    return false;
  }
}

function retainedResponse(lastGood, latestAttemptError, latestAttemptAt = Date.now()) {
  if (!lastGood) return null;
  return {
    ...lastGood,
    ok: true,
    connected: true,
    lastKnownGood: true,
    sharedLastGood: true,
    // Never present an old live score as "live now".
    liveScore: null,
    usualScore: null,
    delta: null,
    latestAttemptAt,
    latestAttemptError: latestAttemptError || 'Latest Google check did not include Popular Times.',
    cachePolicy: 'durable-shared-last-good'
  };
}

function setShortFallbackCache(res) {
  const policy = 'public, s-maxage=300, stale-while-revalidate=120, stale-if-error=604800';
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', policy);
  res.setHeader('Vercel-CDN-Cache-Control', policy);
  res.setHeader('X-FZ-Google-Cache', 'durable-shared-last-good');
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const requestedPlaceId = String(req.query?.place_id || PLACE.placeId);
  if (requestedPlaceId !== PLACE.placeId) {
    return res.status(400).json({ ok: false, connected: false, error: 'Place ID not allowed' });
  }

  // Zero-quota bootstrap used when a second device opens the PWA between scheduled slots.
  if (String(req.query?.cache_only || '') === '1') {
    const lastGood = await readSharedLastGood();
    if (lastGood) {
      setShortFallbackCache(res);
      return res.status(200).json(
        retainedResponse(lastGood, 'Loaded durable shared Popular Times cache; no SerpApi search used.')
      );
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({
      ok: false,
      connected: true,
      error: 'No durable shared Popular Times cache exists yet.'
    });
  }

  const key = process.env.SERPAPI_KEY;
  if (!key) {
    const lastGood = await readSharedLastGood();
    if (lastGood) {
      setShortFallbackCache(res);
      return res.status(200).json(
        retainedResponse(lastGood, 'SERPAPI_KEY is not configured; using retained Popular Times.')
      );
    }
    return res.status(503).json({
      ok: false,
      connected: false,
      error: 'SERPAPI_KEY is not configured on the server'
    });
  }

  const manual = String(req.query?.manual || '') === '1';
  const sharedTtl = manual ? 300 : 6300;
  const cdnPolicy = `public, s-maxage=${sharedTtl}, stale-if-error=604800`;

  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', cdnPolicy);
  res.setHeader('Vercel-CDN-Cache-Control', cdnPolicy);
  res.setHeader('X-FZ-Google-Cache', manual ? 'manual-shared-5m' : 'scheduled-shared-105m');

  try {
    const u = new URL('https://serpapi.com/search.json');
    u.searchParams.set('engine', 'google_maps');
    u.searchParams.set('type', 'place');
    u.searchParams.set('place_id', PLACE.placeId);
    u.searchParams.set('hl', 'en');
    u.searchParams.set('gl', 'us');
    u.searchParams.set('api_key', key);

    const r = await fetch(u, { headers: { Accept: 'application/json' } });
    const raw = await r.json().catch(() => ({}));

    if (!r.ok || raw?.error) {
      const lastGood = await readSharedLastGood();
      if (lastGood) {
        setShortFallbackCache(res);
        return res.status(200).json(
          retainedResponse(lastGood, raw?.error || `SerpApi HTTP ${r.status}`)
        );
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({
        ok: false,
        connected: false,
        error: raw?.error || `SerpApi HTTP ${r.status}`,
        queryMode: 'place_id',
        dataCid: PLACE.dataCid
      });
    }

    const result = normalize(raw);

    if (!hasWeekly(result.weekly)) {
      const lastGood = await readSharedLastGood();
      if (lastGood) {
        setShortFallbackCache(res);
        return res.status(200).json(
          retainedResponse(
            lastGood,
            'Exact Google Maps listing connected, but Google did not expose Popular Times for this fetch.'
          )
        );
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({
        ...result,
        ok: false,
        connected: true,
        error: 'Exact Google Maps listing connected, but Google did not expose Popular Times for this fetch.',
        diagnostics: {
          returnedTitle: raw?.place_results?.title || null,
          returnedPlaceId: raw?.place_results?.place_id || null,
          returnedDataCid: raw?.place_results?.data_cid || null,
          hasPlaceResults: Boolean(raw?.place_results),
          popularTimesPresent: Boolean(raw?.place_results?.popular_times)
        }
      });
    }

    const sharedPersisted = await writeSharedLastGood(result);
    return res.status(200).json({
      ...result,
      lastKnownGood: false,
      sharedLastGood: false,
      sharedPersisted,
      cachePolicy: manual ? 'manual-shared-5m' : 'scheduled-shared-105m'
    });
  } catch (e) {
    const lastGood = await readSharedLastGood();
    if (lastGood) {
      setShortFallbackCache(res);
      return res.status(200).json(retainedResponse(lastGood, e?.message || String(e)));
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      ok: false,
      connected: false,
      error: e?.message || String(e),
      queryMode: 'place_id',
      dataCid: PLACE.dataCid
    });
  }
}
