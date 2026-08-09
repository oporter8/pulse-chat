# Pulse Chat v8.3

Fixes admin suspension behavior for users who are already logged in.

- Supabase Auth ban remains the source of truth for blocking future sign-ins/refreshes.
- When an admin suspends a user, Pulse now also revokes all of that user’s `device_sessions`.
- The Pulse client heartbeat checks device authorization every 10 seconds instead of every 60 seconds.
- Existing logged-in Pulse sessions therefore sign themselves out shortly after an admin ban.
- Restoring access removes the Supabase Auth ban; revoked old device records remain revoked, and the next explicit password login registers a fresh device key through the v8.2 login recovery flow.

No new SQL migration is required if `v8_migration.sql` has already been run.
