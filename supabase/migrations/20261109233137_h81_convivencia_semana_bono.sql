-- h81 · Cultura y Convivencia, "Esta semana aprendemos" y Bono Tanner OS (09/11/2026)
--
-- Presidencia: "Arma A, B y C". Fuente de A: Cultura y Convivencia Tanner v1.0
-- OFICIAL (§8 "Aceptación, evidencia y Tanner OS"):
--   · Familia: acepta el código vigente, con versión, fecha, tutor y menores.
--     → Se reutiliza consent_documents/acceptances (el Portal ya los enseña y
--       guarda versión, fecha, tutor y Tanner). Documento nuevo:
--       'codigo_convivencia' v1.
--   · Jugador: constancia de explicación por etapa, SIN firma de niños.
--     → code_explanations: el Formador deja constancia por categoría y fecha.
--   · Formador: aceptación documentada de su código.
--     → staff_code_versions + staff_code_acceptances (no va en el Portal).
--   · Reporte de incidente: fecha, categoría, hecho observado, acción
--     protectora, responsables, nivel, seguimiento y resolución; acceso
--     limitado. → conduct_incidents + conduct_incident_entries.
--       Lo ve quien lo reportó, Dirección Deportiva y Presidencia. Familias y
--       Consejo de Familias NUNCA. Grave/urgente sube solo a Presidencia y
--       avisa por push sin nombres. Nada se borra: se da seguimiento y se
--       resuelve (lo grave lo resuelve Presidencia).
-- B: el Portal dice "Esta semana aprendemos…" con la Semana Tanner publicada
--    de la categoría del hijo, en lenguaje de papá.
-- C: Bono Tanner OS del mes: Presidencia ve el cumplimiento de planeación de
--    cada Formador (dato de los cortes, f4) y decide a mano. Sin montos ni
--    pagos automáticos; los bonos de puntualidad y asistencia quedan aparte.

-- ===================== A · Cultura y Convivencia =====================

insert into app.consent_documents(organization_id, code, title, body, version, required, active, effective_date, published_at)
select o.id, 'codigo_convivencia', 'Código de convivencia Tanner',
'RESPETAMOS. COMPETIMOS. NOS CUIDAMOS.
La familia acompaña. El profesor enseña. El Tanner piensa, resuelve y respeta.

Como familia Tanner me comprometo a:
• Animar, no dirigir: aliento sí; instrucciones tácticas desde la tribuna no.
• No insultar, amenazar, provocar, discriminar ni burlarme de árbitros, niños, rivales, entrenadores u otras familias.
• No presionar, castigar emocionalmente ni humillar por fallar, perder o no ser convocado.
• Plantear inconformidades con respeto al profesor, a Dirección Deportiva o al WhatsApp oficial.
• Respetar las decisiones deportivas, sin renunciar a preguntar, presentar una queja o denunciar un riesgo.
• No fotografiar ni difundir datos, rumores o incidentes de otros menores sin autorización.
• Saber que ninguna familia puede autorizar insultos, intimidación o maltrato del personal hacia un niño.

A mi hijo se le explicará, según su edad, el código del jugador Tanner: sin insultos, apodos con respeto, sin burlas, sin acoso ni exclusión, gestos respetuosos, sin violencia, respeto a todos, juego limpio, pedir ayuda y reparar sus errores.

Si algo pasa, se reporta al profesor, a Dirección Deportiva, a Presidencia o al WhatsApp oficial. Si el profesor está implicado no hay que reportarle primero. Ante un riesgo urgente, el club protege primero y avisa de inmediato.

Una sanción a un adulto no pasa automáticamente al hijo, ni al revés.

Mensaje después del partido: "Me encantó venir a verte jugar".

Cultura y Convivencia Tanner v1.0 · Oficial.',
1, true, true, private.hoy_mx(), now()
from public.organizations o where o.slug = 'tannery-city-fc'
on conflict (organization_id, code) do nothing;

