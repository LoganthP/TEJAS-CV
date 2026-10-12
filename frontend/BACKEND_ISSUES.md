# Backend Issues and Observations

## 1. WebSocket Unhandled `asyncio.CancelledError` on Python 3.14 (`backend/app/api/ws.py`)
- **Location:** `backend/app/api/ws.py:60` in `all_events(ws: WebSocket)`
- **Symptom:**
  When a client disconnects or when ASGI middleware closes an unauthenticated websocket connection (`4401 "login required"`), `await q.get()` in Python 3.14 raises `asyncio.CancelledError`.
- **Impact:**
  Because the `try/except` block inside `all_events` only catches `WebSocketDisconnect` (`except WebSocketDisconnect:`), unhandled `asyncio.CancelledError` bubbles up to the Uvicorn ASGI runner and terminates the server process on Python 3.14.
- **Recommended Backend Fix:**
  In `backend/app/api/ws.py`, catch `(WebSocketDisconnect, asyncio.CancelledError)`:
  ```python
  import asyncio
  ...
  try:
      while True:
          await ws.send_json(await q.get())
  except (WebSocketDisconnect, asyncio.CancelledError):
      pass
  finally:
      bus.unsubscribe(ALL, q)
  ```
- **Frontend Mitigation Applied:**
  The frontend `EventsProvider` now strictly waits until the user is authenticated (`user !== null`) before initiating the WebSocket connection, preventing unauthorized connection attempts from triggering the 4401 closure on Python 3.14.
