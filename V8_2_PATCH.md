# Pulse Chat v8.2

Fixes two authentication/session issues plus the v8.1 report-history build issue.

## Login-loop fixes
- A fresh password login is marked in sessionStorage before routing to `/chat`.
- Device heartbeat/presence cannot start until device validation finishes.
- A previously revoked browser device key is replaced once after an explicit fresh password login.
- Remotely revoked already-running sessions still sign out normally.
- Auth-state redirects now happen only on a real `SIGNED_OUT` event instead of any transient null session callback.

## Build fix retained
- `ReportHistory.tsx` uses async `try/catch/finally` instead of `.finally()` on a Supabase `PromiseLike`.

No new SQL migration is required beyond the existing v8 migration.