insert into app.consent_document_versions(document_id, version, title, body, required, effective_date, published_at)
select d.id, 1, d.title, d.body, d.required, d.effective_date, d.published_at
from app.consent_documents d join public.organizations o on o.id = d.organization_id
where o.slug = 'tannery-city-fc' and d.code = 'codigo_convivencia'
on conflict (document_id, version) do nothing;

-- Código del Formador (no es un documento para familias).
create table if not exists app.staff_code_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  version int not null,
  title text not null,
  body text not null,
  effective_date date not null,
  created_at timestamptz not null default now(),
  unique (organization_id, code, version)
);
create table if not exists app.staff_code_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  version int not null,
  accepted_at timestamptz not null default now(),
  unique (organization_id, user_id, code, version)
);
alter table app.staff_code_versions enable row level security;
alter table app.staff_code_acceptances enable row level security;

insert into app.staff_code_versions(organization_id, code, version, title, body, effective_date)
select o.id, 'codigo_formador', 1, 'Código del Formador Tanner',
'EXIGIMOS MUCHO. RESPETAMOS SIEMPRE.

• Puedo alzar la voz para ser escuchado, organizar, advertir un riesgo o motivar; nunca para intimidar.
• Corrijo conductas y decisiones concretas; no etiqueto ni degrado al niño.
• Están prohibidos los insultos, las groserías dirigidas al jugador, los apodos despectivos, las humillaciones, las amenazas, los castigos físicos, usar el agotamiento como sanción y negar el agua.
• Intervengo de inmediato ante insultos, exclusión, violencia, acoso o señas ofensivas.
• Escucho a los involucrados sin exponerlos ante el grupo; no obligo a una víctima a perdonar, reconciliarse o confrontar a quien la dañó.
• Registro y escalo conforme al protocolo (Formador → Dirección Deportiva → Presidencia); jamás prometo secreto absoluto ante un riesgo para un menor.
• Ninguna petición de los padres modifica estas obligaciones.

Cultura y Convivencia Tanner v1.0 · Oficial.', private.hoy_mx()
from public.organizations o where o.slug = 'tannery-city-fc'
on conflict (organization_id, code, version) do nothing;

-- Constancia de explicación al Tanner por categoría (sin firma de niños).
create table if not exists app.code_explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null references app.categories(id) on delete cascade,
  explained_on date not null,
  explained_by uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (category_id, explained_on)
);
alter table app.code_explanations enable row level security;

-- Incidentes: acceso limitado, nada se borra.
create table if not exists app.conduct_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  occurred_on date not null,
  category_id uuid references app.categories(id) on delete set null,
  player_ids uuid[] not null default '{}',
  what_happened text not null check (btrim(what_happened) <> '' and char_length(what_happened) <= 1500),
  protective_action text check (protective_action is null or char_length(protective_action) <= 800),
  level text not null check (level in ('menor', 'reincidencia', 'grave', 'urgente')),
  involves_staff boolean not null default false,
  escalated_to text not null default 'direccion' check (escalated_to in ('direccion', 'presidencia')),
  status text not null default 'abierto' check (status in ('abierto', 'seguimiento', 'resuelto')),
  resolution text check (resolution is null or char_length(resolution) <= 1500),
  reported_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'resuelto' or (resolution is not null and resolved_at is not null))
);
create table if not exists app.conduct_incident_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null references app.conduct_incidents(id) on delete cascade,
  kind text not null check (kind in ('seguimiento', 'aviso_familia', 'escalado', 'resolucion')),
  note text not null check (btrim(note) <> '' and char_length(note) <= 1000),
  author_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists conduct_incidents_por_estado on app.conduct_incidents(organization_id, status, created_at desc);
create index if not exists conduct_incident_entries_por_caso on app.conduct_incident_entries(incident_id, created_at);
alter table app.conduct_incidents enable row level security;
alter table app.conduct_incident_entries enable row level security;

