# Pulse Chat v8.1 patch

Fixes the TypeScript production-build error in `components/chat/ReportHistory.tsx`:

- Removed `.finally()` from a Supabase `PromiseLike` query chain.
- Replaced it with an async loader using `try/catch/finally`.
- Added effect cancellation protection so closing the panel cannot update stale state.

No database migration changes are required beyond the existing v8 migration.
