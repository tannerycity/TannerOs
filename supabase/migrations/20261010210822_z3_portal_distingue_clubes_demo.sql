-- El portal distingue los clubes demo: no cuentan en el ingreso ni en el
-- total de clubes y se ven marcados como "Demo".

create or replace function private.platform_board()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'product', (select value from public.platform_settings where key = 'product'),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('code', pl.code, 'name', pl.name, 'description', pl.description,
        'priceMxn', pl.metadata->'priceMxn', 'maxPlayers', pl.metadata->'maxPlayers', 'extraPlayerMxn', pl.metadata->'extraPlayerMxn',
        'modules', (select count(*) from public.plan_modules pm where pm.plan_id = pl.id and pm.enabled))
      order by (pl.metadata->>'order')::int nulls last)
      from public.plans pl where pl.active and coalesce((pl.metadata->>'forSale')::boolean, false)), '[]'::jsonb),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'slug', o.slug, 'name', o.name, 'status', o.status, 'createdAt', o.created_at,
        'city', o.settings->>'city', 'founder', coalesce((o.settings->>'founder')::boolean, false),
        'colors', o.branding->'colors', 'hasLogo', (o.branding->'assets'->>'logo') is not null,
        'plan', (select pl.name from public.subscriptions s join public.plans pl on pl.id = s.plan_id where s.organization_id = o.id order by s.created_at desc limit 1),
        'planCode', (select pl.code from public.subscriptions s join public.plans pl on pl.id = s.plan_id where s.organization_id = o.id order by s.created_at desc limit 1),
        'players', (select count(*) from app.players x where x.organization_id = o.id and x.status = 'active' and x.archived_at is null),
        'users', (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.active),
        'categories', (select count(*) from app.categories c where c.organization_id = o.id),
        'demo', coalesce((o.settings->>'demo')::boolean, false),
        'docsPending', (select count(*) from app.consent_documents cd where cd.organization_id = o.id and cd.active and cd.body like '%[PENDIENTE:%'),
        'ownerPending', (select i.email from app.organization_invitations i where i.organization_id = o.id and i.role_code = 'owner' and i.status = 'pending' order by i.created_at desc limit 1),
        'lastActivity', (select max(e.occurred_at) from app.domain_events e where e.organization_id = o.id))
      order by o.created_at) from public.organizations o), '[]'::jsonb));
end $$;
revoke all on function private.platform_board() from public, anon, authenticated;