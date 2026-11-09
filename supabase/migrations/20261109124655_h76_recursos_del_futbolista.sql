-- PROPUESTA · PROP-FC-002 · Recursos del Futbolista Tanner (09/11/2026)
--
-- Autorizada por Presidencia el 09/11/2026 (10 familias, Cuerpo transversal;
-- anticipar, comunicar y ejecutar se quedan como recursos de la Metodología).
-- Archivo GENERADO: se edita scripts/formacion/fc1-esquema.sql o la semilla
-- supabase/semillas/formacion/recursos-v0.1.json y se corre
-- node scripts/formacion/sql-recursos.mjs.
--
-- Qué hace (y qué no):
--   · Reutiliza app.formation_concepts (ya tiene kind 'recurso'): agrega el
--     kind 'familia_recurso' y carga las 10 familias del mapa 04 con sus
--     recursos. Recurso = herramienta para resolver un Reto; NO es un Reto.
--     Los 9 Retos, los 4 niveles, las 36 + 24 tareas y las 5 dimensiones no
--     se tocan.
--   · task_resource_tags: tarea ↔ recurso, muchos a muchos, PRINCIPAL o
--     COMPLEMENTARIA, con estado sugerida → aprobada / descartada. El Formador
--     (o la carga) sugiere; sólo Dirección Deportiva aprueba (mapa 04 §8).
--   · El catálogo que ve el Formador sólo trae etiquetas APROBADAS; el
--     recomendador sólo cuenta ésas. Dirección ve también las sugeridas.
--   · Sólo Banco Tanner: Baby conserva sus 4 mundos (mapa 04 §5).
--   · Cada cambio de etiqueta deja evento con antes y después.

alter table app.formation_concepts drop constraint if exists formation_concepts_kind_check;
alter table app.formation_concepts add constraint formation_concepts_kind_check
  check (kind in ('reto','nivel','mundo_baby','recurso','especialidad','etapa','skill','familia_recurso'));

create table if not exists app.task_resource_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references app.training_tasks(id) on delete cascade,
  resource_id uuid not null references app.formation_concepts(id) on delete restrict,
  relevance text not null check (relevance in ('principal','complementaria')),
  status text not null default 'sugerida' check (status in ('sugerida','aprobada','descartada')),
  source text,
  note text check (note is null or char_length(note) <= 300),
  proposed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, resource_id),
  check (status <> 'aprobada' or approved_at is not null)
);
create index if not exists task_resource_tags_por_recurso on app.task_resource_tags(organization_id, resource_id) where status = 'aprobada';
alter table app.task_resource_tags enable row level security;

