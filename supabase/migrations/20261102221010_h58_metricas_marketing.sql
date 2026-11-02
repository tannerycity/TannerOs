-- h58 (02/11/2026): pantalla de Métricas de marketing, también para Zul.
--
-- Presidencia: "dale con la pantalla de marketing... con métricas y todo...
-- también quiero que la vea Zul". El tablero (h56/h57) sólo lo abría quien
-- tiene Administración. Ahora:
--
-- 1. Módulo "metricas" (Métricas), que se da por persona en Usuarios, igual que
--    Encuestas (h14). Presidencia lo tiene por rol; Zul (Operaciones), sólo
--    lectura, por persona.
-- 2. private.bi_puede_ver: Presidencia, Administración o Métricas.
--    private.bi_ve_dinero: sólo Presidencia o Administración.
-- 3. v2_bi_tablero: abre con bi_puede_ver; lo cobrado (dinero del club) sólo
--    sale a quien bi_ve_dinero. El resto es idéntico a h57.
-- 4. v2_bi_serie: los mismos números agregados por día (sin personas) para
--    las gráficas, la última sincronización de cada fuente y prospectos e
--    inscripciones del club por día (sólo conteos).
-- 5. private.usage_modulos: agrega 'metricas' (h55).
--
-- Sin tablas nuevas. Sin DELETE. Sin datos de personas.

insert into public.modules(code, name, category, description, is_core, active, sort_order)
values ('metricas', 'Métricas', 'management', 'Métricas de marketing: redes, Google, web y prospectos.', false, true, 8)
on conflict (code) do nothing;

-- Disponible en los mismos planes que Dirección.
insert into public.plan_modules(plan_id, module_code, enabled)
select plan_id, 'metricas', enabled from public.plan_modules where module_code = 'direccion'
on conflict do nothing;

-- Por rol, igual que Dirección (hoy: sólo Presidencia).
insert into public.role_module_permissions(organization_id, role, module_code, can_read, can_write)
select organization_id, role, 'metricas', can_read, can_write from public.role_module_permissions where module_code = 'direccion'
on conflict do nothing;

