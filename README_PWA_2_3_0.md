# FZ Smart Restaurant Traffic Intelligent — PWA 2.3.0

## Quick Board realtime update

PWA 2.3.0 keeps FZ Quick Board read-only and adds an event-driven Firebase Realtime Database listener. When Quick Board changes (SEAT, Ready/table state, reservation, current AM/PM board, or current archive), the dashboard immediately refreshes live Board data instead of waiting for the 15-minute forecast cycle.

### Dashboard live cards
- Occupied Tables — realtime Quick Board table state.
- Current Guests — realtime seated party count.
- Tables Today — realtime total seating events for the current restaurant date.
- The Tables Today subtitle also shows Tables in the Last 60 Minutes.
- Reservations — realtime reservation feed.

### Forecast cadence
The forecast model remains on its configured interval (default 15 minutes). Realtime Quick Board events update the live operational data immediately; the scheduled forecast refresh remains separate so live operations can move without constantly re-baselining the model. Manual Refresh refreshes both.

### Data source
FZ Quick Board R3M.8.39 remains read-only. No Quick Board data is written by this app.
