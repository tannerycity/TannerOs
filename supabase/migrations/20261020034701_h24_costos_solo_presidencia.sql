-- h24 · Costos: sólo Presidencia (20/10/2026).
-- Presidencia: "solo presidencia puede ver esto, los costos; que nomás le
-- salgan en la calculadora a la gente". Leer y guardar los costos desde Club
-- pasa de "admin" a sólo Presidencia. La lectura pública de /costos
-- (v2_public_costos) no cambia: la calculadora sigue para todos.
create or replace function private.query_public_prices(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'private'
as $$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia puede ver los costos'; end if;
  return (select settings->'publicPrices' from public.organizations where id = p_organization_id);
end $$;
revoke all on function private.query_public_prices(uuid) from public, anon, authenticated;

create or replace function private.command_update_public_prices(p_organization_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare v_actor uuid := (select auth.uid()); v jsonb; v_incluye text; c jsonb; o jsonb; x jsonb; k text;
  v_cats jsonb := '[]'; v_ops jsonb; v_lista jsonb := '[]'; v_cant jsonb; v_claves text[] := '{}'; v_dias int[];
  v_nombre text; v_clave text; n int;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia puede cambiar los costos'; end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p->'categorias') <> 'array' then raise exception 'Precios inválidos'; end if;
  if jsonb_array_length(p->'categorias') not between 1 and 8 then raise exception 'Van de 1 a 8 categorías'; end if;
  for c in select * from jsonb_array_elements(p->'categorias') loop
    v_nombre := btrim(coalesce(c->>'nombre', ''));
    v_clave := coalesce(c->>'clave', '');
    if v_nombre = '' or length(v_nombre) > 60 then raise exception 'Cada categoría lleva nombre (hasta 60 letras)'; end if;
    if v_clave !~ '^[a-z0-9-]{1,40}$' or v_clave = any(v_claves) then raise exception 'Clave de categoría inválida o repetida'; end if;
    if length(coalesce(c->>'edades', '')) > 60 then raise exception 'Las edades de % son demasiado largas', v_nombre; end if;
    if jsonb_typeof(c->'opciones') <> 'array' or jsonb_array_length(c->'opciones') not between 1 and 6 then raise exception '% lleva de 1 a 6 opciones', v_nombre; end if;
    v_ops := '[]'; v_dias := '{}';
    for o in select * from jsonb_array_elements(c->'opciones') loop
      n := private.precio_publico(jsonb_build_object('d', o->'dias'), 'd');
      if n is null or n not between 1 and 7 then raise exception 'En %, los días por semana van de 1 a 7', v_nombre; end if;
      if n = any(v_dias) then raise exception 'En % hay dos opciones con los mismos días', v_nombre; end if;
      if private.precio_publico(o, 'mensualidad') is null then raise exception 'En %, falta la mensualidad', v_nombre; end if;
      if coalesce(o->>'clave', '') !~ '^[a-z0-9-]{1,40}$' then raise exception 'Clave de opción inválida'; end if;
      v_dias := v_dias || n;
      v_ops := v_ops || jsonb_build_object('clave', o->>'clave', 'dias', n, 'mensualidad', private.precio_publico(o, 'mensualidad'));
    end loop;
    if private.precio_publico(c, 'inscripcion') is null then raise exception 'Falta la inscripción de %', v_nombre; end if;
    v_claves := v_claves || v_clave;
    v_cats := v_cats || jsonb_build_object('clave', v_clave, 'nombre', v_nombre, 'edades', btrim(coalesce(c->>'edades', '')),
      'inscripcion', private.precio_publico(c, 'inscripcion'), 'opciones', v_ops);
  end loop;
  if jsonb_typeof(p->'paquetes'->'lista') = 'array' then
    if jsonb_array_length(p->'paquetes'->'lista') > 12 then raise exception 'Hasta 12 paquetes'; end if;
    for x in select * from jsonb_array_elements(p->'paquetes'->'lista') loop
      v_nombre := btrim(coalesce(x->>'nombre', ''));
      if v_nombre = '' or length(v_nombre) > 60 then raise exception 'Cada paquete lleva nombre (hasta 60 letras)'; end if;
      if private.precio_publico(x, 'mensualidad') is null then raise exception 'Falta la mensualidad del paquete %', v_nombre; end if;
      if jsonb_typeof(x->'cantidades') <> 'object' then raise exception 'El paquete % no dice cuántos alumnos lleva', v_nombre; end if;
      v_cant := '{}';
      for k in select jsonb_object_keys(x->'cantidades') loop
        if not (k = any(v_claves)) then raise exception 'El paquete % habla de una categoría que no existe', v_nombre; end if;
        n := private.precio_publico(x->'cantidades', k);
        if n is null or n > 5 then raise exception 'En el paquete %, cada categoría lleva de 0 a 5 alumnos', v_nombre; end if;
        if n > 0 then v_cant := v_cant || jsonb_build_object(k, n); end if;
      end loop;
      if v_cant = '{}'::jsonb then raise exception 'Dile al paquete % cuántos alumnos lleva', v_nombre; end if;
      v_lista := v_lista || jsonb_build_object('clave', coalesce(nullif(x->>'clave', ''), 'paq-' || (jsonb_array_length(v_lista) + 1)),
        'nombre', v_nombre, 'cantidades', v_cant, 'mensualidad', private.precio_publico(x, 'mensualidad'));
    end loop;
  end if;
  v_incluye := nullif(btrim(coalesce(p->>'incluyeInscripcion', '')), '');
  if length(coalesce(v_incluye, '')) > 120 then raise exception 'Lo que incluye la inscripción es demasiado largo'; end if;
  v := jsonb_strip_nulls(jsonb_build_object('categorias', v_cats,
    'paquetes', jsonb_build_object('confirmado', coalesce((p->'paquetes'->>'confirmado')::boolean, false), 'lista', v_lista),
    'incluyeInscripcion', v_incluye, 'actualizado', now()));
  update public.organizations
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('publicPrices', v), updated_at = now()
   where id = p_organization_id;
  if not found then raise exception 'Organization not found'; end if;
  insert into app.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PublicPricesUpdated', 'organization', p_organization_id, v, v_actor);
  return v;
end $$;
revoke all on function private.command_update_public_prices(uuid, jsonb) from public, anon, authenticated;
