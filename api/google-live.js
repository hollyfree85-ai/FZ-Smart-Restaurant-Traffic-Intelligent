const PLACE = Object.freeze({
  placeId: 'ChIJmxtIi39rYogRSvt3otrmncA',
  dataCid: '13879503453328767818',
  dataId: '0x88626b7f8b481b9b:0xc09de6daa277fb4a',
  title: 'The Juicy Seafood and Bar',
  address: '4925 University Dr NW B, Huntsville, AL 35816',
  latitude: 34.7371329,
  longitude: -86.6548049
});

// Best-effort shared cache outside Quick Board operational data.
const SHARED_LAST_GOOD_URL =
  'https://table-live-by-iwanto-zhang-default-rtdb.firebaseio.com/' +
  'juicyTableLive/JUICY-HUNTSVILLE/fzSmartTrafficIntelligenceV1/googlePopularTimesLastGoodV2.json';
const SHARED_SCHEMA = 'FZ_GOOGLE_POPULAR_TIMES_BASELINE_V2';
const MAX_SHARED_AGE_MS = 31 * 24 * 60 * 60 * 1000;
const ARCHIVE_SCAN_LIMIT = 24;

const n = value => {
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
};

function hasWeekly(weekly) {
  return Boolean(
    weekly && typeof weekly === 'object' &&
    Object.values(weekly).some(rows => Array.isArray(rows) && rows.length)
  );
}

function searchTime(raw) {
  const s = raw?.search_metadata?.processed_at || raw?.search_metadata?.created_at || '';
  const t = Date.parse(String(s).replace(' UTC', 'Z'));
  return Number.isFinite(t) ? t : Date.now();
}

