# FZ Smart Restaurant Traffic Intelligent — Google Live PWA 2.1.0

Installable PWA edition. The frontend is installable on supported Android/Desktop browsers and on iPhone/iPad through Safari > Share > Add to Home Screen. The Google Live bridge remains server-side on Vercel.

## Install behavior
- Android Chrome / Samsung Internet / Edge: use **Install App** (native prompt when supported).
- Windows/macOS Chrome or Edge: use **Install App** or the browser install icon.
- iPhone/iPad: open in Safari, Share, **Add to Home Screen**.
- Standalone display removes normal browser chrome and behaves like an app.
- Firebase authentication uses local persistence, so the Owner can remain signed in until logout/session invalidation.

## Data freshness
The service worker caches only the application shell and versioned Firebase JS modules. It deliberately does **not** cache `/api/google-live`, Firebase operational data, or Google/Firebase data endpoints. Live traffic remains network-fresh.

## Deploy
1. Deploy this directory to Vercel.
2. Set `SERPAPI_KEY` in Vercel Environment Variables.
3. Use HTTPS (Vercel supplies it automatically).
4. Open the deployed URL once; use **Install App**.

PWA install requires HTTPS in production (localhost is allowed for development).
