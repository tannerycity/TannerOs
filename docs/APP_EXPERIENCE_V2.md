# TannerOS V2 · Unified App Experience

## Architecture decision
TannerOS keeps each business module independently deployable and independently testable, but hides that implementation detail behind a shared application shell.

The UX layer is intentionally **not** a full frontend rewrite. Existing module RPCs, business rules and page scripts stay intact. A shared runtime provides consistent navigation and app behavior across all V2 routes.

## Shared experience layer
`/v2/experience.js` + `/v2/experience.css` provide:
- persistent role-aware sidebar for legacy V2 module pages
- the same top app bar across modules
- contextual Back navigation with safe fallback to the parent hub
- cross-document View Transitions for same-origin V2 navigation
- route prefetch on hover/focus
- mobile bottom dock and off-canvas navigation
- deep-link focusing through `?focus=<uuid>` when a module renders a matching entity row
- action handoff such as `?action=cobrar&player=<uuid>`

`/v2/branding-auto.js` initializes both branding and the shared app experience after an authenticated organization context is resolved.

## Omnibox
The search box is a global command palette, not a local table filter.

It combines:
1. permission-aware TannerOS commands and module shortcuts
2. authenticated entity search through `public.v2_global_search`
3. optional current-view search extras
4. recent destinations stored locally in the browser

Supported searchable entities include players (including linked tutor contact lookup), prospects, orders, sponsors, programs, club events, matches and academies. Search results only expose operational labels and routes that the signed-in user is allowed to access.

Keyboard:
- `Ctrl/Cmd + K`: focus global search
- `/`: focus global search when not typing in a field
- arrows: move through results
- Enter: open result
- Escape: close

## Security rule
Global search must never become an authorization bypass. The database function checks active organization membership and module access before adding any entity type to the result set. `anon` has no execute permission on the internal Omnibox RPC.
