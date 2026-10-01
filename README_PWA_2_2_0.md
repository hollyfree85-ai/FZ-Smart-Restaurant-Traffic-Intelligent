# FZ Smart Restaurant Traffic Intelligent — PWA 2.2.0

This rebuild keeps Google Popular Times visible from the last successful Google response even when a later fetch does not expose Popular Times.

- FZ Quick Board R3M.8.39 remains read-only and live.
- Google checks: 10:00, 12:00, 14:00, 16:00, 18:00, 20:00 Central Time.
- Popular Times are retained as LAST GOOD if a later Google response is incomplete.
- Google live busyness is used only when Google actually exposes a live score.
- Stable Google API URLs allow shared Vercel CDN caching across devices.
- The old Vercel API `Cache-Control: no-store` override was removed.
- Manual checks within 90 minutes of a scheduled slot cover that slot.
- Mobile vertical scrolling fix is included.
- `SERPAPI_KEY` stays server-side in Vercel.

Restaurant: The Juicy Seafood and Bar, 4925 University Dr NW B, Huntsville, AL 35816
Place ID: ChIJmxtIi39rYogRSvt3otrmncA
data_cid: 13879503453328767818