create or replace function private.convivencia_staff(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id, 'formacion', false)
      or private.has_module_access(p_organization_id, 'formacion_direccion', false)
$$;
create or replace function private.convivencia_seguimiento(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id, 'formacion_direccion', true)
$$;
revoke all on function private.convivencia_staff(uuid) from public, anon, authenticated;
revoke all on function private.convivencia_seguimiento(uuid) from public, anon, authenticated;

create or replace function private.command_accept_staff_code(p_organization_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_v app.staff_code_versions%rowtype;
begin
  if not private.convivencia_staff(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into v_v from app.staff_code_versions where organization_id = p_organization_id and code = p_code order by version desc limit 1;
  if v_v.id is null then raise exception 'Código no encontrado'; end if;
  insert into app.staff_code_acceptances(organization_id, user_id, code, version) values (p_organization_id, v_uid, p_code, v_v.version)
  on conflict (organization_id, user_id, code, version) do nothing;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'StaffCodeAccepted', 'user', v_uid, jsonb_build_object('code', p_code, 'version', v_v.version), v_uid);
  return jsonb_build_object('code', p_code, 'version', v_v.version);
end $$;

create or replace function private.command_record_code_explanation(p_organization_id uuid, p_category_id uuid, p_on date, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_on date := coalesce(p_on, private.hoy_mx());
begin
  if not (private.convivencia_seguimiento(p_organization_id) or private.has_module_access(p_organization_id, 'formacion', true)) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from app.categories where id = p_category_id and organization_id = p_organization_id) then raise exception 'Category not found'; end if;
  if v_on > private.hoy_mx() then raise exception 'La fecha no puede ser futura'; end if;
  insert into app.code_explanations(organization_id, category_id, explained_on, explained_by, note)
  values (p_organization_id, p_category_id, v_on, v_uid, nullif(btrim(p_note), ''))
  on conflict (category_id, explained_on) do nothing returning id into v_id;
  return jsonb_build_object('id', v_id, 'already', v_id is null);
end $$;

-- Quién ve un incidente: quien lo reportó, Dirección Deportiva y Presidencia.
create or replace function private.can_see_incident(p_organization_id uuid, p_incident app.conduct_incidents)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_incident.organization_id = p_organization_id
     and (private.convivencia_seguimiento(p_organization_id) or p_incident.reported_by = (select auth.uid()))
$$;
revoke all on function private.can_see_incident(uuid, app.conduct_incidents) from public, anon, authenticated;

create or replace function private.command_report_incident(p_organization_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_id uuid; v_level text := p->>'level';
  v_cat uuid := nullif(p->>'categoryId', '')::uuid; v_on date := coalesce(nullif(p->>'occurredOn', '')::date, private.hoy_mx());
  v_players uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p->'playerIds', '[]'::jsonb)) x), '{}');
  r record;
