# TannerOS V2 · White-label branding

TannerOS stores organization branding in `public.organizations.branding` and applies it at runtime across V2.

## Editable identity
- brand / club name
- product name
- installed app name
- tagline
- primary, secondary, accent and background colors

## Brand assets
- primary logo
- logo for dark backgrounds
- mark / crest
- PWA app icon (source is converted client-side to 180, 192 and 512 px PNG files)
- splash / cover art

Assets live in the public `tanneros-branding` Storage bucket under `organizations/<organization_id>/branding/`. Browser writes require authenticated Admin write permission for the same organization.

## Runtime
- `/v2/branding.js`: normalizes and applies CSS variables, logos, meta tags, favicon/apple-touch icon and manifest URL.
- `/v2/branding-auto.js`: loads the signed-in user's organization brand for V2 pages.
- `/api/manifest.js`: serves an organization-specific PWA manifest using the safe public branding RPC.
- `/v2/admin/branding/`: Brand Studio for Admin users.

Do not invent or infer official logo files. Until an organization uploads its master assets, TannerOS uses text/mark fallbacks and the configured color palette.
