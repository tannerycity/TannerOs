# TannerOS — SaaS Foundation

## Current production path

TannerOS frontend -> Apps Script compatibility gateway -> Supabase Edge Gateway -> PostgreSQL.

Google Sheets is legacy backup only and is no longer the operational source of truth.

## Multi-tenant model

- `organizations`: one row per club / customer.
- Every operational table has `organization_id`.
- `plans`: commercial plans.
- `modules`: catalog of TannerOS modules.
- `plan_modules`: modules included by plan.
- `subscriptions`: organization subscription state.
- `organization_module_overrides`: per-club module enable/disable overrides.
- `organization_memberships`: users attached to organizations.
- `role_module_permissions`: read/write permissions by role and module.

Tannery City FC is tenant #1 and currently uses the internal full plan.

## Product direction

A club subscription determines which modules are available. Modules must not depend directly on Tannery City-specific data. New business logic should be organized by domain and operate within an explicit organization context.

Target domains:

- Identity & Access
- Organizations & Subscription
- Players
- Attendance
- Finance
- Academies
- Scouting / Prospects
- Store / Orders
- Equipment
- Sponsors
- Programs & Events
- Matches & Statistics
- QA / Audit

## Target frontend structure

The existing monolithic `index.html` remains the production UI during migration. New development should progressively move to modules without a big-bang rewrite.

Suggested target:

```text
src/
  app/
  core/
    auth/
    api/
    tenant/
    permissions/
  domains/
    players/
    finance/
    attendance/
    academies/
    scouting/
    store/
    equipment/
    sponsors/
    programs/
  shared/
    ui/
    storage/
    offline/
```

Each domain should expose services/repositories instead of reading storage or transport directly from UI components.

## Backend principles

1. PostgreSQL / Supabase is the operational source of truth.
2. Every read/write must be scoped by `organization_id`.
3. Subscription/module entitlement is server-authoritative.
4. No service-role secret belongs in the browser.
5. Soft deletion and legacy IDs remain supported during migration.
6. Offline behavior remains supported while the frontend is modularized.
7. Supabase Auth will replace legacy password hashes after the data cutover is stable.
8. Supabase Storage will receive new high-quality photos; legacy photos do not block the migration.

## Hosting

Target application URL: `https://app.tannerycity.com`.

Vercel hosts the frontend. Supabase remains backend infrastructure. The root `tannerycity.com` can remain the public club website.

## Migration sequence

1. Supabase operational cutover — DONE.
2. Vercel + `app.tannerycity.com`.
3. Rename legacy UI references from Google Sheets to TannerOS Cloud.
4. Supabase Auth and memberships.
5. Supabase Storage for new photos.
6. Incremental frontend modularization by domain.
7. Commercial plans, billing provider, onboarding and self-service tenant creation.

## Do not do

- Do not rewrite the whole application before validating each extracted domain.
- Do not expose tenant selection or organization IDs as a security boundary by themselves.
- Do not put Supabase service-role keys or gateway secrets in frontend source.
- Do not remove offline support without an explicit product decision.