begin
  if not private.convivencia_staff(p_organization_id) then raise exception 'Not authorized'; end if;
  if v_level not in ('menor', 'reincidencia', 'grave', 'urgente') then raise exception 'Elige el nivel'; end if;
  if nullif(btrim(p->>'whatHappened'), '') is null then raise exception 'Describe lo que pasó (hechos, sin calificativos)'; end if;
  if v_on > private.hoy_mx() then raise exception 'La fecha no puede ser futura'; end if;
  if v_cat is not null and not exists (select 1 from app.categories where id = v_cat and organization_id = p_organization_id) then raise exception 'Category not found'; end if;
  if exists (select 1 from unnest(v_players) x where not exists (select 1 from app.players pl where pl.id = x and pl.organization_id = p_organization_id)) then raise exception 'Player not found'; end if;
  insert into app.conduct_incidents(organization_id, occurred_on, category_id, player_ids, what_happened, protective_action, level, involves_staff, escalated_to, reported_by)
  values (p_organization_id, v_on, v_cat, v_players, btrim(p->>'whatHappened'), nullif(btrim(p->>'protectiveAction'), ''), v_level,
          coalesce((p->>'involvesStaff')::boolean, false), case when v_level in ('grave', 'urgente') then 'presidencia' else 'direccion' end, v_uid)
  returning id into v_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'ConductIncidentReported', 'conduct_incident', v_id, jsonb_build_object('level', v_level), v_uid);
  -- Aviso sin nombres ni detalles (protección de menores): sólo que hay un reporte.
  begin
    for r in select distinct u from (select private.formation_directors(p_organization_id) u
                                     union select m.user_id from public.organization_memberships m
                                           where m.organization_id = p_organization_id and m.active and m.role = 'Presidencia'
                                             and v_level in ('grave', 'urgente')) z where u is not null and u <> v_uid loop
      perform private.notify_push(p_organization_id,
        case when v_level = 'urgente' then 'Reporte URGENTE de convivencia' when v_level = 'grave' then 'Reporte grave de convivencia' else 'Nuevo reporte de convivencia' end,
        'Ábrelo en Formación → Convivencia.', 'user', r.u::text, '/formacion/?tab=convivencia');
    end loop;
  exception when others then null;  -- un aviso que falla no detiene el reporte
  end;
  return jsonb_build_object('id', v_id, 'escalatedTo', case when v_level in ('grave', 'urgente') then 'presidencia' else 'direccion' end);
end $$;

create or replace function private.command_incident_entry(p_organization_id uuid, p_incident_id uuid, p_kind text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_i app.conduct_incidents%rowtype;
begin
  if not private.convivencia_seguimiento(p_organization_id) then raise exception 'Sólo Dirección Deportiva o Presidencia dan seguimiento'; end if;
  if p_kind not in ('seguimiento', 'aviso_familia', 'escalado', 'resolucion') then raise exception 'Tipo inválido'; end if;
  if nullif(btrim(p_note), '') is null then raise exception 'Escribe la nota'; end if;
  select * into v_i from app.conduct_incidents where id = p_incident_id and organization_id = p_organization_id for update;
  if v_i.id is null then raise exception 'Incident not found'; end if;
  if v_i.status = 'resuelto' then raise exception 'El caso ya está resuelto'; end if;
  if p_kind = 'resolucion' and v_i.escalated_to = 'presidencia' and not private.is_presidency(p_organization_id) then raise exception 'Un caso grave lo resuelve Presidencia'; end if;
  insert into app.conduct_incident_entries(organization_id, incident_id, kind, note, author_user_id) values (p_organization_id, v_i.id, p_kind, btrim(p_note), v_uid);
  update app.conduct_incidents set
    status = case when p_kind = 'resolucion' then 'resuelto' else 'seguimiento' end,
    escalated_to = case when p_kind = 'escalado' then 'presidencia' else escalated_to end,
    resolution = case when p_kind = 'resolucion' then btrim(p_note) else resolution end,
    resolved_by = case when p_kind = 'resolucion' then v_uid else resolved_by end,
    resolved_at = case when p_kind = 'resolucion' then now() else resolved_at end
  where id = v_i.id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'ConductIncidentUpdated', 'conduct_incident', v_i.id, jsonb_build_object('kind', p_kind), v_uid);
  return jsonb_build_object('id', v_i.id, 'kind', p_kind);
end $$;

