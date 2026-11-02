-- h57 (02/11/2026): Facebook con las métricas vigentes de Meta.
--
-- Meta dio de baja page_impressions en la Graph API: el recolector recibía
-- "(#100) The value must be a valid insights metric" y la fuente Facebook
-- quedaba bloqueada completa. El recolector ahora pide cada métrica por
-- separado y usa page_media_view ("visualizaciones" en Meta Business Suite).
--
-- 1. private.bi_catalogo: facebook acepta 'visualizaciones'. 'impresiones' se
--    queda para no romper filas viejas (no hay ninguna: nunca se guardó).
-- 2. v2_bi_tablero: el KPI impresiones_facebook pasa a visualizaciones_facebook.
--    Visualizaciones no son impresiones; no se guardan con esa etiqueta.
--
-- Sin cambios de tablas, permisos ni datos. Sólo redefine dos funciones; el
-- resto de v2_bi_tablero es idéntico a h56.

create or replace function private.bi_catalogo()
returns jsonb language sql immutable set search_path to '' as $$
  select jsonb_build_object(
    'ga4',            jsonb_build_array('sesiones', 'usuarios', 'leads_web', 'clics_whatsapp', 'interes_reserva', 'vista_registro'),
    'search_console', jsonb_build_array('clics', 'impresiones', 'posicion_ponderada'),
    'meta_ads',       jsonb_build_array('gasto', 'impresiones', 'alcance', 'clics', 'leads', 'conversaciones'),
    'facebook',       jsonb_build_array('seguidores', 'impresiones', 'interacciones', 'visualizaciones'),
    'instagram',      jsonb_build_array('seguidores', 'alcance', 'nuevos_seguidores'),
    'gbp',            jsonb_build_array('llamadas', 'clics_web', 'indicaciones'))
$$;
revoke all on function private.bi_catalogo() from public, anon, authenticated;

create or replace function public.v2_bi_tablero(organization_id uuid, desde date, hasta date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := v2_bi_tablero.organization_id; v_d int; v_a0 date; v_a1 date; k jsonb := '[]'::jsonb;
        r record; v_spend numeric; v_leads numeric; v_insc numeric;
begin
  if not private.has_module_access(v_org, 'admin', false) then raise exception 'Not authorized'; end if;
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

  return jsonb_build_object('desde', desde, 'hasta', hasta, 'anteriorDesde', v_a0, 'anteriorHasta', v_a1, 'kpis', k,
    'sincronizaciones', coalesce((select jsonb_agg(jsonb_build_object('fuente', s.fuente, 'estado', s.estado, 'filas', s.filas, 'cuando', s.ocurrio_at, 'detalle', s.detalle))
       from (select distinct on (x.fuente) x.* from app.bi_sincronizaciones x where x.organization_id = v_org order by x.fuente, x.ocurrio_at desc) s), '[]'::jsonb));
end $$;
revoke all on function public.v2_bi_tablero(uuid, date, date) from public, anon;
grant execute on function public.v2_bi_tablero(uuid, date, date) to authenticated;