function normalize(raw, sourceLabel = 'Google Maps Popular Times via SerpApi') {
  const p = raw?.place_results || {};
  const pt = p?.popular_times || {};
  const weekly = {};

  for (const [day, rows] of Object.entries(pt?.graph_results || {})) {
    weekly[String(day).toLowerCase()] = (Array.isArray(rows) ? rows : []).map(x => ({
      time: x?.time || '',
      busynessScore: n(x?.busyness_score),
      liveBusynessScore: n(x?.live_busyness_score),
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
  const params = raw?.search_parameters || {};
  let queryMode = 'unknown';
  if (params.place_id) queryMode = 'place_id';
  else if (params.data_cid) queryMode = 'data_cid';
  else if (params.data) queryMode = 'data';
  else if (params.q) queryMode = 'maps_search';

  return {
    ok: true,
    connected: true,
    source: sourceLabel,
    provider: 'serpapi',
    queryMode,
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
    delta: Number.isFinite(liveScore) && Number.isFinite(usualScore) ? liveScore - usualScore : null,
    weekly,
    fetchedAt: searchTime(raw),
    googleMapsUrl: p?.links?.directions || p?.link || null,
    searchId: raw?.search_metadata?.id || null
  };
}

function baselineOnly(result, extra = {}) {
  return {
    schema: SHARED_SCHEMA,
    ok: true,
    connected: true,
    source: result?.source || 'Google Maps Popular Times baseline',
    provider: 'serpapi',
    queryMode: result?.queryMode || 'retained',
    placeId: result?.placeId || PLACE.placeId,
    dataCid: result?.dataCid || PLACE.dataCid,
    dataId: result?.dataId || PLACE.dataId,
    title: result?.title || PLACE.title,
    address: result?.address || PLACE.address,
    currentDay: result?.currentDay || null,
    info: result?.info || '',
    timeSpent: result?.timeSpent || '',
    // Historical baseline must never impersonate a current live reading.
    liveScore: null,
    usualScore: null,
    delta: null,
    weekly: result?.weekly || {},
    fetchedAt: Number(result?.fetchedAt) || Date.now(),
    sharedSavedAt: Date.now(),
    googleMapsUrl: result?.googleMapsUrl || null,
    searchId: result?.searchId || null,
    ...extra
  };
}

function validBaseline(x) {
  if (!x || !hasWeekly(x.weekly)) return false;
  if (x.placeId && x.placeId !== PLACE.placeId) return false;
  if (x.dataCid && String(x.dataCid) !== PLACE.dataCid) return false;
  const age = Date.now() - (Number(x.fetchedAt) || 0);
  return Number.isFinite(age) && age >= 0 && age <= MAX_SHARED_AGE_MS;
}

async function readSharedBaseline() {
  try {
    const r = await fetch(SHARED_LAST_GOOD_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
    });
    if (!r.ok) return null;
    const x = await r.json().catch(() => null);
    return x?.schema === SHARED_SCHEMA && validBaseline(x) ? x : null;
  } catch {
    return null;
  }
}

async function writeSharedBaseline(result) {
  if (!result?.ok || !hasWeekly(result.weekly)) return false;
  try {
    const existing = await readSharedBaseline();
    if ((Number(existing?.fetchedAt) || 0) > (Number(result?.fetchedAt) || 0)) return true;
    const r = await fetch(SHARED_LAST_GOOD_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(baselineOnly(result, { cacheSource: 'firebase-shared' }))
    });
    return r.ok;
  } catch {
    return false;
  }
}

function extractArchiveIds(payload) {
  const ids = [];
  const seen = new Set();
  const push = v => {
    const s = String(v || '').trim();
    if (/^[a-f0-9]{20,64}$/i.test(s) && !seen.has(s)) {
      seen.add(s); ids.push(s);
    }
  };
  const walk = (v, depth = 0) => {
    if (depth > 4 || ids.length >= 80 || v == null) return;
    if (typeof v === 'string') return push(v);
    if (Array.isArray(v)) return v.forEach(x => walk(x, depth + 1));
    if (typeof v === 'object') {
      if ('id' in v) push(v.id);
      if ('search_id' in v) push(v.search_id);
      for (const [k, x] of Object.entries(v)) {
        if (/^(id|search_id)$/i.test(k)) continue;
        if (/search|result|data|items/i.test(k)) walk(x, depth + 1);
      }
    }
  };
  walk(payload);
  return ids;
}

function sameRestaurant(raw) {
  const p = raw?.place_results || {};
  const sp = raw?.search_parameters || {};
  if (p?.place_id === PLACE.placeId) return true;
  if (String(p?.data_cid || '') === PLACE.dataCid) return true;
  if (sp?.place_id === PLACE.placeId) return true;
  if (String(sp?.data_cid || '') === PLACE.dataCid) return true;
  if (String(sp?.data || '').includes(PLACE.dataId)) return true;
  return false;
}

async function recoverFromSerpArchive(key) {
  // Search Archive retrieval is used as a durable recovery layer. It does not create
  // a new Google Maps engine search; it retrieves already-created SerpApi results.
  try {
    const listUrl = new URL('https://serpapi.com/searches.json');
    listUrl.searchParams.set('api_key', key);
    const lr = await fetch(listUrl, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!lr.ok) return null;
    const list = await lr.json().catch(() => null);
    const ids = extractArchiveIds(list).slice(0, ARCHIVE_SCAN_LIMIT);
    for (const id of ids) {
      try {
        const u = new URL(`https://serpapi.com/searches/${id}.json`);
        u.searchParams.set('api_key', key);
        const r = await fetch(u, { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!r.ok) continue;
        const raw = await r.json().catch(() => null);
        if (!raw || raw?.search_metadata?.status !== 'Success' || !sameRestaurant(raw)) continue;
        const x = normalize(raw, 'Google Maps Popular Times recovered from SerpApi Search Archive');
        if (hasWeekly(x.weekly)) {
          await writeSharedBaseline(x);
          return baselineOnly(x, {
            lastKnownGood: true,
            archiveRecovered: true,
            cacheSource: 'serpapi-archive'
          });
        }
      } catch {}
    }
  } catch {}
  return null;
}

async function getRetainedBaseline(key) {
  const shared = await readSharedBaseline();
  if (shared) return baselineOnly(shared, {
    lastKnownGood: true,
    sharedLastGood: true,
    cacheSource: shared.cacheSource || 'firebase-shared'
  });
  if (key) return recoverFromSerpArchive(key);
  return null;
}

function retainedResponse(base, error, latestAttemptAt = Date.now()) {
  if (!base) return null;
  return {
    ...baselineOnly(base),
    ok: true,
    connected: true,
    lastKnownGood: true,
    sharedLastGood: Boolean(base.sharedLastGood),
    archiveRecovered: Boolean(base.archiveRecovered),
    cacheSource: base.cacheSource || 'retained-baseline',
    latestAttemptAt,
    latestAttemptError: error || 'Latest Google check did not include Popular Times.',
    cachePolicy: 'persistent-popular-times-baseline'
  };
}

function setFallbackHeaders(res, source = 'persistent-baseline') {
  const policy = 'public, s-maxage=300, stale-while-revalidate=120, stale-if-error=604800';
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', policy);
  res.setHeader('Vercel-CDN-Cache-Control', policy);
  res.setHeader('X-FZ-Google-Cache', source);
}

function exactRequests(key) {
  const common = { engine: 'google_maps', type: 'place', hl: 'en', gl: 'us', api_key: key };
  const data = `!4m5!3m4!1s${PLACE.dataId}!8m2!3d${PLACE.latitude}!4d${PLACE.longitude}`;
  return [
    { name: 'data_exact', params: { ...common, data } },
    { name: 'place_id', params: { ...common, place_id: PLACE.placeId } },
    { name: 'data_cid', params: { ...common, data_cid: PLACE.dataCid } }
  ];
}

async function runSerp(params, noCache = false) {
  const u = new URL('https://serpapi.com/search.json');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  if (noCache) u.searchParams.set('no_cache', 'true');
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  const raw = await r.json().catch(() => ({}));
  return { r, raw };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const requestedPlaceId = String(req.query?.place_id || PLACE.placeId);
  if (requestedPlaceId !== PLACE.placeId) {
    return res.status(400).json({ ok: false, connected: false, error: 'Place ID not allowed' });
  }

  const key = process.env.SERPAPI_KEY || '';

  // No-quota bootstrapping: restore the persistent baseline from shared cache or
  // SerpApi's own archived successful searches before doing any new Google Maps search.
  if (String(req.query?.cache_only || '') === '1') {
    const base = await getRetainedBaseline(key);
    if (base) {
      setFallbackHeaders(res, base.cacheSource || 'archive-baseline');
      return res.status(200).json(
        retainedResponse(base, 'Loaded retained Popular Times baseline; no new Google Maps search used.')
      );
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({
      ok: false,
      connected: true,
      error: 'No retained Popular Times baseline has been found yet.'
    });
  }

  if (!key) {
    const base = await getRetainedBaseline('');
    if (base) {
      setFallbackHeaders(res);
      return res.status(200).json(retainedResponse(base, 'SERPAPI_KEY missing; using retained baseline.'));
    }
    return res.status(503).json({ ok: false, connected: false, error: 'SERPAPI_KEY is not configured on the server' });
  }

  const manual = String(req.query?.manual || '') === '1';
  const bootstrap = String(req.query?.bootstrap || '') === '1';
  const existing = await getRetainedBaseline(key);
  const strategies = exactRequests(key);
  // Once a baseline exists, scheduled checks use one stable exact route. During first
  // bootstrap, try all known exact identifiers and stop immediately when Popular Times appears.
  const attempts = existing ? strategies.slice(0, 1) : (bootstrap || manual ? strategies : strategies.slice(0, 1));
  const sharedTtl = manual ? 300 : 6300;
  const cdnPolicy = `public, s-maxage=${sharedTtl}, stale-if-error=604800`;
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', cdnPolicy);
  res.setHeader('Vercel-CDN-Cache-Control', cdnPolicy);

  let lastRaw = null;
  let lastError = '';
  let freshNoWeekly = null;

  try {
    for (let i = 0; i < attempts.length; i++) {
      const s = attempts[i];
      const { r, raw } = await runSerp(s.params, manual && i === 0);
      lastRaw = raw;
      if (!r.ok || raw?.error) {
        lastError = raw?.error || `SerpApi HTTP ${r.status}`;
        continue;
      }
      const result = normalize(raw);
      result.queryMode = s.name;
      if (hasWeekly(result.weekly)) {
        const sharedPersisted = await writeSharedBaseline(result);
        res.setHeader('X-FZ-Google-Cache', manual ? 'fresh-manual' : 'fresh-scheduled');
        return res.status(200).json({
          ...result,
          lastKnownGood: false,
          sharedLastGood: false,
          archiveRecovered: false,
          sharedPersisted,
          baselineLocked: true,
          cachePolicy: manual ? 'manual-5m' : 'scheduled-105m'
        });
      }
      freshNoWeekly = result;
      lastError = 'Exact Google Maps listing connected, but this fetch did not expose Popular Times.';
      // Do not spend additional quota when a retained baseline already exists.
      if (existing) break;
    }

    const base = existing || await getRetainedBaseline(key);
    if (base) {
      setFallbackHeaders(res, base.cacheSource || 'persistent-baseline');
      return res.status(200).json(retainedResponse(base, lastError || 'Latest Google check had no Popular Times.'));
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      ...(freshNoWeekly || {}),
      ok: false,
      connected: Boolean(freshNoWeekly?.connected || lastRaw?.place_results),
      error: lastError || 'Popular Times baseline has not been captured yet.',
      baselineLocked: false,
      diagnostics: {
        returnedTitle: lastRaw?.place_results?.title || null,
        returnedPlaceId: lastRaw?.place_results?.place_id || null,
        returnedDataCid: lastRaw?.place_results?.data_cid || null,
        hasPlaceResults: Boolean(lastRaw?.place_results),
        popularTimesPresent: Boolean(lastRaw?.place_results?.popular_times),
        strategiesTried: attempts.map(x => x.name)
      }
    });
  } catch (e) {
    const base = existing || await getRetainedBaseline(key);
    if (base) {
      setFallbackHeaders(res);
      return res.status(200).json(retainedResponse(base, e?.message || String(e)));
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ ok: false, connected: false, error: e?.message || String(e) });
  }
}
