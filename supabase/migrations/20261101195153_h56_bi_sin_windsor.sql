-- h56 · Tablero ejecutivo sin Windsor (30/10/2026).
--
-- Presidencia: "no contrataremos ningún plan de pago de Windsor.ai". El tablero
-- debe seguir vivo cuando termine el trial (docs/medicion/BI-SIN-WINDSOR.md).
--
-- 1. app.bi_cuentas: qué cuenta de Google/Meta es de qué negocio (club, tcp o
--    compartido). Sólo ids públicos; ningún token vive aquí.
-- 2. app.bi_metricas_dia: un número por fuente, cuenta, métrica y día. Sólo
--    agregados y de un catálogo cerrado (private.bi_catalogo); nada de
--    personas, URLs ni textos de búsqueda.
-- 3. app.bi_sincronizaciones: cada corrida del recolector (ok, error,
--    bloqueada por permisos), para que el tablero diga "no disponible" en vez
--    de un cero falso.
-- 4. v2_bi_ingesta: la llama sólo el recolector (llave de servicio).
-- 5. v2_bi_tablero: los números para Presidencia (Administración). Lo del club
--    sale de la base de TannerOS (fuente de verdad); lo externo, de 2.
--
-- Conservación: 25 meses. La purga es propuesta aparte (supabase/propuestas/
-- bi_purga.sql); aquí no se borra nada.

create table if not exists app.bi_cuentas (
  organization_id uuid not null references public.organizations(id),
  fuente text not null,
  cuenta text not null,
  negocio text not null check (negocio in ('club', 'tcp', 'compartido')),
  nombre text not null,
  activa boolean not null default true,
  primary key (organization_id, fuente, cuenta)
);

create table if not exists app.bi_metricas_dia (
  organization_id uuid not null references public.organizations(id),
  fuente text not null,
  cuenta text not null,
  negocio text not null check (negocio in ('club', 'tcp', 'compartido')),
  metrica text not null,
  dia date not null,
  valor numeric not null check (valor >= 0),
  leido_at timestamptz not null default now(),
  primary key (organization_id, fuente, cuenta, metrica, dia)
);
create index if not exists bi_metricas_dia_negocio on app.bi_metricas_dia(organization_id, negocio, dia);

create table if not exists app.bi_sincronizaciones (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  fuente text not null,
  estado text not null check (estado in ('ok', 'error', 'bloqueada')),
  filas integer not null default 0,
  desde date,
  hasta date,
  detalle text,
  ocurrio_at timestamptz not null default now()
);
create index if not exists bi_sincronizaciones_fuente on app.bi_sincronizaciones(organization_id, fuente, ocurrio_at desc);

alter table app.bi_cuentas enable row level security;
alter table app.bi_metricas_dia enable row level security;
alter table app.bi_sincronizaciones enable row level security;
revoke all on table app.bi_cuentas, app.bi_metricas_dia, app.bi_sincronizaciones from public, anon, authenticated;

-- El catálogo cerrado: fuente -> métricas permitidas.
create or replace function private.bi_catalogo()
returns jsonb language sql immutable set search_path to '' as $$
  select jsonb_build_object(
    'ga4',            jsonb_build_array('sesiones', 'usuarios', 'leads_web', 'clics_whatsapp', 'interes_reserva', 'vista_registro'),
    'search_console', jsonb_build_array('clics', 'impresiones', 'posicion_ponderada'),
    'meta_ads',       jsonb_build_array('gasto', 'impresiones', 'alcance', 'clics', 'leads', 'conversaciones'),
    'facebook',       jsonb_build_array('seguidores', 'impresiones', 'interacciones'),
    'instagram',      jsonb_build_array('seguidores', 'alcance', 'nuevos_seguidores'),
    'gbp',            jsonb_build_array('llamadas', 'clics_web', 'indicaciones'))
$$;
revoke all on function private.bi_catalogo() from public, anon, authenticated;

