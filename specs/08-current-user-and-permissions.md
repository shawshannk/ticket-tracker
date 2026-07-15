# 08 — "Acting As" User & Permissions (No Real Auth in v1)

You chose to keep this simple for now rather than build real login. This spec describes exactly what that means, including the parts that are worth being honest about rather than glossing over.

## What v1 does

- Keep the prototype's sidebar "switch user" pattern, renamed conceptually to **"acting as"**: a dropdown lets whoever is using the app pick which seeded user they're currently operating as.
- The selected user's `id` is sent with every mutating API request (e.g. as a custom header `X-Acting-User-Id`, or a query param — a header is cleaner and keeps it out of URLs/logs-as-query-strings).
- The NestJS backend reads that header, loads the corresponding user, and uses their `role` to enforce the permission matrix from spec 00 (Admin-only user management, Admin/Manager-only Epic creation and ticket deletion).
- Comments' `author_id` (spec 05) is taken from this acting-user value, fixing the prototype's hardcoded-author bug.

## What this does *not* do — please read this part

This is **not access control** in any meaningful security sense. It is a **convenience/role-simulation mechanism**, useful for an internal demo, a portfolio piece, or a trusted-network internal tool — not for anything with real stakes:

- **Anyone can claim to be anyone.** The `X-Acting-User-Id` header is just a value the client sends — there's no password, token, or session proving the request actually came from that person. Any user of the app (or anyone who can reach the API) can set that header to any user ID and act with Admin permissions.
- **This is fine only if**: the app is used by a small trusted team on a private network/VPN, with no sensitive data, purely to simulate role-based UI/workflow behavior — which matches what the prototype was doing (a demo dropdown, not a login).
- **This is not fine if**: you deploy this anywhere with real access from the internet, real people's real data, or any expectation that "Developer role can't delete tickets" is actually enforced against a malicious or careless actual user, rather than just hidden from a well-behaved one.

## Path to real auth later (not built now, but designed for)

Because the acting-user value is passed as a single header read by a NestJS guard, swapping in real auth later is a contained change:
1. Add a `AuthModule` (JWT or SSO/OAuth — your call when you get there) that issues a real signed token identifying the user.
2. Replace the guard that reads `X-Acting-User-Id` with one that reads the verified `req.user` populated by a Passport/JWT strategy.
3. No changes needed to the permission-matrix logic itself, since it's already centralized in one guard/decorator (`@Roles('admin', 'manager')` style) — it just starts trusting a verified identity instead of a self-reported header.

## Frontend

- Sidebar "acting as" dropdown, identical UX to the prototype's user-switcher.
- Store the selected user id in a small global store (e.g. Zustand) or just local component state lifted to the app root — it's UI-only state, not server state, so it doesn't belong in TanStack Query.
- Every mutation hook attaches the `X-Acting-User-Id` header automatically (centralize this in your API client wrapper, don't repeat it per-call).
