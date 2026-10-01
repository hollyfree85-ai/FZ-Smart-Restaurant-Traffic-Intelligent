# FZ Google Live — Quota-Safe 6x/day Hotfix (PWA 2.1.2)

Automatic Google sync times use **America/Chicago (Central Time)**:

- 10:00 AM
- 12:00 PM
- 2:00 PM
- 4:00 PM
- 6:00 PM
- 8:00 PM

Behavior:
- Quick Board continues its normal live refresh independently.
- Google is not automatically fetched before 10:00 AM.
- If the app is closed during a slot, missed slots are not replayed one-by-one. On the next open, only the latest due slot can run once.
- The automatic schedule state is stored per device/day.
- The Google API response also uses a shared Vercel CDN cache to reduce duplicate SerpApi calls when the PWA is open on multiple devices.
- Manual Google Refresh remains available and can consume an additional provider search.
- Exact restaurant lookup remains locked to data_cid `13879503453328767818`.

## Replace these files in GitHub
- `app.js`
- `sw.js`
- `index.html`
- `api/google-live.js`

Vercel should redeploy automatically after the commit.