-- Todo lo de Convivencia para la pantalla de Formación.
create or replace function private.query_convivencia(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_seg boolean; v_code app.staff_code_versions%rowtype; v_doc app.consent_documents%rowtype;
begin
  if not private.convivencia_staff(p_organization_id) then raise exception 'Not authorized'; end if;
  v_seg := private.convivencia_seguimiento(p_organization_id);
  select * into v_code from app.staff_code_versions where organization_id = p_organization_id and code = 'codigo_formador' order by version desc limit 1;
  select * into v_doc from app.consent_documents where organization_id = p_organization_id and code = 'codigo_convivencia' and active;
  return jsonb_build_object(
    'canFollow', v_seg, 'isPresidency', private.is_presidency(p_organization_id),
    'myCode', case when v_code.id is null then null else jsonb_build_object('code', v_code.code, 'version', v_code.version, 'title', v_code.title, 'body', v_code.body,
      'acceptedAt', (select a.accepted_at from app.staff_code_acceptances a where a.organization_id = p_organization_id and a.user_id = v_uid and a.code = v_code.code and a.version = v_code.version)) end,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'stage', c.stage,
        'lastExplained', (select max(e.explained_on) from app.code_explanations e where e.category_id = c.id),
        'families', case when v_seg and v_doc.id is not null then jsonb_build_object(
            'total', (select count(distinct p.id) from app.players p join app.player_enrollments en on en.player_id = p.id and en.category_id = c.id and en.status = 'active'
                       where p.organization_id = p_organization_id and coalesce(p.status, 'active') = 'active'),
            'accepted', (select count(distinct p.id) from app.players p join app.player_enrollments en on en.player_id = p.id and en.category_id = c.id and en.status = 'active'
                          join app.consent_acceptances ca on ca.player_id = p.id and ca.document_id = v_doc.id and ca.document_version = v_doc.version
                          where p.organization_id = p_organization_id and coalesce(p.status, 'active') = 'active')) else null end)
        order by c.sort_order, c.name)
      from app.categories c where c.organization_id = p_organization_id and coalesce(c.status, 'active') = 'active'), '[]'::jsonb),
    'staff', case when v_seg and v_code.id is not null then coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', coalesce(pr.display_name, 'Staff'), 'role', m.role,
        'acceptedAt', (select a.accepted_at from app.staff_code_acceptances a where a.organization_id = p_organization_id and a.user_id = m.user_id and a.code = v_code.code and a.version = v_code.version)) order by pr.display_name)
      from public.organization_memberships m left join public.profiles pr on pr.user_id = m.user_id
      where m.organization_id = p_organization_id and m.active
        and (m.role in ('Formadores', 'Presidencia') or m.user_id in (select private.formation_directors(p_organization_id)))), '[]'::jsonb) else null end,
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'occurredOn', i.occurred_on, 'level', i.level, 'status', i.status, 'escalatedTo', i.escalated_to,
        'category', (select c.name from app.categories c where c.id = i.category_id), 'involvesStaff', i.involves_staff,
        'players', (select coalesce(jsonb_agg(btrim(concat_ws(' ', pl.first_name, pl.last_name))), '[]'::jsonb) from app.players pl where pl.id = any(i.player_ids)),
        'whatHappened', i.what_happened, 'protectiveAction', i.protective_action, 'resolution', i.resolution,
        'reportedBy', (select pr.display_name from public.profiles pr where pr.user_id = i.reported_by), 'mine', i.reported_by = v_uid, 'createdAt', i.created_at,
        'entries', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'at', e.created_at,
            'by', (select pr.display_name from public.profiles pr where pr.user_id = e.author_user_id)) order by e.created_at)
          from app.conduct_incident_entries e where e.incident_id = i.id), '[]'::jsonb))
        order by (i.status = 'resuelto'), case i.level when 'urgente' then 0 when 'grave' then 1 when 'reincidencia' then 2 else 3 end, i.created_at desc)
      from app.conduct_incidents i where i.organization_id = p_organization_id and (v_seg or i.reported_by = v_uid)), '[]'::jsonb));
end $$;

