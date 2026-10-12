# Deploying TEJAS-CV on Vercel

## Why users were being logged out (and what changed)

If no PostgreSQL database is connected, the backend silently falls back to a SQLite file in
`/tmp`. On Vercel every function instance has its **own** `/tmp`, and it is wiped on cold starts.
You log in on instance A, the next request lands on instance B, B has never heard of your session,
returns 401, and the app sends you back to the login page. A connected PostgreSQL database plus a
fixed `TEJAS_PLATFORM_PRIVATE_KEY` is what makes sessions shared and permanent.

Code fixes in this version (workflow, roles, engines, ledger and UI flow are unchanged):

| Area | Fix |
| --- | --- |
| Sessions | DB connection pinned to UTC, so session expiry can never be miscomputed by a non-UTC database. |
| Auth speed | Each API request resolves the session with 1 query (was 3 plus extra connection pings). |
| Status speed | `/api/system/status` reuses the full ledger verification while a database-side digest of every block is unchanged; any edit forces full re-verification (tamper detection unchanged). |
| Cold starts | Schema check uses an existence check and one metadata query when current (was ~30 introspection round-trips). Runtime check no longer imports torch. |
| Pooling | Serverless-safe Postgres pool (small pool, recycle, pre-ping, pooler-safe). |
| Frontend | Session check retries cold-start/5xx errors instead of logging out; only a real 401 signs you out. Status polling 10s -> 30s. Optional `VITE_LIVE_EVENTS=off`. |
| Diagnostics | `GET /api/health` now reports `database`, `persistent_sessions`, `signing_key_configured`. |

## Step-by-step deployment

1. **Push this code to GitHub** (`main` branch).
2. **Import the repo** at vercel.com/new. Root Directory: repository root (leave as `./`).
   Vercel reads `vercel.json` and builds two services: `frontend` (Vite) and `backend` (FastAPI).
   If the Framework Preset field is shown, choose **Services** (not Vite). Don't override build commands.
3. The first build may succeed but the app won't work properly until steps 4-7 are done. That's expected.
4. **Connect a database:** Project -> **Storage** -> Create Database -> **Neon** (Postgres).
   Pick the region closest to your users (e.g. Singapore for India). Connect it to
   Production (and Preview if you use it). This injects `DATABASE_URL` automatically.
5. **Match the function region to the database:** Project -> Settings -> **Functions** ->
   Function Region -> the same region as the database (Singapore = `sin1`). A function in the US
   talking to a database in Asia adds hundreds of ms to every request.
6. **Add environment variables** (Settings -> Environment Variables):
   - `TEJAS_PLATFORM_PRIVATE_KEY`: run
     `python backend/scripts/generate_platform_key.py --output .env.vercel-key`, open
     `.env.vercel-key`, and paste the 64 hex characters after the `=` as the value.
     Back it up, never commit it, and never change it for this database.
   - `VITE_LIVE_EVENTS` = `off` (recommended).
   - Do **not** set `VITE_API_URL`.
7. **Redeploy:** Deployments -> latest -> ... -> Redeploy (env vars only apply to new builds).
8. **Verify:** open `https://<your-app>.vercel.app/api/health`. You must see
   `"database": "postgresql"`, `"persistent_sessions": true`, `"signing_key_configured": true`.
9. **Create the admin:** open the site -> Sign up. The first account becomes the admin.
   Then log in, refresh, open a second tab, wait a few minutes, click around - you should stay signed in.

## Remaining hosting constraints (unchanged)

This configuration provides routing and function startup compatibility; the
existing backend is designed for a long-lived process with persistent local
storage. It is not yet a durable production service on Vercel Functions:

- On Vercel, `TEJAS_HOME` defaults to temporary, instance-local storage. SQLite,
  accounts, uploads, models, signing keys, and audit records there can disappear
  and are not shared between instances. An explicit `TEJAS_HOME` overrides it,
  but choosing another local path does not make function storage persistent.
- PostgreSQL persists accounts, sessions, and metadata; it does not persist files
  under `TEJAS_HOME`. Durable uploaded datasets, models, and reports still need a
  private Vercel Blob integration and on-demand download into temporary storage.
  Merely creating a Blob store does not change the current file-access code.
- Jobs use in-process thread pools after returning an HTTP response. They need
  a durable worker/queue strategy before relying on completion across function
  suspension, restarts, and scaling.
- Vercel now supports FastAPI WebSockets in beta with Fluid compute. Keep `/ws/*`
  routed to the backend. Connections can reconnect to a different function
  instance, so the current in-memory event bus needs durable shared event storage.
  Job streams fall back to HTTP polling, but the event history currently remains
  process-local. Realtime transport support alone does not solve shared state.
- Large uploads, inference/training durations, and the scientific Python
  dependency bundle must fit Vercel function limits; verify a real Vercel build
  and representative workloads before deploying.

For full functionality with all application compute on Vercel, finish the private
Blob file integration and durable job execution using Vercel Queues or Workflows.
The existing detached thread pools are not a durable job system. Database setup
fixes the persistence prerequisite for sign-in; it does not complete those two
integrations or guarantee successful long-running analyses.

References: [Services](https://vercel.com/docs/services),
[routing](https://vercel.com/docs/services/routing),
[bindings](https://vercel.com/docs/services/bindings),
[FastAPI](https://vercel.com/docs/frameworks/backend/fastapi), and
[WebSockets](https://vercel.com/docs/functions/websockets).
