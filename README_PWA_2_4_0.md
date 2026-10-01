# FZ Smart Restaurant Traffic Intelligent — PWA 2.4.0
## Local Event Impact Intelligence

This release adds a local-event demand layer on top of the existing persistent FZ seating ledger and Google Maps Popular Times / live busyness signal.

### What is new
- New **Local Event Impact** page in the app.
- Automatic scan for upcoming events in **Huntsville, Madison, and nearby North Alabama**.
- Event categories include concerts/shows, expos/conventions, festivals/fairs, sports, and other local events.
- Uses the existing server-side `SERPAPI_KEY`; no second API key is required.
- Uses **Google Search structured `events_results` via SerpApi**. The deprecated `google_events` engine is not used.
- Automatic event check: first app use after **8:30 AM Central Time**, at most once per device/day.
- Stable daily endpoint + Vercel CDN cache helps reuse event results across devices.
- Manual **Refresh Events Now** is available and may use an additional SerpApi search.
- High-impact event found during an automatic check triggers an in-app **LOCAL EVENT ALERT** banner.

### Event impact model
Event impact is not treated as actual customers or reservations. It is an external demand signal.

The model considers:
- event category,
- known large local venues,
- Huntsville / Madison locality,
- event start time,
- likely pre-event demand window,
- event impact score.

Default impact levels:
- High: score 72+
- Medium: 50–71
- Low: below 50

Forecast uplift is conservative and capped at **12% per 15-minute slot** by default. The Owner can change this cap in Model Settings.

### Major local venue awareness
The heuristic recognizes major venues and destination areas such as:
- Orion Amphitheater
- Von Braun Center / Propst Arena / Mars Music Hall
- Toyota Field
- Joe Davis Stadium
- MidCity / The Camp
- Stovehouse
- Huntsville Botanical Garden
- University of Alabama in Huntsville

This is a planning heuristic, not a claim about event attendance.

### Existing features retained
- FZ Persistent Seating Ledger (`analyticsV1` archive + live `rotationBoardV31`)
- Seating history survives table Ready and Clear Shift
- Google Maps Popular Times retained as last-known-good
- Google live busyness when Google supplies it
- Google quota-safe schedule: 10 AM, 12 PM, 2 PM, 4 PM, 6 PM, 8 PM CT
- Mobile vertical scroll fix
- Daily / hourly / 15-minute forecasts
- 30-day calendar
- staffing intelligence
- break & cut advisor
- forecast vs actual
- PWA installability

### New endpoint
`/api/local-events`

This endpoint is a Vercel serverless function and reads `SERPAPI_KEY` from Vercel Environment Variables. The key is not exposed to browser JavaScript.

### Deployment
For an existing PWA 2.3.0 repository, upload/replace the files from the 2.4.0 UPDATE package, including the new `api/local-events.js` inside the existing `api/` folder. Vercel redeploys automatically.