-- ===================== B · "Esta semana aprendemos" (Portal) =====================
create or replace function public.v2_portal_week(player_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_cat app.categories%rowtype; v_hoy date := private.hoy_mx(); v_lunes date; w record;
begin
  if not private.portal_owns_player(v2_portal_week.player_id) then raise exception 'Not authorized'; end if;
  select p.organization_id into v_org from app.players p where p.id = v2_portal_week.player_id;
  select c.* into v_cat from app.player_enrollments e join app.categories c on c.id = e.category_id
   where e.player_id = v2_portal_week.player_id and e.status = 'active' and e.starts_on <= v_hoy and (e.ends_on is null or e.ends_on >= v_hoy)
   order by e.starts_on desc limit 1;
  if v_cat.id is null then return null; end if;
  v_lunes := v_hoy - (extract(isodow from v_hoy)::int - 1);
  select tw.primary_challenge, tw.secondary_challenge, tw.behavior into w from app.training_weeks tw
   where tw.organization_id = v_org and tw.category_id = v_cat.id and tw.week_start = v_lunes and tw.status = 'published' and tw.removed_at is null;
  if w.primary_challenge is null then return null; end if;
  return jsonb_build_object('category', v_cat.name, 'baby', coalesce(v_cat.stage, '') like 'baby%', 'weekStart', v_lunes,
    'primary', (select jsonb_build_object('code', fc.code, 'name', fc.name, 'question', fc.question, 'phrase', fc.phrase) from app.formation_concepts fc
                 where fc.organization_id = v_org and fc.code = w.primary_challenge and fc.kind in ('reto', 'mundo_baby')
                 order by (fc.kind = case when coalesce(v_cat.stage, '') like 'baby%' then 'mundo_baby' else 'reto' end) desc limit 1),
    'behavior', w.behavior);
end $$;

-- ===================== C · Bono Tanner OS del mes =====================
create table if not exists app.staff_bonus_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  kind text not null default 'tanner_os' check (kind in ('tanner_os')),
  compliance numeric(5,1),
  decision text not null check (decision in ('aprobado', 'no_aprobado')),
  note text check (note is null or char_length(note) <= 300),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  unique (organization_id, user_id, month, kind)
);
alter table app.staff_bonus_reviews enable row level security;

