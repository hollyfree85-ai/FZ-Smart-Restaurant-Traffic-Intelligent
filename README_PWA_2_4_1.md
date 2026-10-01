# FZ Smart Restaurant Traffic Intelligent — PWA 2.4.1

## Shared Google Last-Good Cache

This rebuild keeps Google Maps Popular Times available across devices even when a later Google/SerpApi fetch does not expose `popular_times`.

### Behavior
- A successful Google Popular Times response is normalized and saved to a dedicated shared FZ Traffic Intelligence cache in Firebase Realtime Database.
- The cache is outside Quick Board `flexibleFloorV1`, so Ready/Table reset/Clear Shift does not erase it.
- A phone, laptop, or another installed PWA can bootstrap from the shared cache without spending a SerpApi search.
- If a later Google check returns no Popular Times, the API returns the shared last-good weekly pattern instead of dropping to Offline.
- Stale **live busyness** is never replayed as current live data. Retained data is used only for the weekly Popular Times shape and other non-live metadata.
- Shared last-good data expires after 14 days if no successful Google refresh occurs.

### Existing behavior retained
- Google quota-safe schedule: 10 AM, 12 PM, 2 PM, 4 PM, 6 PM, 8 PM Central Time.
- Manual Google check can cover a nearby scheduled slot.
- Local Event Impact Intelligence.
- Persistent Seating Ledger / analyticsV1 history.
- Mobile vertical scrolling.
- Quick Board operational paths remain read-only from this Forecast app.

### Deploy update
Replace the root files included in the UPDATE package. Replace `api/google-live.js` inside the existing GitHub `api/` folder. `api/local-events.js` is unchanged.
