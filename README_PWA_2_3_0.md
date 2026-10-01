# FZ Smart Restaurant Traffic Intelligent — PWA 2.3.0

## Persistent Seating Ledger rebuild

Traffic counting now follows the same persistence principle as FZ Server Intelligence V1.2.16.

- **Occupied Tables / Current Guests** are live floor NOW metrics from Quick Board table status.
- **Tables Served Today / Guests Served Today / last 60m / hourly actual / pace / forecast-vs-actual** use a persistent event ledger.
- Cloud history source: Quick Board `analyticsV1` archive.
- Current shift source: `rotationBoardV31` seating turns.
- Device continuity guard: already-seen seating events are retained locally for 180 days and merged by stable event ID.
- A table becoming Ready does not remove its seating event.
- Clear Shift does not erase analytics: after the live Board is cleared, archived `analyticsV1` events remain the historical source.
- Google Popular Times / live busyness and quota-safe schedule from 2.2.0 are retained.
- Mobile vertical scroll fixes are retained.

This app remains read-only against operational Quick Board data.
