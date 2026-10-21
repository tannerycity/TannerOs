-- h22 · Costos públicos editables (20/10/2026).
-- Presidencia: "¿dónde puedo yo editar estos costos? Esto va a cambiar".
-- Los precios de /costos se guardan en organizations.settings.publicPrices,
-- como los datos de pago, y se editan en Club (/admin/club/#costos) con el
-- mismo permiso (admin, escribir). /costos los lee con v2_public_costos, que
-- sólo entrega esos precios. Si no hay nada guardado, /costos usa los de
-- costos/tarifas.js.
create or replace function private.precio_publico(p jsonb, p_key text)
returns integer language plpgsql immutable set search_path to 'pg_catalog'
as $$
declare v numeric;
begin
  if p is null or not (p ? p_key) or jsonb_typeof(p->p_key) = 'null' then return null; end if;
  if jsonb_typeof(p->p_key) <> 'number' then raise exception 'El precio % no es un número', p_key; end if;
  v := (p->>p_key)::numeric;
  if v < 0 or v > 100000 or v <> trunc(v) then raise exception 'El precio % va en pesos enteros, de 0 a 100,000', p_key; end if;
  return v::integer;
end $$;

create or replace function private.command_update_public_prices(p_organization_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare v_actor uuid := (select auth.uid()); v jsonb; v_incluye text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id, 'admin', true) then raise exception 'Not authorized'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Precios inválidos'; end if;
  v_incluye := nullif(btrim(coalesce(p->>'incluyeInscripcion', '')), '');
  if length(coalesce(v_incluye, '')) > 120 then raise exception 'Lo que incluye la inscripción es demasiado largo'; end if;
  v := jsonb_build_object(
    'baby', jsonb_build_object('mensualidad1d', private.precio_publico(p->'baby', 'mensualidad1d'),
                               'mensualidad2d', private.precio_publico(p->'baby', 'mensualidad2d'),
                               'inscripcion', private.precio_publico(p->'baby', 'inscripcion')),
    'tanner', jsonb_build_object('mensualidad', private.precio_publico(p->'tanner', 'mensualidad'),
                                 'inscripcion', private.precio_publico(p->'tanner', 'inscripcion')),
    'paquetes', jsonb_build_object('confirmado', coalesce((p->'paquetes'->>'confirmado')::boolean, false),
                                   't1', private.precio_publico(p->'paquetes', 't1'), 't2', private.precio_publico(p->'paquetes', 't2'),
                                   't3', private.precio_publico(p->'paquetes', 't3'), 'b2', private.precio_publico(p->'paquetes', 'b2'),
                                   't1b1', private.precio_publico(p->'paquetes', 't1b1')),
    'incluyeInscripcion', v_incluye,
    'actualizado', now());
  update public.organizations
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('publicPrices', jsonb_strip_nulls(v)), updated_at = now()
   where id = p_organization_id;
  if not found then raise exception 'Organization not found'; end if;
  insert into app.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PublicPricesUpdated', 'organization', p_organization_id, jsonb_strip_nulls(v), v_actor);
  return jsonb_strip_nulls(v);
end $$;

create or replace function private.query_public_prices(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'private'
as $$
begin
  if not private.has_module_access(p_organization_id, 'admin', false) then raise exception 'Not authorized'; end if;
  return (select settings->'publicPrices' from public.organizations where id = p_organization_id);
end $$;

-- Pública: sólo los precios de /costos, nada más del club.
create or replace function public.v2_public_costos(club_key text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'private'
as $$
declare v_org uuid;
begin
  v_org := private.public_organization(club_key);
  if v_org is null then return null; end if;
  return (select settings->'publicPrices' from public.organizations where id = v_org and status = 'active');
end $$;

create or replace function public.v2_public_prices(organization_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private'
as $$ select private.query_public_prices(organization_id) $$;
create or replace function public.v2_update_public_prices(organization_id uuid, prices jsonb)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_update_public_prices(organization_id, prices) $$;

grant execute on function public.v2_public_costos(text) to anon, authenticated;
revoke all on function public.v2_public_prices(uuid) from public, anon;
revoke all on function public.v2_update_public_prices(uuid, jsonb) from public, anon;
grant execute on function public.v2_public_prices(uuid), public.v2_update_public_prices(uuid, jsonb) to authenticated;
revoke all on function private.command_update_public_prices(uuid, jsonb), private.query_public_prices(uuid) from public, anon, authenticated;