-- Las cuentas conocidas (ids públicos que ya están en docs/medicion).
insert into app.bi_cuentas(organization_id, fuente, cuenta, negocio, nombre)
select '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'::uuid, v.fuente, v.cuenta, v.negocio, v.nombre
  from (values
    ('ga4', '561403621', 'club', 'TannerOS (tienda)'),
    ('ga4', '561548928', 'compartido', 'Marketing (www y TCP; se separa por hostname)'),
    ('search_console', 'sc-domain:tannerycity.com', 'compartido', 'tannerycity.com'),
    ('meta_ads', '1253862975729440', 'compartido', 'Tannery City Meta (prefijo de campaña CLUB- / TCP-)'),
    ('facebook', '166989879833376', 'club', 'Tannery City'),
    ('facebook', '727296023789322', 'tcp', 'TCP - Tannery City Park'),
    ('instagram', '17841462855563889', 'club', 'tannery_city'),
    ('instagram', '17841475095627973', 'tcp', 'tannerycitypark'),
    ('gbp', 'locations/8073241616778716043', 'club', 'Tannery City'),
    ('gbp', 'locations/7183544571864327172', 'tcp', 'TCP - Tannery City Park')
  ) as v(fuente, cuenta, negocio, nombre)
 where exists (select 1 from public.organizations o where o.id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8')
on conflict do nothing;

-- Ingesta: sólo el recolector. Valida catálogo, cuenta conocida y negocio.
-- filas: [{fuente, cuenta, negocio, metrica, dia, valor}]
create or replace function public.v2_bi_ingesta(organization_id uuid, fuente text, estado text, filas jsonb, desde date, hasta date, detalle text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_bi_ingesta.organization_id; v_cat jsonb := private.bi_catalogo(); f jsonb; v_n int := 0; v_rech int := 0;
begin
  if not (v_cat ? fuente) then raise exception 'Unknown source'; end if;
  if estado not in ('ok', 'error', 'bloqueada') then raise exception 'Invalid state'; end if;
  for f in select * from jsonb_array_elements(coalesce(filas, '[]'::jsonb)) loop
    if f->>'fuente' is distinct from fuente
       or not ((v_cat->fuente) ? (f->>'metrica'))
       or (f->>'negocio') not in ('club', 'tcp', 'compartido')
       or not exists (select 1 from app.bi_cuentas c where c.organization_id = v_org and c.fuente = v2_bi_ingesta.fuente and c.cuenta = f->>'cuenta' and c.activa)
       or coalesce((f->>'valor')::numeric, -1) < 0
       or (f->>'dia')::date > (now() at time zone 'America/Mexico_City')::date then
      v_rech := v_rech + 1; continue;
    end if;
    insert into app.bi_metricas_dia(organization_id, fuente, cuenta, negocio, metrica, dia, valor)
    values (v_org, fuente, f->>'cuenta', f->>'negocio', f->>'metrica', (f->>'dia')::date, (f->>'valor')::numeric)
    on conflict on constraint bi_metricas_dia_pkey do update set valor = excluded.valor, negocio = excluded.negocio, leido_at = now();
    v_n := v_n + 1;
  end loop;
  insert into app.bi_sincronizaciones(organization_id, fuente, estado, filas, desde, hasta, detalle)
  values (v_org, fuente, estado, v_n, desde, hasta, left(detalle, 300));
  return jsonb_build_object('guardadas', v_n, 'rechazadas', v_rech);
end $$;
revoke all on function public.v2_bi_ingesta(uuid, text, text, jsonb, date, date, text) from public, anon, authenticated;
grant execute on function public.v2_bi_ingesta(uuid, text, text, jsonb, date, date, text) to service_role;

-- Suma de una métrica externa en un periodo (null si la fuente nunca sincronizó bien).
create or replace function private.bi_suma(p_org uuid, p_fuente text, p_negocio text, p_metrica text, p_desde date, p_hasta date)
returns numeric language sql stable security definer set search_path to '' as $$
  select case when exists (select 1 from app.bi_sincronizaciones s where s.organization_id = p_org and s.fuente = p_fuente and s.estado = 'ok')
    then coalesce((select sum(m.valor) from app.bi_metricas_dia m where m.organization_id = p_org and m.fuente = p_fuente
                     and m.negocio = p_negocio and m.metrica = p_metrica and m.dia between p_desde and p_hasta), 0)
    else null end
$$;
-- Último valor (seguidores: es un total, no se suma).
create or replace function private.bi_ultimo(p_org uuid, p_fuente text, p_negocio text, p_metrica text, p_hasta date)
returns numeric language sql stable security definer set search_path to '' as $$
  select sum(x.valor) from (
    select distinct on (m.cuenta) m.valor from app.bi_metricas_dia m
     where m.organization_id = p_org and m.fuente = p_fuente and m.negocio = p_negocio and m.metrica = p_metrica and m.dia <= p_hasta
     order by m.cuenta, m.dia desc) x
$$;
revoke all on function private.bi_suma(uuid, text, text, text, date, date), private.bi_ultimo(uuid, text, text, text, date) from public, anon, authenticated;

-- El tablero. Cada KPI: valor, valor del periodo anterior, fuente y estado
-- (real | no_disponible). Nunca un cero cuando la fuente no está conectada.
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
       ('seguidores_facebook', 'facebook', 'seguidores', 'ultimo'), ('impresiones_facebook', 'facebook', 'impresiones', 'suma'),
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