-- Sugerir (Formador o Dirección) o decidir (sólo Dirección).
create or replace function private.command_set_task_resource(p_organization_id uuid, p_task_id uuid, p_resource_code text,
  p_relevance text, p_status text default 'sugerida', p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_dir boolean := private.has_module_access(p_organization_id, 'formacion_direccion', true);
  v_task app.training_tasks%rowtype; v_res app.formation_concepts%rowtype; v_old app.task_resource_tags%rowtype; v_new app.task_resource_tags%rowtype;
begin
  if not (v_dir or private.has_module_access(p_organization_id, 'formacion', true)) then raise exception 'Not authorized'; end if;
  if p_relevance not in ('principal','complementaria') then raise exception 'Relevancia inválida'; end if;
  if p_status not in ('sugerida','aprobada','descartada') then raise exception 'Estado inválido'; end if;
  if p_status <> 'sugerida' and not v_dir then raise exception 'Sólo Dirección Deportiva aprueba o descarta etiquetas'; end if;
  select * into v_task from app.training_tasks where id = p_task_id and organization_id = p_organization_id;
  if v_task.id is null then raise exception 'Task not found'; end if;
  if v_task.bank <> 'tanner' then raise exception 'Las tareas Baby se trabajan por mundos, no por recursos'; end if;
  if v_task.status <> 'oficial' then raise exception 'Sólo se etiquetan tareas oficiales'; end if;
  select * into v_res from app.formation_concepts where organization_id = p_organization_id and kind = 'recurso' and code = p_resource_code and active;
  if v_res.id is null then raise exception 'Recurso no encontrado'; end if;
  select * into v_old from app.task_resource_tags where task_id = p_task_id and resource_id = v_res.id for update;
  -- Un Formador no reabre lo que Dirección ya decidió.
  if v_old.id is not null and not v_dir and v_old.status <> 'sugerida' then raise exception 'Dirección Deportiva ya decidió esta etiqueta'; end if;
  insert into app.task_resource_tags(organization_id, task_id, resource_id, relevance, status, note, proposed_by, approved_by, approved_at, updated_by)
  values (p_organization_id, p_task_id, v_res.id, p_relevance, p_status, nullif(btrim(p_note), ''), v_uid,
          case when p_status = 'aprobada' then v_uid end, case when p_status = 'aprobada' then now() end, v_uid)
  on conflict (task_id, resource_id) do update set relevance = excluded.relevance, status = excluded.status,
    note = coalesce(excluded.note, app.task_resource_tags.note),
    approved_by = case when excluded.status = 'aprobada' then v_uid else null end,
    approved_at = case when excluded.status = 'aprobada' then now() else null end,
    updated_by = v_uid, updated_at = now()
  returning * into v_new;
  if v_old.id is null or v_old.status is distinct from v_new.status or v_old.relevance is distinct from v_new.relevance then
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (p_organization_id, 'TaskResourceTagChanged', 'training_task', p_task_id,
            jsonb_build_object('resource', p_resource_code,
              'before', case when v_old.id is null then null else jsonb_build_object('relevance', v_old.relevance, 'status', v_old.status) end,
              'after', jsonb_build_object('relevance', v_new.relevance, 'status', v_new.status)), v_uid);
  end if;
  return jsonb_build_object('id', v_new.id, 'resource', p_resource_code, 'relevance', v_new.relevance, 'status', v_new.status);
end $$;
revoke all on function private.command_set_task_resource(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.v2_set_task_resource(organization_id uuid, task_id uuid, resource_code text, relevance text,
  status text default 'sugerida', note text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select private.command_set_task_resource(organization_id, task_id, resource_code, relevance, status, note) $$;
revoke all on function public.v2_set_task_resource(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.v2_set_task_resource(uuid, uuid, text, text, text, text) to authenticated;

-- El catálogo de siempre (b4) + los recursos de cada tarea.
create or replace function private.formation_catalog(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_dir boolean;
begin
  if not (private.has_module_access(p_organization_id, 'formacion', false)
       or private.has_module_access(p_organization_id, 'formacion_direccion', false)) then
    raise exception 'Not authorized';
  end if;
  v_dir := private.has_module_access(p_organization_id, 'formacion_direccion', false);
  return jsonb_build_object(
    'concepts', coalesce((
      select jsonb_agg(jsonb_build_object('kind', c.kind, 'code', c.code, 'name', c.name, 'question', c.question,
               'phrase', c.phrase, 'attrs', c.attrs) order by c.kind, c.sort_order)
      from app.formation_concepts c
      where c.organization_id = p_organization_id and c.active), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'bank', t.bank, 'code', t.code, 'version', t.version, 'name', t.name,
               'primary', t.primary_concept, 'level', t.level, 'related', to_jsonb(t.related_concepts),
               'ageMin', t.age_min, 'ageMax', t.age_max, 'stages', to_jsonb(t.stages), 'minutes', t.minutes,
               'playersMin', t.players_min, 'playersMax', t.players_max,
               'buscamos', t.buscamos, 'montaje', t.montaje, 'juega', t.juega, 'dile', to_jsonb(t.dile), 'observa', t.observa,
               'easier', t.easier, 'harder', t.harder, 'space', t.space_note, 'adapta', t.adapta,
               'videoGuide', t.video_guide, 'videoFileId', t.video_file_id, 'variants', t.variants, 'status', t.status,
               'resources', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'relevance', r.relevance, 'status', r.status)
                                             order by r.relevance desc, c.sort_order)
                                      from app.task_resource_tags r join app.formation_concepts c on c.id = r.resource_id
                                      where r.task_id = t.id and (r.status = 'aprobada' or (v_dir and r.status = 'sugerida'))), '[]'::jsonb))
             order by t.bank desc, t.code)
      from app.training_tasks t
      where t.organization_id = p_organization_id
        and (t.status = 'oficial' or (v_dir and t.status = 'propuesta'))), '[]'::jsonb)
  );