create or replace function private.bi_puede_ver(p_org uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public','private' as $$
  select private.is_presidency(p_org) or private.has_module_access(p_org, 'admin', false) or private.has_module_access(p_org, 'metricas', false)
$$;
create or replace function private.bi_ve_dinero(p_org uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public','private' as $$
  select private.is_presidency(p_org) or private.has_module_access(p_org, 'admin', false)
$$;
revoke all on function private.bi_puede_ver(uuid), private.bi_ve_dinero(uuid) from public, anon;
grant execute on function private.bi_puede_ver(uuid), private.bi_ve_dinero(uuid) to authenticated;

create or replace function public.v2_bi_tablero(organization_id uuid, desde date, hasta date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := v2_bi_tablero.organization_id; v_d int; v_a0 date; v_a1 date; k jsonb := '[]'::jsonb;
        r record; v_spend numeric; v_leads numeric; v_insc numeric;
begin
  if not private.bi_puede_ver(v_org) then raise exception 'Not authorized'; end if;
  if desde is null or hasta is null or hasta < desde or hasta - desde > 400 then raise exception 'Invalid range'; end if;
  v_d := hasta - desde + 1; v_a1 := desde - 1; v_a0 := desde - v_d;

  -- Club: fuente de verdad, la base de TannerOS.
  for r in
    select 'club' negocio, 'prospectos' kpi, 'TannerOS · Fichajes' fuente,
           (select count(*) from app.prospects p where p.organization_id = v_org and (p.created_at at time zone 'America/Mexico_City')::date between desde and hasta)::numeric v,
           (select count(*) from app.prospects p where p.organization_id = v_org and (p.created_at at time zone 'America/Mexico_City')::date between v_a0 and v_a1)::numeric antes
    union all
    select 'club', 'inscripciones', 'TannerOS · Jugadores',
           (select count(*) from app.players p where p.organization_id = v_org and p.archived_at is null and coalesce(p.registered_at, p.joined_at, (p.created_at at time zone 'America/Mexico_City')::date) between desde and hasta)::numeric,
           (select count(*) from app.players p where p.organization_id = v_org and p.archived_at is null and coalesce(p.registered_at, p.joined_at, (p.created_at at time zone 'America/Mexico_City')::date) between v_a0 and v_a1)::numeric
    union all
    select 'club', 'cobrado', 'TannerOS · Taquilla',
           (select coalesce(sum(p.amount), 0) from app.payments p where p.organization_id = v_org and p.voided_at is null and p.payment_date between desde and hasta),
           (select coalesce(sum(p.amount), 0) from app.payments p where p.organization_id = v_org and p.voided_at is null and p.payment_date between v_a0 and v_a1)
  loop
    k := k || jsonb_build_object('negocio', r.negocio, 'kpi', r.kpi, 'valor', r.v, 'anterior', r.antes, 'fuente', r.fuente, 'estado', 'real');
  end loop;

  -- Externo, por negocio. null = la fuente no ha sincronizado nunca.
  for r in
    select n.negocio, c.kpi, c.fuente, c.metrica, c.tipo
      from (values ('club'), ('tcp'), ('compartido')) n(negocio)
     cross join (values
       ('seguidores_instagram', 'instagram', 'seguidores', 'ultimo'), ('alcance_instagram', 'instagram', 'alcance', 'suma'),
       ('seguidores_facebook', 'facebook', 'seguidores', 'ultimo'), ('visualizaciones_facebook', 'facebook', 'visualizaciones', 'suma'),
       ('gasto_meta', 'meta_ads', 'gasto', 'suma'), ('impresiones_pagadas', 'meta_ads', 'impresiones', 'suma'),
       ('leads_meta', 'meta_ads', 'leads', 'suma'), ('conversaciones_whatsapp', 'meta_ads', 'conversaciones', 'suma'),
       ('sesiones_web', 'ga4', 'sesiones', 'suma'), ('leads_web', 'ga4', 'leads_web', 'suma'), ('clics_whatsapp_web', 'ga4', 'clics_whatsapp', 'suma'),
       ('interes_reserva', 'ga4', 'interes_reserva', 'suma'),
       ('clics_google', 'search_console', 'clics', 'suma'), ('impresiones_google', 'search_console', 'impresiones', 'suma'),
       ('llamadas_google', 'gbp', 'llamadas', 'suma'), ('indicaciones_google', 'gbp', 'indicaciones', 'suma')
     ) as c(kpi, fuente, metrica, tipo)
  loop
    declare v numeric; a numeric; ok boolean := exists (select 1 from app.bi_sincronizaciones s where s.organization_id = v_org and s.fuente = r.fuente and s.estado = 'ok');
    begin
      if r.tipo = 'ultimo' then v := case when ok then private.bi_ultimo(v_org, r.fuente, r.negocio, r.metrica, hasta) end; a := case when ok then private.bi_ultimo(v_org, r.fuente, r.negocio, r.metrica, v_a1) end;
      else v := private.bi_suma(v_org, r.fuente, r.negocio, r.metrica, desde, hasta); a := private.bi_suma(v_org, r.fuente, r.negocio, r.metrica, v_a0, v_a1); end if;
      -- Un negocio sin cuenta en esa fuente no aparece (no es "cero"). Las
      -- cuentas compartidas (GA4 Marketing, Search Console) se reparten por
      -- dominio; "compartido" sólo queda para campañas de Meta sin prefijo.
      if (r.negocio <> 'compartido' and exists (select 1 from app.bi_cuentas cu where cu.organization_id = v_org and cu.fuente = r.fuente and cu.negocio in (r.negocio, 'compartido') and cu.activa))
         or (r.negocio = 'compartido' and r.fuente = 'meta_ads') then
        k := k || jsonb_build_object('negocio', r.negocio, 'kpi', r.kpi, 'valor', v, 'anterior', a, 'fuente', r.fuente,
                                     'estado', case when ok then 'real' else 'no_disponible' end);
      end if;
    end;
  end loop;

  -- Costo por lead y por inscripción: sólo si las campañas del club se separan
  -- (CLUB-) y hay gasto real. Si no, no se calcula: se dice por qué.
  v_spend := private.bi_suma(v_org, 'meta_ads', 'club', 'gasto', desde, hasta);
  select (x->>'valor')::numeric into v_leads from jsonb_array_elements(k) x where x->>'kpi' = 'prospectos';
  select (x->>'valor')::numeric into v_insc from jsonb_array_elements(k) x where x->>'kpi' = 'inscripciones';
  k := k || jsonb_build_object('negocio', 'club', 'kpi', 'costo_por_prospecto', 'fuente', 'meta_ads + TannerOS',
          'valor', case when v_spend > 0 and v_leads > 0 then round(v_spend / v_leads, 2) end,
          'estado', case when v_spend is null then 'no_disponible' when v_spend = 0 then 'no_disponible' else 'estimado' end,
          'nota', case when v_spend is null or v_spend = 0 then 'Sin gasto de campañas con prefijo CLUB- en el periodo.' else 'Atribución simple: gasto CLUB- entre prospectos del periodo, de cualquier canal.' end)
       || jsonb_build_object('negocio', 'club', 'kpi', 'costo_por_inscripcion', 'fuente', 'meta_ads + TannerOS',
          'valor', case when v_spend > 0 and v_insc > 0 then round(v_spend / v_insc, 2) end,
          'estado', case when v_spend is null or v_spend = 0 then 'no_disponible' else 'estimado' end);

  -- TCP operación: su base vive en otro proyecto (sin acceso todavía).
  k := k || jsonb_build_object('negocio', 'tcp', 'kpi', 'operacion', 'valor', null, 'estado', 'no_disponible', 'fuente', 'Supabase de TCP',
          'nota', 'Falta conectar la base de TCP (reservas, torneos, ingresos).');

  -- Lo cobrado es dinero del club: sólo Presidencia y Administración (h58).
  if not private.bi_ve_dinero(v_org) then
    k := coalesce((select jsonb_agg(x) from jsonb_array_elements(k) x where x->>'kpi' <> 'cobrado'), '[]'::jsonb);
  end if;

  return jsonb_build_object('desde', desde, 'hasta', hasta, 'anteriorDesde', v_a0, 'anteriorHasta', v_a1, 'kpis', k,
    'sincronizaciones', coalesce((select jsonb_agg(jsonb_build_object('fuente', s.fuente, 'estado', s.estado, 'filas', s.filas, 'cuando', s.ocurrio_at, 'detalle', s.detalle))
       from (select distinct on (x.fuente) x.* from app.bi_sincronizaciones x where x.organization_id = v_org order by x.fuente, x.ocurrio_at desc) s), '[]'::jsonb));
end $$;
revoke all on function public.v2_bi_tablero(uuid, date, date) from public, anon;
grant execute on function public.v2_bi_tablero(uuid, date, date) to authenticated;

-- Serie diaria para las gráficas. Sólo agregados del catálogo cerrado (h56).
create or replace function public.v2_bi_serie(organization_id uuid, desde date, hasta date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := v2_bi_serie.organization_id;
begin
  if not private.bi_puede_ver(v_org) then raise exception 'Not authorized'; end if;
  if desde is null or hasta is null or hasta < desde or hasta - desde > 400 then raise exception 'Invalid range'; end if;
  return jsonb_build_object(
    'desde', desde, 'hasta', hasta,
    'filas', coalesce((select jsonb_agg(jsonb_build_object('fuente', m.fuente, 'negocio', m.negocio, 'metrica', m.metrica, 'dia', m.dia, 'valor', m.valor) order by m.dia)
       from (select x.fuente, x.negocio, x.metrica, x.dia, sum(x.valor) valor from app.bi_metricas_dia x
              where x.organization_id = v_org and x.dia between desde and hasta group by 1, 2, 3, 4) m), '[]'::jsonb),
    'cuentas', coalesce((select jsonb_agg(distinct jsonb_build_object('fuente', c.fuente, 'negocio', c.negocio))
       from app.bi_cuentas c where c.organization_id = v_org and c.activa), '[]'::jsonb),
    'sincronizaciones', coalesce((select jsonb_agg(jsonb_build_object('fuente', s.fuente, 'estado', s.estado, 'cuando', s.ocurrio_at, 'detalle', s.detalle))
       from (select distinct on (x.fuente) x.* from app.bi_sincronizaciones x where x.organization_id = v_org order by x.fuente, x.ocurrio_at desc) s), '[]'::jsonb),
    'prospectos', coalesce((select jsonb_agg(jsonb_build_object('dia', d, 'n', n) order by d)
       from (select (p.created_at at time zone 'America/Mexico_City')::date d, count(*) n from app.prospects p
              where p.organization_id = v_org and (p.created_at at time zone 'America/Mexico_City')::date between desde and hasta group by 1) q), '[]'::jsonb),
    'inscripciones', coalesce((select jsonb_agg(jsonb_build_object('dia', d, 'n', n) order by d)
       from (select coalesce(p.registered_at, p.joined_at, (p.created_at at time zone 'America/Mexico_City')::date) d, count(*) n from app.players p
              where p.organization_id = v_org and p.archived_at is null
                and coalesce(p.registered_at, p.joined_at, (p.created_at at time zone 'America/Mexico_City')::date) between desde and hasta group by 1) q), '[]'::jsonb));
end $$;
revoke all on function public.v2_bi_serie(uuid, date, date) from public, anon;
grant execute on function public.v2_bi_serie(uuid, date, date) to authenticated;

create or replace function private.usage_modulos()
returns text[] language sql immutable set search_path to '' as $$
  select array['inicio','mensajes','club','direccion','taquilla','contabilidad','finanzas','jugadores','asistencia','becas','partidos',
    'calendario','centro_tanner','academias','formacion','prospectos','candidatos','staff','cumpleanos','encuestas','scouting','visorias',
    'cursosVerano','tienda','catalogo','utileria','estacionamiento','patrocinadores','metricas','ideas','usuarios','invitaciones','admin','cambios','qa','convocatoria']
$$;
revoke all on function private.usage_modulos() from public, anon, authenticated;

-- Zul (Operaciones): ver Métricas, por persona, sólo lectura.
insert into private.membership_module_overrides(organization_id, membership_id, module_code, can_read, can_write)
select m.organization_id, m.id, 'metricas', true, false
  from public.organization_memberships m
 where m.id = '65511245-858a-479b-a2fd-94f935ff5b83'
on conflict (organization_id, membership_id, module_code) do update set can_read = true, can_write = false, updated_at = now();
