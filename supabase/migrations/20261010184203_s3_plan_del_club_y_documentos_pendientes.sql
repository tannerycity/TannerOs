-- El plan de cada club y los documentos que le faltan completar.
-- El plan dice cuántos jugadores incluye y cuánto cuesta cada extra. No se
-- bloquea a nadie: el dueño ve su uso en Administración y el portal suma los
-- extras al ingreso. Un documento con [PENDIENTE: ...] es uno que el club
-- todavía no completa (domicilio, correo de contacto).

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
        'docsPending', (select count(*) from app.consent_documents cd where cd.organization_id = o.id and cd.active and cd.body like '%[PENDIENTE:%'),
        'ownerPending', (select i.email from app.organization_invitations i where i.organization_id = o.id and i.role_code = 'owner' and i.status = 'pending' order by i.created_at desc limit 1),
        'lastActivity', (select max(e.occurred_at) from app.domain_events e where e.organization_id = o.id))
      order by o.created_at) from public.organizations o), '[]'::jsonb));
end $$;
revoke all on function private.platform_board() from public, anon, authenticated;

create or replace function private.my_plan(p_organization_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare v_plan public.plans; v_activos int; v_max int; v_extra_mxn numeric; v_fundador boolean; v_pendientes int;
begin
  if not private.has_module_access(p_organization_id, 'admin', false) then raise exception 'Not authorized'; end if;
  select pl.* into v_plan from public.subscriptions s join public.plans pl on pl.id = s.plan_id
   where s.organization_id = p_organization_id order by s.created_at desc limit 1;
  select count(*) into v_activos from app.players x where x.organization_id = p_organization_id and x.status = 'active' and x.archived_at is null;
  select count(*) into v_pendientes from app.consent_documents cd where cd.organization_id = p_organization_id and cd.active and cd.body like '%[PENDIENTE:%';
  v_max := nullif(v_plan.metadata->>'maxPlayers', '')::int;
  v_extra_mxn := coalesce(nullif(v_plan.metadata->>'extraPlayerMxn', '')::numeric, 0);
  select coalesce((settings->>'founder')::boolean, false) into v_fundador from public.organizations where id = p_organization_id;
  return jsonb_build_object(
    'plan', v_plan.name, 'planCode', v_plan.code,
    'forSale', coalesce((v_plan.metadata->>'forSale')::boolean, false),
    'priceMxn', nullif(v_plan.metadata->>'priceMxn', '')::numeric,
    'founder', v_fundador,
    'maxPlayers', v_max, 'activePlayers', v_activos,
    'extraPlayers', case when v_max is null then 0 else greatest(v_activos - v_max, 0) end,
    'extraPlayerMxn', v_extra_mxn,
    'docsPending', v_pendientes);
end $$;
revoke all on function private.my_plan(uuid) from public, anon, authenticated;

create or replace function public.v2_my_plan(organization_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.my_plan(organization_id) $$;
revoke all on function public.v2_my_plan(uuid) from public, anon;
grant execute on function public.v2_my_plan(uuid) to authenticated;