end $$;
revoke all on function private.formation_catalog(uuid) from public, anon, authenticated;

-- ===== Semilla (generada: node scripts/formacion/sql-recursos.mjs tannery-city-fc) =====
-- Fuente: PROP-FC-002 · 04_MAPA_RECURSOS_36_TAREAS.pdf, sección 3 (Catálogo inicial de recursos, PROPUESTO). Nombres de familia y ejemplos tal como vienen; no se agregan acciones.
insert into app.formation_concepts(organization_id,kind,code,name,question,phrase,sort_order,version,attrs) values
((select id from public.organizations where slug='tannery-city-fc'),'familia_recurso','dominio_control','Dominio y control',null,'Baby con juego propio; T6–T12 progresivo',1,'0.1','{"retos":["balon","1v1","avanzar","cancha"],"transversal":false,"estado":"propuesto","fuente":"PROP-FC-002 · 04"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'familia_recurso','pase_recepcion','Pase y recepción',null,'Variar distancia y presión',2,'0.1','{"retos":["jugar_juntos","ventaja","cancha"],"transversal":false,"estado":"propuesto","fuente":"PROP-FC-002 · 04"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'familia_recurso','finta_duelo','Finta y duelo',null,'Graduar oposición',3,'0.1','{"retos":["1v1","avanzar","defender"],"transversal":false,"estado":"propuesto","fuente":"PROP-FC-002 · 04"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'familia_recurso','finalizacion','Finalización',null,'Priorizar decisiones, no solo repeticiones',4,'0.1','{"retos":["gol","reaccionar","1v1"],"transversal":false,"estado":"propuesto","fuente":"PROP-FC-002 · 04"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'familia_recurso','ubicacion_apoyo','Ubicación y apoyo',null,'Lenguaje simple por edad',5,'0.1','{"retos":["cancha","jugar_juntos","ventaja"],"transversal":false,"estado":"propuesto","fuente":"PROP-FC-002 · 04"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'familia_recurso','ataque_defensa','Ataque y defensa',null,'Aprender jugando antes que memorizar sistemas',6,'0.1','{"retos":["ventaja","defender","reaccionar"],"transversal":false,"estado":"propuesto","fuente":"PROP-FC-002 · 04"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'familia_recurso','reinicios','Reinicios',null,'Enseñar reglas del formato de juego correspondiente',7,'0.1','{"retos":["reaccionar","gol","avanzar","jugar_juntos"],"transversal":false,"estado":"propuesto","fuente":"PROP-FC-002 · 04"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'familia_recurso','especialidades','Especialidades',null,'Rotación de posiciones según etapa',8,'0.1','{"retos":[],"transversal":false,"estado":"propuesto","fuente":"PROP-FC-002 · 04"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'familia_recurso','cuerpo','Cuerpo',null,'Sin cargas físicas universales; adaptar a etapa y seguridad',9,'0.1','{"retos":[],"transversal":true,"estado":"propuesto","fuente":"PROP-FC-002 · 04"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'familia_recurso','juego_aereo','Juego aéreo',null,'Progresivo y bajo protocolo de seguridad para menores',10,'0.1','{"retos":["balon","gol","defender"],"transversal":false,"estado":"propuesto","fuente":"PROP-FC-002 · 04"}'::jsonb)
on conflict (organization_id, kind, code) do nothing;

-- Recursos: los nuevos entran; los de la Metodología v1.1 que ya existen
-- (mirar, perfilarse, engañar, temporizar, cambiar el ritmo) sólo ganan su
-- familia: no cambia su nombre, su versión ni su texto.
insert into app.formation_concepts(organization_id,kind,code,name,question,phrase,sort_order,version,attrs) values
((select id from public.organizations where slug='tannery-city-fc'),'recurso','conduccion','Conducción',null,null,100,'0.1','{"familia":"dominio_control","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','parar','Parar',null,null,101,'0.1','{"familia":"dominio_control","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','orientar','Orientar',null,null,102,'0.1','{"familia":"dominio_control","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','ambos_pies','Usar ambos pies',null,null,103,'0.1','{"familia":"dominio_control","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','cambio_direccion','Cambios de dirección',null,null,104,'0.1','{"familia":"dominio_control","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','autopase','Autopase',null,null,105,'0.1','{"familia":"dominio_control","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','pase_interior','Pase con interior',null,null,100,'0.1','{"familia":"pase_recepcion","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','pase_exterior','Pase con exterior',null,null,101,'0.1','{"familia":"pase_recepcion","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','pase_empeine','Pase con empeine',null,null,102,'0.1','{"familia":"pase_recepcion","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','pase_movimiento','Pase en movimiento',null,null,103,'0.1','{"familia":"pase_recepcion","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','control_orientado','Control orientado',null,null,104,'0.1','{"familia":"pase_recepcion","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','pared','Pared',null,null,105,'0.1','{"familia":"pase_recepcion","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','enganar','Engañar',null,null,100,'0.1','{"familia":"finta_duelo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','proteger','Proteger',null,null,101,'0.1','{"familia":"finta_duelo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','acelerar','Acelerar',null,null,102,'0.1','{"familia":"finta_duelo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','encarar','Encarar',null,null,103,'0.1','{"familia":"finta_duelo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','temporizar','Temporizar',null,null,104,'0.1','{"familia":"finta_duelo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','cambiar_ritmo','Cambiar el ritmo',null,null,105,'0.1','{"familia":"finta_duelo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','tiro_parado','Tiro parado',null,null,100,'0.1','{"familia":"finalizacion","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','tiro_movimiento','Tiro en movimiento',null,null,101,'0.1','{"familia":"finalizacion","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','remate','Remate tras control o autopase',null,null,102,'0.1','{"familia":"finalizacion","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','rebote','Rebote',null,null,103,'0.1','{"familia":"finalizacion","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','separarse','Separarse',null,null,100,'0.1','{"familia":"ubicacion_apoyo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','linea_pase','Crear línea de pase',null,null,101,'0.1','{"familia":"ubicacion_apoyo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','mirar','Mirar',null,null,102,'0.1','{"familia":"ubicacion_apoyo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','perfilarse','Perfilarse',null,null,103,'0.1','{"familia":"ubicacion_apoyo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','tercer_hombre','Tercer hombre',null,null,104,'0.1','{"familia":"ubicacion_apoyo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','superioridad','Superioridades',null,null,100,'0.1','{"familia":"ataque_defensa","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','cobertura','Cobertura',null,null,101,'0.1','{"familia":"ataque_defensa","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','marcaje','Marcaje',null,null,102,'0.1','{"familia":"ataque_defensa","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','presion','Presión',null,null,103,'0.1','{"familia":"ataque_defensa","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','recuperar','Recuperar',null,null,104,'0.1','{"familia":"ataque_defensa","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','cambio_rol','Cambio de rol',null,null,105,'0.1','{"familia":"ataque_defensa","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','saque_banda','Saque de banda',null,null,100,'0.1','{"familia":"reinicios","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','saque_meta','Saque de meta',null,null,101,'0.1','{"familia":"reinicios","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','corner','Córner',null,null,102,'0.1','{"familia":"reinicios","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','faltas_tiros_libres','Faltas y tiros libres',null,null,103,'0.1','{"familia":"reinicios","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','portero_pies_area','Pies y área de portero',null,null,100,'0.1','{"familia":"especialidades","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','duelo_cobertura','Duelo y cobertura',null,null,101,'0.1','{"familia":"especialidades","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','conectar','Conectar',null,null,102,'0.1','{"familia":"especialidades","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','aparecer_definir','Aparecer y definir',null,null,103,'0.1','{"familia":"especialidades","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','correr','Correr',null,null,100,'0.1','{"familia":"cuerpo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','aceleracion','Acelerar (cuerpo)',null,null,101,'0.1','{"familia":"cuerpo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','frenar','Frenar',null,null,102,'0.1','{"familia":"cuerpo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','saltar','Saltar',null,null,103,'0.1','{"familia":"cuerpo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','aterrizar','Aterrizar',null,null,104,'0.1','{"familia":"cuerpo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','equilibrio','Equilibrio',null,null,105,'0.1','{"familia":"cuerpo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','coordinacion','Coordinación',null,null,106,'0.1','{"familia":"cuerpo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','lectura_trayectoria','Lectura de trayectoria',null,null,100,'0.1','{"familia":"juego_aereo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','ubicacion_aerea','Ubicación en el juego aéreo',null,null,101,'0.1','{"familia":"juego_aereo","estado":"propuesto"}'::jsonb),
((select id from public.organizations where slug='tannery-city-fc'),'recurso','tecnica_aerea','Técnica apropiada',null,null,102,'0.1','{"familia":"juego_aereo","estado":"propuesto"}'::jsonb)
on conflict (organization_id, kind, code) do update
  set attrs = app.formation_concepts.attrs || jsonb_build_object('familia', excluded.attrs->>'familia'), updated_at = now()
  where not (app.formation_concepts.attrs ? 'familia');

-- Etiquetas: sólo las 4 que el mapa sugiere tarea por tarea, como SUGERIDAS.
insert into app.task_resource_tags(organization_id, task_id, resource_id, relevance, status, source, note)
select (select id from public.organizations where slug='tannery-city-fc'), tt.id, c.id, 'principal', 'sugerida', 'PROP-FC-002 · 04 · caso de prueba', 'Conducir para atraer al defensor y decidir entre avanzar o pasar.'
     from app.training_tasks tt, app.formation_concepts c
    where tt.organization_id = (select id from public.organizations where slug='tannery-city-fc') and tt.bank = 'tanner' and tt.code = '10' and tt.status = 'oficial'
      and c.organization_id = (select id from public.organizations where slug='tannery-city-fc') and c.kind = 'recurso' and c.code = 'conduccion'
union all
select (select id from public.organizations where slug='tannery-city-fc'), tt.id, c.id, 'principal', 'sugerida', 'PROP-FC-002 · 04 · caso de prueba', 'Reconocer cuándo conducir y cuándo asociarse en juego.'
     from app.training_tasks tt, app.formation_concepts c
    where tt.organization_id = (select id from public.organizations where slug='tannery-city-fc') and tt.bank = 'tanner' and tt.code = '12' and tt.status = 'oficial'
      and c.organization_id = (select id from public.organizations where slug='tannery-city-fc') and c.kind = 'recurso' and c.code = 'conduccion'
union all
select (select id from public.organizations where slug='tannery-city-fc'), tt.id, c.id, 'complementaria', 'sugerida', 'PROP-FC-002 · 04 · caso de prueba', 'Genera apoyo para quien conduce, pero no necesita conducción para cumplir el objetivo original.'
     from app.training_tasks tt, app.formation_concepts c
    where tt.organization_id = (select id from public.organizations where slug='tannery-city-fc') and tt.bank = 'tanner' and tt.code = '09' and tt.status = 'oficial'
      and c.organization_id = (select id from public.organizations where slug='tannery-city-fc') and c.kind = 'recurso' and c.code = 'conduccion'
union all
select (select id from public.organizations where slug='tannery-city-fc'), tt.id, c.id, 'complementaria', 'sugerida', 'PROP-FC-002 · 04 · caso de prueba', 'Conducción opcional para atraer antes de conectar, sin hacerla obligatoria.'
     from app.training_tasks tt, app.formation_concepts c
    where tt.organization_id = (select id from public.organizations where slug='tannery-city-fc') and tt.bank = 'tanner' and tt.code = '11' and tt.status = 'oficial'
      and c.organization_id = (select id from public.organizations where slug='tannery-city-fc') and c.kind = 'recurso' and c.code = 'conduccion'
on conflict (task_id, resource_id) do nothing;
