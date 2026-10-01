# FZ Smart Restaurant Traffic Intelligent — FINAL GOOGLE LIVE PWA 2.1.0

This build adds **Google Maps Popular Times + live busyness** as an external signal, auto-refreshed and blended into the FZ Quick Board forecasting engine.

## Restaurant target
- The Juicy Seafood and Bar, 4925 University Dr NW B, Huntsville, AL 35816
- Google Place ID: `ChIJmxtIi39rYogRSvt3otrmncA`

## Live data sources
1. **FZ Quick Board R3M.8.39** — read-only actual seating/floor/reservations/history.
2. **Google Maps Popular Times/live busyness via SerpApi** — server-side bridge at `/api/google-live`.

The official Google Places Web Service does not expose Popular Times as raw JSON, while Google documents Popular Times in the iOS Places UI Kit. This web build therefore uses a backend provider bridge for structured Google Maps Popular Times. The SerpApi API key is never placed in browser code.

## Deploy with Google Live enabled (recommended: Vercel)
1. Create a SerpApi account/API key.
2. Deploy this folder/repository to Vercel.
3. In Vercel Project → Settings → Environment Variables, add `SERPAPI_KEY` with the key.
4. Redeploy.
5. Open app → Model Settings. `Google Live API endpoint` can stay `/api/google-live`.
6. Login with the same FZ Owner account.

## GitHub Pages
GitHub Pages cannot run `/api/google-live`. The static app can still be hosted there, but deploy the included `api/google-live.js` to a serverless host and set **Google Live API endpoint** to that full HTTPS URL. Vercel is simpler because frontend + API can live in one deployment.

## Automatic updates
- Quick Board refresh: configurable, default 15 min.
- Google Live refresh: configurable, default 15 min.
- Manual **Refresh Google Now** button is also included.
- Google typical Popular Times reshapes the hourly forecast.
- When Google returns `live_busyness_score`, the next 120 minutes are corrected with a separate Owner-adjustable live weight.
- If Google does not return a live score, the app shows that live data is unavailable and does **not** invent one.

## Security
- SerpApi key stays server-side in `SERPAPI_KEY`.
- API endpoint is restricted to the configured Huntsville restaurant Place ID.
- Quick Board remains read-only.

## Google Live files (introduced in 2.0.0, retained in PWA 2.1.0)
- `external-signals.js` — Google signal fetch + forecast blending.
- `api/google-live.js` — server-side Google Maps Popular Times bridge.
- `vercel.json` — Vercel function configuration.
- `package.json` — deployment metadata.