create or replace function private.query_bonus_month(p_organization_id uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_mes date := date_trunc('month', coalesce(p_month, private.hoy_mx()))::date;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia decide los bonos'; end if;
  return jsonb_build_object('month', v_mes, 'people', coalesce((
    select jsonb_agg(jsonb_build_object('userId', x.uid, 'name', coalesce((select pr.display_name from public.profiles pr where pr.user_id = x.uid), 'Formador'),
        'weeks', x.semanas, 'met', x.cumplidas, 'pendingReview', x.revision,
        'pct', round(100.0 * x.cumplidas / nullif(x.semanas - x.revision, 0), 1),
        'review', (select jsonb_build_object('decision', b.decision, 'note', b.note, 'at', b.decided_at,
                    'by', (select pr.display_name from public.profiles pr where pr.user_id = b.decided_by))
                   from app.staff_bonus_reviews b where b.organization_id = p_organization_id and b.user_id = x.uid and b.month = v_mes and b.kind = 'tanner_os'))
      order by (select pr.display_name from public.profiles pr where pr.user_id = x.uid))
    from (select c.responsible_user_id uid, count(*) semanas,
                 count(*) filter (where coalesce(c.resolved_status, c.status) = 'cumplido') cumplidas,
                 count(*) filter (where c.status = 'revision' and c.resolved_status is null) revision
          from app.planning_cutoffs c
          where c.organization_id = p_organization_id and c.responsible_user_id is not null
            and date_trunc('month', c.week_start) = v_mes
          group by 1) x), '[]'::jsonb));
end $$;

create or replace function private.command_decide_bonus(p_organization_id uuid, p_user_id uuid, p_month date, p_decision text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_mes date := date_trunc('month', p_month)::date; v_pct numeric; v_old text;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia decide los bonos'; end if;
  if p_decision not in ('aprobado', 'no_aprobado') then raise exception 'Decisión inválida'; end if;
  if v_mes > date_trunc('month', private.hoy_mx())::date then raise exception 'Ese mes todavía no llega'; end if;
  select round(100.0 * count(*) filter (where coalesce(c.resolved_status, c.status) = 'cumplido')
               / nullif(count(*) - count(*) filter (where c.status = 'revision' and c.resolved_status is null), 0), 1) into v_pct
    from app.planning_cutoffs c where c.organization_id = p_organization_id and c.responsible_user_id = p_user_id and date_trunc('month', c.week_start) = v_mes;
  select decision into v_old from app.staff_bonus_reviews where organization_id = p_organization_id and user_id = p_user_id and month = v_mes and kind = 'tanner_os';
  insert into app.staff_bonus_reviews(organization_id, user_id, month, kind, compliance, decision, note, decided_by)
  values (p_organization_id, p_user_id, v_mes, 'tanner_os', v_pct, p_decision, nullif(btrim(p_note), ''), v_uid)
  on conflict (organization_id, user_id, month, kind) do update set compliance = excluded.compliance, decision = excluded.decision,
    note = excluded.note, decided_by = v_uid, decided_at = now();
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'StaffBonusDecided', 'user', p_user_id, jsonb_build_object('month', v_mes, 'kind', 'tanner_os', 'before', v_old, 'after', p_decision, 'compliance', v_pct), v_uid);
  return jsonb_build_object('userId', p_user_id, 'month', v_mes, 'decision', p_decision, 'compliance', v_pct);
end $$;

-- ===================== Permisos =====================
revoke all on function private.command_accept_staff_code(uuid, text) from public, anon, authenticated;
revoke all on function private.command_record_code_explanation(uuid, uuid, date, text) from public, anon, authenticated;
revoke all on function private.command_report_incident(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.command_incident_entry(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.query_convivencia(uuid) from public, anon, authenticated;
revoke all on function private.query_bonus_month(uuid, date) from public, anon, authenticated;
revoke all on function private.command_decide_bonus(uuid, uuid, date, text, text) from public, anon, authenticated;

create or replace function public.v2_accept_staff_code(organization_id uuid, code text)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_accept_staff_code(organization_id, code) $$;
create or replace function public.v2_record_code_explanation(organization_id uuid, category_id uuid, explained_on date default null, note text default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_record_code_explanation(organization_id, category_id, explained_on, note) $$;
create or replace function public.v2_report_incident(organization_id uuid, incident jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_report_incident(organization_id, incident) $$;
create or replace function public.v2_incident_entry(organization_id uuid, incident_id uuid, kind text, note text)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_incident_entry(organization_id, incident_id, kind, note) $$;
create or replace function public.v2_convivencia(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.query_convivencia(organization_id) $$;
create or replace function public.v2_bonus_month(organization_id uuid, month date default null)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.query_bonus_month(organization_id, month) $$;
create or replace function public.v2_decide_bonus(organization_id uuid, user_id uuid, month date, decision text, note text default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_decide_bonus(organization_id, user_id, month, decision, note) $$;

revoke all on function public.v2_accept_staff_code(uuid, text) from public, anon;
revoke all on function public.v2_record_code_explanation(uuid, uuid, date, text) from public, anon;
revoke all on function public.v2_report_incident(uuid, jsonb) from public, anon;
revoke all on function public.v2_incident_entry(uuid, uuid, text, text) from public, anon;
revoke all on function public.v2_convivencia(uuid) from public, anon;
revoke all on function public.v2_bonus_month(uuid, date) from public, anon;
revoke all on function public.v2_decide_bonus(uuid, uuid, date, text, text) from public, anon;
revoke all on function public.v2_portal_week(uuid) from public, anon;
grant execute on function public.v2_accept_staff_code(uuid, text) to authenticated;
grant execute on function public.v2_record_code_explanation(uuid, uuid, date, text) to authenticated;
grant execute on function public.v2_report_incident(uuid, jsonb) to authenticated;
grant execute on function public.v2_incident_entry(uuid, uuid, text, text) to authenticated;
grant execute on function public.v2_convivencia(uuid) to authenticated;
grant execute on function public.v2_bonus_month(uuid, date) to authenticated;
grant execute on function public.v2_decide_bonus(uuid, uuid, date, text, text) to authenticated;
grant execute on function public.v2_portal_week(uuid) to authenticated;
