-- h54 · Visoría con consentimiento informado, expediente y control de acceso (29/10/2026).
--
-- Presidencia: "que cada menor cuente con una autorización válida, verificable
-- y auditable antes de entrar a una visoría". Paquete docs/visorias/ (00 a 03).
--
-- Lo que había (h53): una casilla genérica, la firma y la salud dentro de
-- prospects.metadata.visoria, y la salud visible para todo Fichajes. Nada se
-- borra: el registro viejo queda como estaba y cuenta como "sin consentimiento"
-- hasta que la familia firme con este flujo.
--
-- 1. Módulo visoria_salud: la ficha de salud sólo la abre quien lo tiene
--    (Presidencia). Coordinadores ven el estado de la revisión, no el detalle.
-- 2. visoria_campaigns gana la configuración legal del evento (legal_config),
--    el estado real del seguro y su verificación.
-- 3. visoria_documents: plantillas (consentimiento, aviso, cláusula con y sin
--    seguro) y los documentos aprobados de cada visoría. Lo aprobado no se
--    edita: cambiar algo es otra versión.
-- 4. visoria_approvals: aprobación legal, operativa y de seguridad. Cada una
--    vale para la "huella" (hash) del evento con la que se dio: si cambia lo
--    material (sede, organizador, seguro, evaluador, textos), deja de valer
--    sola y los consentimientos firmados piden firma nueva.
-- 5. visoria_sign_links: la liga de cada familia (sólo se guarda su hash).
-- 6. visoria_consents: el expediente. Texto exacto firmado, hashes, elecciones
--    una por una, firma, hora del servidor. Inmutable (trigger); sólo avanza
--    su estado: expediente pendiente -> verificar identidad -> firmado.
-- 7. visoria_health: salud mínima, aparte y restringida; sólo existe si hubo
--    consentimiento expreso para datos sensibles.
-- 8. visoria_audit, visoria_media_history, visoria_transfers,
--    visoria_incidents y visoria_incident_entries: append-only.
-- 9. Bucket privado tanneros-visoria-expedientes (PDF). Sin políticas: sólo
--    la función visoria-expediente (llave de servicio) lee y escribe.

-- ---------- 1. Módulo de salud de visoría ----------
insert into public.modules(code, name, category, description, is_core, active, sort_order)
values ('visoria_salud', 'Visoría · Salud', 'management',
        'Abrir la ficha de salud de quien se inscribe a una visoría y resolver la revisión médica. Dato sensible: sólo quien lo necesita.',
        false, true, 7)
on conflict (code) do nothing;
insert into public.plan_modules(plan_id, module_code, enabled)
select plan_id, 'visoria_salud', enabled from public.plan_modules where module_code = 'direccion'
on conflict do nothing;
insert into public.role_module_permissions(organization_id, role, module_code, can_read, can_write)
select r.organization_id, r.role, 'visoria_salud', true, true
  from public.role_module_permissions r
 where r.role = 'Presidencia' and r.module_code = 'admin' and r.can_write
on conflict (organization_id, role, module_code) do nothing;

-- ---------- 2. Configuración legal del evento ----------
alter table app.visoria_campaigns
  add column if not exists legal_config jsonb not null default '{}'::jsonb,
  add column if not exists insurance_status text not null default 'sin_verificar',
  add column if not exists insurance_detail text,
  add column if not exists insurance_verified_by uuid,
  add column if not exists insurance_verified_at timestamptz;
do $$ begin
  alter table app.visoria_campaigns add constraint visoria_campaigns_insurance_status_check
    check (insurance_status in ('sin_verificar', 'sin_seguro_verificado', 'con_seguro_verificado'));
exception when duplicate_object then null; end $$;

-- Lo que el club ya publica en su aviso de privacidad vigente (v2). Lo demás
-- (razón social, coordinadores, horario, encargados...) lo llena Presidencia:
-- no se inventa.
update app.visoria_campaigns
   set legal_config = jsonb_build_object(
         'organizador_domicilio', 'Españita #1305, Col. Bugambilias, C.P. 37270, León, Guanajuato, México',
         'privacidad_correo', 'tannery.city.1850@gmail.com',
         'privacidad_contacto', 'WhatsApp oficial de Tannery City: 479 265 1338',
         'url_aviso', 'https://app.tannerycity.com/visoria') || legal_config
 where slug = 'visoria-noviembre-2026' and legal_config = '{}'::jsonb;

-- ---------- 3. Documentos ----------
create table if not exists app.visoria_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  campaign_id uuid references app.visoria_campaigns(id),
  kind text not null check (kind in ('consentimiento', 'privacidad', 'clausula_sin_seguro', 'clausula_con_seguro')),
  version text not null,
  title text not null,
  body text not null,
  content_hash text not null,
  status text not null check (status in ('plantilla', 'retirada', 'aprobado', 'reemplazado')),
  source_template_ids jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  retired_at timestamptz
);
create unique index if not exists visoria_documents_una_plantilla
  on app.visoria_documents(organization_id, kind) where campaign_id is null and status = 'plantilla';
create unique index if not exists visoria_documents_uno_aprobado
  on app.visoria_documents(campaign_id, kind) where campaign_id is not null and status = 'aprobado';
alter table app.visoria_documents enable row level security;
revoke all on table app.visoria_documents from public, anon, authenticated;

-- ---------- 4. Aprobaciones ----------
create table if not exists app.visoria_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  campaign_id uuid not null references app.visoria_campaigns(id),
  gate text not null check (gate in ('legal', 'operativa', 'seguridad')),
  event_hash text not null,
  note text not null,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text
);
alter table app.visoria_approvals enable row level security;
revoke all on table app.visoria_approvals from public, anon, authenticated;

-- ---------- 5. Liga de cada familia ----------
create table if not exists app.visoria_sign_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  campaign_id uuid not null references app.visoria_campaigns(id),
  prospect_id uuid not null references app.prospects(id),
  token_hash text not null unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists visoria_sign_links_prospect on app.visoria_sign_links(prospect_id);
alter table app.visoria_sign_links enable row level security;
revoke all on table app.visoria_sign_links from public, anon, authenticated;

-- ---------- 6. El expediente ----------
create table if not exists app.visoria_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  campaign_id uuid not null references app.visoria_campaigns(id),
  prospect_id uuid not null references app.prospects(id),
  sign_link_id uuid references app.visoria_sign_links(id),
  idempotency_key text not null unique,
  -- quien firma
  signer_name text not null,
  relationship text not null check (relationship in ('madre', 'padre', 'tutor_legal', 'otro')),
  relationship_detail text,
  signer_phone text not null,
  signer_email text,
  -- lo firmado
  event_snapshot jsonb not null,
  event_hash text not null,
  consent_document_id uuid not null references app.visoria_documents(id),
  consent_text text not null,
  consent_text_hash text not null,
  privacy_document_id uuid not null references app.visoria_documents(id),
  privacy_hash text not null,
  insurance_status text not null,
  choices jsonb not null,
  emergency jsonb not null,
  pickup text,
  signature_png text not null,
  signature_hash text not null,
  signature_stats jsonb not null,
  ui_version text,
  user_agent text,
  signed_at timestamptz not null default now(),
  timezone text not null default 'America/Mexico_City',
  evidence_hash text not null,
  -- lo que avanza después
  status text not null default 'pending_artifact'
    check (status in ('pending_artifact', 'pending_verification', 'requires_review', 'signed', 'invalid')),
  review_needed boolean not null default false,
  review_reason text,
  review_resolved_at timestamptz,
  review_resolved_by uuid,
  review_note text,
  verification_method text check (verification_method in ('whatsapp_club', 'presencial_identificacion')),
  verification_reference text,
  verified_by uuid,
  verified_at timestamptz,
  artifact_path text,
  artifact_sha256 text,
  artifact_at timestamptz,
  invalidated_at timestamptz,
  invalidated_by uuid,
  invalid_reason text
);
create index if not exists visoria_consents_prospect on app.visoria_consents(prospect_id, signed_at desc);
create index if not exists visoria_consents_campaign on app.visoria_consents(campaign_id);
alter table app.visoria_consents enable row level security;
revoke all on table app.visoria_consents from public, anon, authenticated;

-- Lo firmado no se toca; sólo avanza el estado y lo que lo explica.
create or replace function private.visoria_consent_inmutable()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op <> 'UPDATE' then raise exception 'Visoria consent records are permanent'; end if;
  if (to_jsonb(new) - array['status', 'review_resolved_at', 'review_resolved_by', 'review_note', 'verification_method',
        'verification_reference', 'verified_by', 'verified_at', 'artifact_path', 'artifact_sha256', 'artifact_at',
        'invalidated_at', 'invalidated_by', 'invalid_reason'])
     is distinct from
     (to_jsonb(old) - array['status', 'review_resolved_at', 'review_resolved_by', 'review_note', 'verification_method',
        'verification_reference', 'verified_by', 'verified_at', 'artifact_path', 'artifact_sha256', 'artifact_at',
        'invalidated_at', 'invalidated_by', 'invalid_reason']) then
    raise exception 'Signed consent evidence is immutable';
  end if;
  if old.artifact_path is not null and (new.artifact_path is distinct from old.artifact_path or new.artifact_sha256 is distinct from old.artifact_sha256) then
    raise exception 'Consent artifact is immutable';
  end if;
  if old.invalidated_at is not null and new.status <> 'invalid' then raise exception 'Invalid consent cannot be revived'; end if;
  return new;
end $$;
create trigger visoria_consent_inmutable before update or delete on app.visoria_consents
  for each row execute function private.visoria_consent_inmutable();

-- Lo aprobado tampoco: sólo se retira o se reemplaza.
create or replace function private.visoria_document_inmutable()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op <> 'UPDATE' then raise exception 'Visoria documents are permanent'; end if;
  if new.body is distinct from old.body or new.content_hash is distinct from old.content_hash or new.kind is distinct from old.kind
     or new.version is distinct from old.version or new.title is distinct from old.title or new.campaign_id is distinct from old.campaign_id then
    raise exception 'Visoria document text is immutable';
  end if;
  if not ((old.status = 'plantilla' and new.status = 'retirada') or (old.status = 'aprobado' and new.status = 'reemplazado') or old.status = new.status) then
    raise exception 'Invalid document status change';
  end if;
  return new;
end $$;
create trigger visoria_document_inmutable before update or delete on app.visoria_documents
  for each row execute function private.visoria_document_inmutable();

-- ---------- 7. Salud, aparte ----------
create table if not exists app.visoria_health (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  consent_id uuid not null unique references app.visoria_consents(id),
  prospect_id uuid not null references app.prospects(id),
  campaign_id uuid not null references app.visoria_campaigns(id),
  answers jsonb not null,
  needs_review boolean not null,
  review_status text not null check (review_status in ('no_requiere', 'pendiente', 'apto', 'no_apto')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
alter table app.visoria_health enable row level security;
revoke all on table app.visoria_health from public, anon, authenticated;

-- ---------- 8. Bitácoras (sólo se agregan renglones) ----------
create table if not exists app.visoria_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  campaign_id uuid,
  prospect_id uuid,
  consent_id uuid,
  actor_user_id uuid,
  actor_kind text not null check (actor_kind in ('familia', 'staff', 'sistema')),
  action text not null,
  result text not null check (result in ('ok', 'rechazado')),
  reason text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists visoria_audit_consent on app.visoria_audit(consent_id);
create index if not exists visoria_audit_campaign on app.visoria_audit(campaign_id, occurred_at desc);

create table if not exists app.visoria_media_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  campaign_id uuid not null,
  prospect_id uuid not null,
  consent_id uuid,
  decision text not null check (decision in ('otorgada', 'negada', 'revocada')),
  source text not null,
  document_version text,
  actor_user_id uuid,
  recorded_at timestamptz not null default now()
);
create index if not exists visoria_media_history_prospect on app.visoria_media_history(prospect_id, recorded_at desc);

create table if not exists app.visoria_transfers (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  campaign_id uuid not null,
  prospect_id uuid not null,
  consent_id uuid not null,
  evaluator text not null,
  data_categories text not null,
  purpose text not null,
  actor_user_id uuid not null,
  transferred_at timestamptz not null default now()
);

create table if not exists app.visoria_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null references app.visoria_campaigns(id),
  prospect_id uuid references app.prospects(id),
  occurred_at timestamptz not null,
  place text not null,
  activity text,
  facts text not null,
  people_present text,
  first_aid text,
  emergency_called boolean not null default false,
  guardian_contacted_at timestamptz,
  transfer text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create table if not exists app.visoria_incident_entries (
  id bigint generated always as identity primary key,
  incident_id uuid not null references app.visoria_incidents(id),
  kind text not null check (kind in ('seguimiento', 'evidencia', 'cierre', 'reapertura')),
  note text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['visoria_audit', 'visoria_media_history', 'visoria_transfers', 'visoria_incidents', 'visoria_incident_entries'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('revoke all on table app.%I from public, anon, authenticated', t);
  end loop;
end $$;

create or replace function private.visoria_solo_agregar()
returns trigger language plpgsql set search_path to '' as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;
do $$ declare t text; begin
  foreach t in array array['visoria_audit', 'visoria_media_history', 'visoria_transfers', 'visoria_incidents', 'visoria_incident_entries'] loop
    execute format('create trigger solo_agregar before update or delete on app.%I for each row execute function private.visoria_solo_agregar()', t);
  end loop;
end $$;

-- ---------- 9. Bucket de expedientes ----------
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('tanneros-visoria-expedientes', 'tanneros-visoria-expedientes', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- ---------- Plantillas (borrador del paquete 01 y 02; requieren abogado) ----------
-- Texto del machote 01/02 sin las notas internas para el asesor. Lo que el
-- machote deja entre corchetes aquí es {{campo}}: lo llena la configuración
-- del evento al aprobar, y {{firmante}}, {{parentesco}}, {{menor}} y
-- {{nacimiento}} al firmar. Una visoría no se aprueba con un campo vacío.
create or replace function private.visoria_sha(p text)
returns text language sql immutable set search_path to '' as $$
  select encode(pg_catalog.sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$$;
revoke all on function private.visoria_sha(text) from public, anon, authenticated;

insert into app.visoria_documents(organization_id, campaign_id, kind, version, title, body, content_hash, status)
select o.id, null, v.kind, 'plantilla-1.0', v.title, v.body, private.visoria_sha(v.body), 'plantilla'
  from public.organizations o
 cross join (values
 ('consentimiento', 'Consentimiento informado y autorización de participación en visoría de fútbol de menores de edad', $doc$TANNERY CITY FC
CONSENTIMIENTO INFORMADO Y AUTORIZACIÓN DE PARTICIPACIÓN EN VISORÍA DE FÚTBOL DE MENORES DE EDAD

Versión: {{consent_version}}
Organizador jurídico: {{organizador_legal}}
Domicilio del organizador: {{organizador_domicilio}}
Nombre comercial: Tannery City FC
Evento: {{evento}}
Sede: {{sede}}
Fecha y horario: {{fecha_horario}}
Club o institución evaluadora, si existe: {{evaluador}}
Coordinador responsable: {{coordinador}}

1. Identificación y facultades del firmante

Yo, {{firmante}}, en mi carácter de {{parentesco}} de {{menor}}, nacido(a) el {{nacimiento}}, declaro que cuento con las facultades necesarias para autorizar esta participación. Manifiesto que los datos proporcionados son veraces y que informaré cualquier restricción judicial, familiar o de representación que afecte mi facultad para autorizarla.

2. Alcance de la autorización

Autorizo expresamente que el menor participe, durante el evento, fecha, horario y sede indicados, en las actividades deportivas bajo supervisión de los responsables de la visoría, que pueden incluir calentamientos, ejercicios técnicos, acondicionamiento físico razonable, ejercicios de control de balón, carreras, saltos, cambios de dirección, enfrentamientos de juego y partidos de evaluación.

La autorización NO se extiende automáticamente a eventos futuros, desplazamientos fuera de la sede, campamentos, transporte proporcionado por terceros, viajes, evaluaciones en otro establecimiento o actividades distintas. Tales supuestos requieren autorización específica cuando proceda.

3. Información y aceptación de los riesgos inherentes al fútbol

Reconozco que la actividad deportiva implica riesgos ordinarios que pueden producir lesiones, entre ellos caídas, tropiezos, golpes, choques con otros participantes, contacto con balón/equipamiento/superficies, torceduras, esguinces, distensiones, fracturas, fatiga, deshidratación, afectaciones por calor u otras condiciones climáticas. En casos menos frecuentes pueden presentarse lesiones graves, secuelas permanentes o emergencias potencialmente mortales.

Declaro haber recibido una descripción comprensible de estos riesgos, conocer el tipo de actividades previstas y autorizar voluntariamente la participación del menor.

La aceptación de riesgos deportivos ordinarios no equivale a eximir al organizador, sus integrantes o terceros de responsabilidades legalmente imputables por actos, omisiones, falta de diligencia o incumplimiento de obligaciones legales.

{{seccion_seguro}}

5. Declaración de salud, aptitud y precauciones

Declaro haber informado, con la mayor exactitud posible y conforme a la información médica de la que dispongo, si el menor presenta lesiones actuales, restricciones médicas, enfermedades relevantes para ejercicio físico, alergias importantes o indicaciones médicas de atención especial. Me comprometo a informar cambios relevantes antes del inicio.

Reconozco que no sustituye a una evaluación médica profesional el hecho de firmar el presente documento. No se me exige prometer un estado de salud perfecto o desconocer condiciones no diagnosticadas.

Acepto que el organizador, por razones razonables de seguridad, podrá posponer, adaptar, suspender o impedir la participación cuando se identifique un riesgo evidente o cuando sea necesario aclarar una restricción médica, sin realizar diagnósticos ni discriminar injustificadamente al menor.

Los datos de salud solo serán recabados en la medida necesaria, se tratarán como datos personales sensibles y tendrán acceso restringido conforme al aviso de privacidad y consentimiento específico.

6. Primeros auxilios y emergencias

Autorizo a los responsables de Tannery City FC a solicitar asistencia médica de emergencia o ambulancia y a brindar, mediante personal capacitado y dentro del alcance de su formación, primeros auxilios básicos cuando las circunstancias lo requieran. Autorizo también que se gestione el traslado del menor a un centro sanitario cuando sea médicamente necesario o indicado por servicios de emergencia.

Se hará lo razonablemente posible por avisarme con prontitud al contacto que proporcioné, sin retrasar una asistencia urgente. Autorizo a comunicar al personal sanitario solo la información médica pertinente para la atención.

Esta autorización no reemplaza el consentimiento informado que un profesional de salud deba obtener para procedimientos específicos, salvo los supuestos de emergencia contemplados por la ley.

Contacto principal: {{telefono_firmante}}
Contacto alternativo para emergencias: {{contacto_emergencia}}

7. Obligaciones razonables del familiar y del organizador

Me comprometo a que el menor acuda con la indumentaria y protección personal que la organización haya indicado, a informar condiciones de salud relevantes y a procurar que reciba instrucciones básicas sobre seguridad, hidratación y reglas deportivas.

El organizador asume las obligaciones legales que le correspondan sobre supervisión, condiciones razonablemente seguras de la instalación y los ejercicios, prevención de riesgos previsibles y respuesta ante emergencias. El personal deportivo puede retirar a un participante cuando sea necesario por seguridad.

La aceptación del presente documento no sustituye las medidas de prevención del organizador y no implica renuncia anticipada a acciones o derechos que sean irrenunciables por ley.

8. Ingreso, permanencia y entrega del menor

El acceso del menor a cancha queda sujeto al control de registro, supervisión y cumplimiento de requisitos del evento. Quienes ejerzan la representación del menor deberán cumplir el procedimiento anunciado de llegada, recogida y designación de personas autorizadas. No se presume que el personal deportivo tenga autorización para transportar al menor fuera de la sede; cualquier traslado distinto al de emergencia debe ser autorizado separadamente.

9. Naturaleza de la visoría; sin promesa de selección

La visoría es una evaluación deportiva. La asistencia no garantiza selección, incorporación, contratación, representación, beca, inscripción a una academia profesional, beneficio económico ni vínculo con el club evaluador. Cualquier oferta futura será objeto de comunicación y, en su caso, acuerdo distinto.

10. Uso de datos y evaluadores

He tenido a disposición el aviso de privacidad de {{organizador_legal}}, versión {{privacy_version}}. Comprendo las finalidades del registro, organización, evaluación deportiva, contacto, atención de emergencias y conservación necesaria de comprobantes.

El tratamiento de información médica sensible está sujeto al consentimiento expreso separado que corresponde. Si participa un evaluador externo, cualquier transferencia de datos deportivos a él se describirá con identidad, finalidad y alcance en una autorización independiente y en el aviso de privacidad; no se presume que aceptar participar autorice cualquier cesión ulterior. No se transferirán datos de salud para fines comerciales o de captación deportiva.

11. Fotografía, video y difusión — autorización independiente

La participación en la visoría no está condicionada a la autorización de fotografías o videos con fines de redes sociales o publicidad. Mi decisión de permitir o rechazar dicha difusión se registra por separado, sin afectar la participación. La grabación estrictamente necesaria para evaluación deportiva, si existiera, debe informarse por su propia finalidad y conforme al aviso de privacidad.

En caso de otorgar autorización de difusión, solo comprende usos institucionales descritos en la opción específica y dentro de canales autorizados. No habilita usos que afecten la dignidad, seguridad, intimidad o interés superior del menor. Podré revocarla respecto de tratamientos futuros por los canales comunicados en el aviso de privacidad.

12. Declaración final del firmante

Declaro que tuve oportunidad real de leer el documento completo y el aviso de privacidad, que he comprendido su contenido, que se me advirtió de forma destacada sobre los riesgos deportivos y sobre la ausencia de seguro proporcionado para este evento (si aplica), y que actúo de manera libre y consciente en representación del menor.

Reconozco expresamente que ninguna cláusula elimina responsabilidades legalmente exigibles del organizador o de terceros, ni constituye renuncia a derechos que la ley considere irrenunciables.

Autorizo la participación del menor en los términos delimitados por este consentimiento y las decisiones expresas que registro mediante el formulario.$doc$),
 ('clausula_sin_seguro', 'Cláusula 4 · Sin seguro verificado', $doc$4. Aviso destacado: ausencia de seguro de accidentes

ESTA VISORÍA NO INCLUYE SEGURO MÉDICO, SEGURO DE ACCIDENTES PERSONALES NI COBERTURA DE HOSPITALIZACIÓN PROPORCIONADA POR TANNERY CITY FC O POR {{organizador_legal}}.

Reconozco haber sido informado de manera clara y previa a mi aceptación de que la inscripción o participación no equivale a la contratación de una póliza y que no se me ha ofrecido un seguro a cargo del organizador.

Tratándose de lesiones consecuencia de riesgos ordinarios de la práctica deportiva no atribuibles legalmente al organizador o a terceros, asumo la gestión y costos de la atención, tratamiento, medicamentos, traslados, estudios, rehabilitación y hospitalización que requiera el menor. Puedo valorar la contratación de cobertura privada adecuada para actividades deportivas.

Esta sección no limita las responsabilidades que legalmente pudieran corresponder al organizador o a otras personas cuando se acredite la causa que las genere.$doc$),
 ('clausula_con_seguro', 'Cláusula 4 · Con seguro verificado', $doc$4. Seguro aplicable a este evento

{{seguro_detalle}}

Esta sección no limita las responsabilidades que legalmente pudieran corresponder al organizador o a otras personas cuando se acredite la causa que las genere.$doc$),
 ('privacidad', 'Aviso de privacidad integral para visorías de menores', $doc$TANNERY CITY FC — AVISO DE PRIVACIDAD INTEGRAL PARA VISORÍAS DE MENORES
Versión: {{privacy_version}}

1. Identidad del responsable

{{organizador_legal}}, con domicilio en {{organizador_domicilio}}, correo {{privacidad_correo}} y medio de contacto {{privacidad_contacto}}, es responsable del tratamiento de los datos personales recabados con motivo de las visorías realizadas bajo el nombre comercial Tannery City FC. {{responsable_conjunto}}

2. Datos que recabamos

De madres, padres y tutores: nombre, carácter de representación, medios de contacto, datos mínimos de verificación de autorización, constancia de aceptación, firma y metadatos proporcionados por el sistema que resulten necesarios para seguridad y acreditación.

De participantes: nombre, fecha de nacimiento, categoría deportiva, datos pertinentes para registro y evaluación deportiva, información de contacto de emergencia y, cuando sea estrictamente necesario, datos de salud sensibles como alergias, lesiones, limitaciones de actividad o indicaciones en caso de emergencia. Las imágenes/fotografías y grabaciones se tratarán solo conforme a las finalidades y autorizaciones informadas.

No solicitamos historiales clínicos completos, datos excesivos ni identificaciones sensibles indiscriminadamente.

3. Finalidades primarias

• Inscripción, contacto y administración del evento.
• Control de acceso, identificación del participante y relación con su representante legal.
• Organización de prácticas deportivas y evaluación técnica. {{grabacion_evaluacion}}
• Gestión de seguridad y emergencias médicas, incluyendo comunicación proporcionada de datos pertinentes a profesionales de salud cuando corresponda.
• Gestión de consentimientos, evidencia documental, quejas, incidentes y cumplimiento de obligaciones legales.

El tratamiento de datos de salud sensibles se limita a lo estrictamente necesario y requiere consentimiento expreso/documentado cuando no exista una excepción legal aplicable.

4. Finalidad secundaria opcional

Difusión institucional de fotografías y videos identificables del menor en {{medios_oficiales}} para comunicación de actividades del club. Esta finalidad es opcional: negarse no impide participar. No se usarán imágenes que vulneren privacidad, dignidad o seguridad. En caso de oposición/revocación posterior se gestionará el cese de nuevos usos y las medidas procedentes respecto del material bajo control del responsable; no es posible prometer eliminación absoluta de copias hechas por terceros externos.

5. Transferencias de datos a terceros

Club evaluador: {{evaluador_transferencia}}

Servicios de salud: se podrán comunicar los datos estrictamente indispensables en emergencias o bajo otras hipótesis legales permitidas.

Encargados tecnológicos: {{encargados_tecnologicos}}

No: vender, publicar, reutilizar para marketing de terceros o transferir fichas médicas a scouts sin fundamento jurídico específico y documentado.

6. Derechos ARCO, revocación y limitación

La madre, padre, tutor o titular legitimado puede solicitar acceso, rectificación, cancelación u oposición a través de {{arco_medio}}, indicando nombre, medio de respuesta, identidad/representación y solicitud concreta. Se observarán requisitos y plazos legales aplicables. Podrá también solicitar limitación del uso/divulgación y revocación del consentimiento, sin efectos retroactivos y sin afectar conservación que tenga fundamento legal.

Procedimiento de atención: {{arco_procedimiento}}

7. Seguridad, conservación y incidentes

Aplicamos medidas razonables de seguridad administrativas, técnicas y físicas, incluyendo acceso por roles, archivos privados y segregación de información médica. La información se conservará mientras sea necesaria para las finalidades informadas y los periodos aplicables para obligaciones legales, reclamaciones, bloqueo y defensa de derechos, conforme a la tabla de conservación aprobada: {{conservacion}} Posteriormente se eliminará o anonimizará según corresponda.

En caso de vulneración de seguridad, se aplicará el procedimiento de respuesta y notificación legal cuando proceda.

8. Cookies, analítica y seguimiento

{{analitica}} Nunca se envían datos sensibles del menor, su salud, imágenes privadas o contenido de documentos a píxeles publicitarios ni analítica comercial.

9. Modificaciones

Los cambios al aviso se darán a conocer mediante {{url_aviso}}. Cuando se pretenda una nueva finalidad que requiera consentimiento, deberá obtenerse una nueva autorización adecuada antes del tratamiento.

10. Consentimientos separados

El formulario conserva evidencia diferenciada de: autorización de participación, aceptación de información de riesgo/seguro, consentimiento expreso para datos de salud, decisión sobre transferir información al evaluador y autorización opcional de imágenes. El aviso de privacidad por sí solo no sustituye esas decisiones.$doc$)
 ) as v(kind, title, body)
on conflict do nothing;

-- ---------- Funciones internas ----------
-- Lo que, si cambia, obliga a aprobar y a firmar de nuevo.
create or replace function private.visoria_material(p_campaign_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'title', c.title, 'datesLabel', c.dates_label, 'location', c.location, 'startsOn', c.starts_on,
    'legal', c.legal_config, 'insurance', c.insurance_status, 'insuranceDetail', c.insurance_detail,
    'templates', (select jsonb_object_agg(d.kind, d.content_hash) from app.visoria_documents d
                   where d.organization_id = c.organization_id and d.campaign_id is null and d.status = 'plantilla'))
    from app.visoria_campaigns c where c.id = p_campaign_id
$$;
create or replace function private.visoria_event_hash(p_campaign_id uuid)
returns text language sql stable security definer set search_path to '' as $$
  select private.visoria_sha(private.visoria_material(p_campaign_id)::text)
$$;

-- Los campos que la visoría necesita antes de abrir la firma.
create or replace function private.visoria_campos_requeridos()
returns text[] language sql immutable set search_path to '' as $$
  select array['organizador_legal', 'organizador_domicilio', 'responsable_conjunto', 'privacidad_correo', 'privacidad_contacto',
               'fecha_horario', 'coordinador', 'coordinador_emergencias', 'protocolo_emergencia', 'medios_oficiales',
               'encargados_tecnologicos', 'arco_medio', 'arco_procedimiento', 'conservacion', 'analitica', 'url_aviso']
$$;

create or replace function private.visoria_aprobacion(p_campaign_id uuid, p_gate text)
returns app.visoria_approvals language sql stable security definer set search_path to '' as $$
  select a.* from app.visoria_approvals a
   where a.campaign_id = p_campaign_id and a.gate = p_gate and a.revoked_at is null
     and a.event_hash = private.visoria_event_hash(p_campaign_id)
   order by a.approved_at desc limit 1
$$;

-- Qué falta para abrir la firma. Vacío = se puede firmar.
create or replace function private.visoria_faltantes(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare c app.visoria_campaigns%rowtype; v jsonb := '[]'::jsonb; k text;
begin
  select * into c from app.visoria_campaigns where id = p_campaign_id;
  foreach k in array private.visoria_campos_requeridos() loop
    if length(btrim(coalesce(c.legal_config->>k, ''))) < 2 then v := v || to_jsonb('campo:' || k); end if;
  end loop;
  if length(btrim(coalesce(c.location, ''))) < 5 then v := v || to_jsonb('campo:sede'::text); end if;
  if c.insurance_status = 'sin_verificar' then v := v || to_jsonb('seguro'::text); end if;
  if c.insurance_status = 'con_seguro_verificado' and length(btrim(coalesce(c.insurance_detail, ''))) < 20 then v := v || to_jsonb('campo:seguro_detalle'::text); end if;
  if length(btrim(coalesce(c.legal_config->>'evaluador_nombre', ''))) > 0
     and (length(btrim(coalesce(c.legal_config->>'evaluador_datos', ''))) < 3 or length(btrim(coalesce(c.legal_config->>'evaluador_finalidad', ''))) < 3) then
    v := v || to_jsonb('campo:evaluador'::text);
  end if;
  if (private.visoria_aprobacion(c.id, 'legal')).id is null
     or not exists (select 1 from app.visoria_documents d where d.campaign_id = c.id and d.kind = 'consentimiento' and d.status = 'aprobado')
     or not exists (select 1 from app.visoria_documents d where d.campaign_id = c.id and d.kind = 'privacidad' and d.status = 'aprobado') then
    v := v || to_jsonb('aprobacion:legal'::text);
  end if;
  if (private.visoria_aprobacion(c.id, 'operativa')).id is null then v := v || to_jsonb('aprobacion:operativa'::text); end if;
  if (private.visoria_aprobacion(c.id, 'seguridad')).id is null then v := v || to_jsonb('aprobacion:seguridad'::text); end if;
  return v;
end $$;

-- Rellena {{campo}} con la configuración del evento.
create or replace function private.visoria_rellena(p_text text, p_campos jsonb)
returns text language plpgsql immutable set search_path to '' as $$
declare v text := p_text; k text; val text;
begin
  for k, val in select key, value from jsonb_each_text(p_campos) loop
    v := replace(v, '{{' || k || '}}', coalesce(val, ''));
  end loop;
  return v;
end $$;

create or replace function private.visoria_campos_evento(p_campaign_id uuid, p_consent_version text, p_privacy_version text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare c app.visoria_campaigns%rowtype; l jsonb; v_eval text; v_clausula text;
begin
  select * into c from app.visoria_campaigns where id = p_campaign_id;
  l := c.legal_config;
  v_eval := nullif(btrim(coalesce(l->>'evaluador_nombre', '')), '');
  select d.body into v_clausula from app.visoria_documents d
   where d.organization_id = c.organization_id and d.campaign_id is null and d.status = 'plantilla'
     and d.kind = case when c.insurance_status = 'con_seguro_verificado' then 'clausula_con_seguro' else 'clausula_sin_seguro' end;
  return l || jsonb_build_object(
    'consent_version', p_consent_version, 'privacy_version', p_privacy_version,
    'evento', c.title || ' · ' || c.slug, 'sede', coalesce(c.location, ''),
    'evaluador', coalesce(v_eval || coalesce(' · ' || nullif(btrim(l->>'evaluador_finalidad'), ''), ''), 'No aplica: en esta visoría no participa un club evaluador externo.'),
    'evaluador_transferencia', case when v_eval is null
      then 'En esta visoría no participa un club evaluador externo; no se transfieren datos a evaluadores terceros.'
      else 'si el evento incluye a ' || v_eval || coalesce(' (' || nullif(btrim(l->>'evaluador_contacto'), '') || ')', '')
        || ', se podrá solicitar autorización específica para transferir ' || coalesce(l->>'evaluador_datos', '')
        || ' con la finalidad concreta de ' || coalesce(l->>'evaluador_finalidad', '')
        || ', informando las consecuencias de negar esa transferencia. La decisión se registrará de manera independiente. El receptor deberá quedar sujeto a las obligaciones de privacidad que correspondan y conocer las finalidades autorizadas.' end,
    'grabacion_evaluacion', coalesce(nullif(btrim(l->>'grabacion_evaluacion'), ''), 'En esta visoría no se graba video para evaluación.'),
    'seguro_detalle', coalesce(c.insurance_detail, ''),
    'seccion_seguro', private.visoria_rellena(coalesce(v_clausula, ''), l || jsonb_build_object('seguro_detalle', coalesce(c.insurance_detail, ''))));
end $$;

-- Placeholders que quedarían sin llenar (los del firmante se llenan al firmar).
create or replace function private.visoria_pendientes_de_texto(p_text text)
returns text[] language sql immutable set search_path to '' as $$
  select coalesce(array_agg(distinct m[1]), '{}')
    from regexp_matches(p_text, '\{\{([a-z_]+)\}\}', 'g') as m
   where m[1] not in ('firmante', 'parentesco', 'menor', 'nacimiento', 'telefono_firmante', 'contacto_emergencia')
$$;

create or replace function private.visoria_audita(p_org uuid, p_campaign uuid, p_prospect uuid, p_consent uuid, p_kind text,
  p_action text, p_result text, p_reason text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path to '' as $$
  insert into app.visoria_audit(organization_id, campaign_id, prospect_id, consent_id, actor_user_id, actor_kind, action, result, reason, detail)
  values (p_org, p_campaign, p_prospect, p_consent, (select auth.uid()), p_kind, p_action, p_result, left(p_reason, 500), coalesce(p_detail, '{}'::jsonb))
$$;

-- Estado del expediente: lo calcula el servidor, nunca el cliente.
create or replace function private.visoria_asienta(p_consent_id uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare k app.visoria_consents%rowtype; v text;
begin
  select * into k from app.visoria_consents where id = p_consent_id for update;
  if k.invalidated_at is not null then v := 'invalid';
  elsif k.artifact_path is null then v := 'pending_artifact';
  elsif k.review_needed and k.review_resolved_at is null then v := 'requires_review';
  elsif k.verified_at is null then v := 'pending_verification';
  else v := 'signed'; end if;
  if v is distinct from k.status then update app.visoria_consents set status = v where id = k.id; end if;
  return v;
end $$;

-- La liga de la familia: el token sólo existe en su teléfono; aquí, su hash.
create or replace function private.visoria_nueva_liga(p_org uuid, p_campaign uuid, p_prospect uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex'); v_fin date;
begin
  select coalesce(c.starts_on, current_date) into v_fin from app.visoria_campaigns c where c.id = p_campaign;
  insert into app.visoria_sign_links(organization_id, campaign_id, prospect_id, token_hash, created_by, expires_at)
  values (p_org, p_campaign, p_prospect, private.visoria_sha(v_token), (select auth.uid()), greatest(v_fin, current_date) + interval '120 days');
  return v_token;
end $$;

create or replace function private.visoria_liga(p_org uuid, p_token text)
returns app.visoria_sign_links language plpgsql stable security definer set search_path to '' as $$
declare l app.visoria_sign_links%rowtype;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from app.visoria_sign_links s
   where s.token_hash = private.visoria_sha(p_token) and s.organization_id = p_org and s.revoked_at is null and s.expires_at > now();
  return l;
end $$;

-- El expediente vigente de un niño en una visoría (el último que no se anuló).
create or replace function private.visoria_vigente(p_campaign uuid, p_prospect uuid)
returns app.visoria_consents language sql stable security definer set search_path to '' as $$
  select k.* from app.visoria_consents k
   where k.campaign_id = p_campaign and k.prospect_id = p_prospect and k.invalidated_at is null
   order by k.signed_at desc limit 1
$$;

-- Lo que ve el staff en la puerta. Un consentimiento firmado con otra huella
-- del evento (cambió sede, seguro, organizador, textos...) ya no autoriza.
create or replace function private.visoria_acceso(p_campaign uuid, p_prospect uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare k app.visoria_consents%rowtype; h app.visoria_health%rowtype; p app.prospects%rowtype; v text; motivo text;
begin
  select * into p from app.prospects where id = p_prospect;
  k := private.visoria_vigente(p_campaign, p_prospect);
  if k.id is not null then select * into h from app.visoria_health where consent_id = k.id; end if;
  if k.id is null then v := 'SIN_CONSENTIMIENTO'; motivo := 'Falta firmar el consentimiento.';
  elsif k.event_hash <> private.visoria_event_hash(p_campaign) then v := 'SIN_CONSENTIMIENTO'; motivo := 'Cambió el evento: necesita firmar la versión vigente.';
  elsif coalesce((p.metadata->'visoria'->>'alertaOperativa')::boolean, false) then v := 'NO_APTO'; motivo := coalesce(p.metadata->'visoria'->>'alertaNota', 'Alerta operativa.');
  elsif h.review_status = 'no_apto' then v := 'NO_APTO'; motivo := 'Revisión médica: no apto para este evento.';
  elsif h.review_status = 'pendiente' then v := 'REVISION_MEDICA'; motivo := 'Revisión médica pendiente.';
  elsif k.status = 'requires_review' then v := 'PENDIENTE'; motivo := 'Revisar facultades de quien firmó.';
  elsif k.status = 'pending_artifact' then v := 'PENDIENTE'; motivo := 'Falta generar el expediente.';
  elsif k.status = 'pending_verification' then v := 'PENDIENTE'; motivo := 'Verificar la identidad de quien firmó.';
  elsif k.status = 'signed' then v := 'AUTORIZADO'; motivo := null;
  else v := 'SIN_CONSENTIMIENTO'; motivo := 'Consentimiento no válido.'; end if;
  return jsonb_build_object('status', v, 'reason', motivo, 'consentId', k.id, 'consentStatus', k.status,
    'healthReview', h.review_status, 'outdated', k.id is not null and k.event_hash <> private.visoria_event_hash(p_campaign));
end $$;

do $$ declare f text; begin
  foreach f in array array['private.visoria_material(uuid)', 'private.visoria_event_hash(uuid)', 'private.visoria_campos_requeridos()',
    'private.visoria_aprobacion(uuid, text)', 'private.visoria_faltantes(uuid)', 'private.visoria_rellena(text, jsonb)',
    'private.visoria_campos_evento(uuid, text, text)', 'private.visoria_pendientes_de_texto(text)',
    'private.visoria_audita(uuid, uuid, uuid, uuid, text, text, text, text, jsonb)', 'private.visoria_asienta(uuid)',
    'private.visoria_nueva_liga(uuid, uuid, uuid)', 'private.visoria_liga(uuid, text)', 'private.visoria_vigente(uuid, uuid)',
    'private.visoria_acceso(uuid, uuid)', 'private.visoria_consent_inmutable()', 'private.visoria_document_inmutable()',
    'private.visoria_solo_agregar()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------- Lo público ----------
-- Lo que ve la familia antes de inscribir: sin datos de nadie y sin textos
-- sin aprobar. Si falta algo, la firma no abre y se puede apartar lugar.
create or replace function public.v2_public_visoria(club_key text, slug text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(club_key); v_c app.visoria_campaigns%rowtype; v_n int; v_falta jsonb;
begin
  if v_org is null then raise exception 'Campaign not found'; end if;
  select * into v_c from app.visoria_campaigns c where c.organization_id = v_org and c.slug = v2_public_visoria.slug;
  if v_c.id is null then raise exception 'Campaign not found'; end if;
  v_n := private.visoria_inscritos(v_org, v_c.slug);
  v_falta := private.visoria_faltantes(v_c.id);
  return jsonb_build_object(
    'slug', v_c.slug, 'title', v_c.title, 'datesLabel', v_c.dates_label, 'location', v_c.location, 'startsOn', v_c.starts_on,
    'capacity', v_c.capacity, 'spotsLeft', case when v_c.capacity is null then null else greatest(0, v_c.capacity - v_n) end,
    'open', v_c.is_open and (v_c.capacity is null or v_n < v_c.capacity),
    'closed', not v_c.is_open,
    'signingOpen', jsonb_array_length(v_falta) = 0,
    'legal', case when jsonb_array_length(v_falta) = 0 then private.visoria_contexto_legal(v_c.id) else null end,
    'documents', '{}'::jsonb);
end $$;

-- Lo que se muestra al firmar: el texto aprobado, la versión, el seguro real,
-- el evaluador (si hay) y las declaraciones exactas que se van a registrar.
create or replace function private.visoria_declaraciones(p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare c app.visoria_campaigns%rowtype; v_eval text; v jsonb;
begin
  select * into c from app.visoria_campaigns where id = p_campaign;
  v_eval := nullif(btrim(coalesce(c.legal_config->>'evaluador_nombre', '')), '');
  v := jsonb_build_array(
    jsonb_build_object('key', 'accept_participation', 'required', true,
      'text', 'He leído los términos y autorizo la participación del menor. Entiendo los riesgos propios del fútbol.'),
    case when c.insurance_status = 'sin_seguro_verificado' then jsonb_build_object('key', 'ack_no_insurance', 'required', true,
      'text', 'Entiendo que esta visoría no incluye seguro médico ni de accidentes proporcionado por el organizador.')
    else jsonb_build_object('key', 'ack_insurance_terms', 'required', true,
      'text', 'Conozco la cobertura de seguro descrita para esta visoría y sus límites.') end,
    jsonb_build_object('key', 'ack_health_and_emergency', 'required', true,
      'text', 'He informado las condiciones relevantes de salud y autorizo la activación de servicios de emergencia y primeros auxilios dentro de los alcances descritos.'),
    jsonb_build_object('key', 'consent_sensitive_data', 'required', true,
      'text', 'Otorgo mi consentimiento expreso por escrito/electrónico, a través de este mecanismo de autenticación, para el tratamiento limitado de datos de salud del menor conforme al aviso de privacidad.'),
    jsonb_build_object('key', 'guardian_authority', 'required', true,
      'text', 'Declaro estar legalmente facultado(a) para otorgar esta autorización.'));
  if v_eval is not null then
    v := v || jsonb_build_array(jsonb_build_object('key', 'transfer_to_evaluator', 'required', false, 'choice', true,
      'text', 'Autorizo compartir con ' || v_eval || ' exclusivamente los datos deportivos ' || coalesce(c.legal_config->>'evaluador_datos', '')
        || ' para ' || coalesce(c.legal_config->>'evaluador_finalidad', '') || ', bajo las condiciones del aviso de privacidad.'));
  end if;
  v := v || jsonb_build_array(jsonb_build_object('key', 'media_publication', 'required', false, 'choice', true,
    'text', 'Autorizo la captación y publicación institucional de mi hijo(a) en fotografías o videos de esta visoría en los medios oficiales descritos en el aviso de privacidad.'));
  return v;
end $$;

create or replace function private.visoria_contexto_legal(p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare c app.visoria_campaigns%rowtype; v_con app.visoria_documents%rowtype; v_priv app.visoria_documents%rowtype;
begin
  select * into c from app.visoria_campaigns where id = p_campaign;
  select * into v_con from app.visoria_documents d where d.campaign_id = c.id and d.kind = 'consentimiento' and d.status = 'aprobado';
  select * into v_priv from app.visoria_documents d where d.campaign_id = c.id and d.kind = 'privacidad' and d.status = 'aprobado';
  return jsonb_build_object(
    'organizer', c.legal_config->>'organizador_legal', 'schedule', c.legal_config->>'fecha_horario',
    'coordinator', c.legal_config->>'coordinador',
    'insurance', c.insurance_status, 'insuranceDetail', case when c.insurance_status = 'con_seguro_verificado' then c.insurance_detail end,
    'evaluator', nullif(btrim(coalesce(c.legal_config->>'evaluador_nombre', '')), ''),
    'eventHash', private.visoria_event_hash(c.id),
    'consent', jsonb_build_object('id', v_con.id, 'version', v_con.version, 'title', v_con.title, 'body', v_con.body, 'hash', v_con.content_hash),
    'privacy', jsonb_build_object('id', v_priv.id, 'version', v_priv.version, 'title', v_priv.title, 'body', v_priv.body, 'hash', v_priv.content_hash),
    'declarations', private.visoria_declaraciones(c.id));
end $$;
revoke all on function private.visoria_declaraciones(uuid), private.visoria_contexto_legal(uuid) from public, anon, authenticated;

revoke all on function public.v2_public_visoria(text, text) from public;
grant execute on function public.v2_public_visoria(text, text) to anon, authenticated;

-- Apartar lugar: el niño, su familia y a quién llamar. Sin salud ni firma:
-- eso sólo llega con el consentimiento aprobado. Regresa la liga de la familia.
-- tutor: name, phone, email, channel, referral, relationship (madre|padre|tutor_legal|otro).
-- emergencia: nombre, telefono. recoge: texto libre (quién puede recogerlo).
create or replace function private.visoria_aparta(club_key text, slug text, nino jsonb, tutor jsonb, emergencia jsonb, recoge text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(club_key); v_c app.visoria_campaigns%rowtype; v_r jsonb; v_id uuid;
        v_existe uuid; v_folio text; v_birth date; v_par text := coalesce(tutor->>'relationship', '');
begin
  perform private.enforce_public_rate_limit('visoria_aparta', 20, interval '1 hour');
  if v_org is null then raise exception 'Campaign not found'; end if;
  select * into v_c from app.visoria_campaigns c where c.organization_id = v_org and c.slug = visoria_aparta.slug for update;
  if v_c.id is null then raise exception 'Campaign not found'; end if;
  begin v_birth := (nino->>'birthDate')::date; exception when others then raise exception 'Birth date required'; end;

  select p.id, p.folio into v_existe, v_folio from app.prospects p
   where p.organization_id = v_org and p.source_campaign = v_c.slug and p.archived_at is null and p.birth_date = v_birth
     and private.normaliza_nombre(p.first_name) = private.normaliza_nombre(nino->>'firstName')
     and private.normaliza_nombre(p.last_name) = private.normaliza_nombre(nino->>'lastName')
   limit 1;
  if v_existe is not null then
    -- Ya estaba: no se le regresa una liga nueva a cualquiera que sepa su nombre;
    -- sólo si el WhatsApp coincide con el registrado.
    if exists (select 1 from app.prospects p where p.id = v_existe and p.phone = private.normalize_public_phone(tutor->>'phone')) then
      return jsonb_build_object('id', v_existe, 'folio', v_folio, 'existing', true, 'token', private.visoria_nueva_liga(v_org, v_c.id, v_existe));
    end if;
    return jsonb_build_object('id', v_existe, 'folio', v_folio, 'existing', true, 'token', null);
  end if;

  if not v_c.is_open then raise exception 'Campaign closed'; end if;
  if v_c.capacity is not null and private.visoria_inscritos(v_org, v_c.slug) >= v_c.capacity then raise exception 'Campaign full'; end if;
  if v_par = '' then v_par := 'sin_dato'; end if;
  if v_par not in ('madre', 'padre', 'tutor_legal', 'otro', 'sin_dato') then raise exception 'Relationship required'; end if;
  if length(btrim(coalesce(emergencia->>'nombre', ''))) < 3 or private.normalize_public_phone(emergencia->>'telefono') is null then raise exception 'Emergency contact required'; end if;

  v_r := private.public_register_prospect_enhanced(club_key, nino->>'firstName', nino->>'lastName', v_birth,
    tutor->>'phone', tutor->>'email', tutor->>'name', nino->>'category', v_c.slug, tutor->>'channel',
    case when nino->>'type' = 'goalkeeper' then 'goalkeeper' else 'player' end, 'Visoría', nino->>'foot', nino->>'school',
    tutor->>'referral', null, 'visoria-registro', true, false, nino->>'sex');
  v_id := (v_r->>'id')::uuid;

  update app.prospects
     set trial_date = coalesce(trial_date, v_c.starts_on),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('visoria', jsonb_build_object(
           'campaign', v_c.slug,
           'posicion', left(btrim(coalesce(nino->>'position', '')), 40),
           'parentesco', v_par,
           'emergencia', jsonb_build_object('nombre', left(btrim(emergencia->>'nombre'), 120), 'telefono', private.normalize_public_phone(emergencia->>'telefono')),
           'recoge', nullif(left(btrim(coalesce(recoge, '')), 300), ''),
           'apartadoAt', now())),
         updated_at = now()
   where id = v_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (v_org, 'VisoriaRegistered', 'prospect', v_id, jsonb_build_object('campaign', v_c.slug, 'folio', v_r->>'folio'));
  perform private.visoria_audita(v_org, v_c.id, v_id, null, 'familia', 'lugar_apartado', 'ok', null, '{}'::jsonb);
  return v_r || jsonb_build_object('existing', false, 'token', private.visoria_nueva_liga(v_org, v_c.id, v_id));
end $$;
revoke all on function private.visoria_aparta(text, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;

create or replace function public.v2_public_visoria_reserve(club_key text, slug text, nino jsonb, tutor jsonb, emergencia jsonb, recoge text)
returns jsonb language sql security definer set search_path to '' as $$
  select private.visoria_aparta(club_key, slug, nino, tutor, emergencia, recoge)
$$;
revoke all on function public.v2_public_visoria_reserve(text, text, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.v2_public_visoria_reserve(text, text, jsonb, jsonb, jsonb, text) to anon, authenticated;

-- El cliente viejo (h53) sigue funcionando, pero ya no guarda salud ni firma:
-- aparta el lugar y la familia firma con el flujo nuevo.
create or replace function public.v2_public_visoria_register(club_key text, slug text, nino jsonb, tutor jsonb, salud jsonb,
  emergencia jsonb, firma jsonb, privacy_notice_version text, image_consent boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_r jsonb;
begin
  v_r := private.visoria_aparta(club_key, slug, nino, tutor, emergencia, null);
  return v_r - 'token';
end $$;
revoke all on function public.v2_public_visoria_register(text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, boolean) from public;
grant execute on function public.v2_public_visoria_register(text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, boolean) to anon, authenticated;

-- Con la liga: quién es, si ya firmó y, si la firma está abierta, qué firmar.
create or replace function public.v2_public_visoria_sign_context(club_key text, token text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(club_key); l app.visoria_sign_links%rowtype; p app.prospects%rowtype;
        c app.visoria_campaigns%rowtype; k app.visoria_consents%rowtype; v_falta jsonb;
begin
  perform private.enforce_public_rate_limit('visoria_liga', 60, interval '1 hour');
  l := private.visoria_liga(v_org, token);
  if l.id is null then raise exception 'Link not valid'; end if;
  select * into p from app.prospects where id = l.prospect_id;
  select * into c from app.visoria_campaigns where id = l.campaign_id;
  k := private.visoria_vigente(c.id, p.id);
  v_falta := private.visoria_faltantes(c.id);
  return jsonb_build_object(
    'prospect', jsonb_build_object('firstName', p.first_name, 'lastName', p.last_name, 'birthDate', p.birth_date, 'folio', p.folio,
      'category', p.category_interest, 'guardian', p.guardian_name, 'relationship', p.metadata->'visoria'->>'parentesco',
      'type', p.registration_type, 'position', p.metadata->'visoria'->>'posicion', 'foot', p.dominant_foot,
      'emergencia', p.metadata->'visoria'->'emergencia', 'recoge', p.metadata->'visoria'->>'recoge', 'imageConsent', p.image_consent),
    'campaign', jsonb_build_object('slug', c.slug, 'title', c.title, 'datesLabel', c.dates_label, 'location', c.location, 'startsOn', c.starts_on),
    'access', private.visoria_acceso(c.id, p.id),
    'consent', case when k.id is null then null else jsonb_build_object('id', k.id, 'status', k.status, 'signedAt', k.signed_at,
      'signer', k.signer_name, 'hasCopy', k.artifact_path is not null, 'outdated', k.event_hash <> private.visoria_event_hash(c.id),
      'media', (k.choices->'media_publication'->>'value')::boolean) end,
    'signingOpen', jsonb_array_length(v_falta) = 0,
    'legal', case when jsonb_array_length(v_falta) = 0 then private.visoria_contexto_legal(c.id) else null end);
end $$;
revoke all on function public.v2_public_visoria_sign_context(text, text) from public;
grant execute on function public.v2_public_visoria_sign_context(text, text) to anon, authenticated;

-- Firmar. Todo se valida aquí: el botón deshabilitado del navegador no cuenta.
-- payload: idempotencyKey, eventHash, consentDocumentId, privacyDocumentId,
--   signer {name, relationship, relationshipDetail, phone, email},
--   emergencia {nombre, telefono}, recoge,
--   salud {condicion, alergias, restriccion, atencion} cada una {respuesta: ninguna|privado|si, detalle},
--   choices {accept_participation, ack_no_insurance|ack_insurance_terms, ack_health_and_emergency,
--            consent_sensitive_data, guardian_authority, transfer_to_evaluator, media_publication}
--            cada una {value: bool, at: iso del navegador},
--   firma {imagen: data:image/png, trazos, puntos, ancho, alto}, uiVersion, userAgent, documentsOpened.
create or replace function private.visoria_firma(club_key text, token text, payload jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(club_key); l app.visoria_sign_links%rowtype; p app.prospects%rowtype;
        c app.visoria_campaigns%rowtype; v_falta jsonb; v_key text := btrim(coalesce(payload->>'idempotencyKey', ''));
        k app.visoria_consents%rowtype; v_con app.visoria_documents%rowtype; v_priv app.visoria_documents%rowtype;
        v_decl jsonb; d jsonb; v_choices jsonb := '{}'::jsonb; v_val jsonb; s jsonb := coalesce(payload->'signer', '{}'::jsonb);
        v_par text; v_phone text; v_em jsonb; v_text text; v_firma text := coalesce(payload->'firma'->>'imagen', '');
        v_puntos int; v_ancho numeric; v_alto numeric; v_salud jsonb := coalesce(payload->'salud', '{}'::jsonb); v_resp jsonb := '{}'::jsonb;
        q text; r text; v_review boolean := false; v_id uuid; v_snapshot jsonb; v_evidence jsonb; v_eval boolean; v_media boolean;
        v_nombre_menor text; v_fecha text;
begin
  l := private.visoria_liga(v_org, token);
  if l.id is null then raise exception 'Link not valid'; end if;
  select * into p from app.prospects where id = l.prospect_id and archived_at is null;
  if p.id is null then raise exception 'Link not valid'; end if;
  select * into c from app.visoria_campaigns where id = l.campaign_id for update;

  if length(v_key) < 16 or length(v_key) > 80 then raise exception 'Idempotency key required'; end if;
  select * into k from app.visoria_consents where idempotency_key = v_key;
  if k.id is not null then
    if k.prospect_id <> p.id then raise exception 'Link not valid'; end if;
    return jsonb_build_object('consentId', k.id, 'status', k.status, 'existing', true);
  end if;

  v_falta := private.visoria_faltantes(c.id);
  if jsonb_array_length(v_falta) > 0 then raise exception 'Signing closed'; end if;

  -- La versión que la familia vio tiene que ser la vigente.
  if coalesce(payload->>'eventHash', '') <> private.visoria_event_hash(c.id) then raise exception 'Document version changed'; end if;
  select * into v_con from app.visoria_documents d where d.campaign_id = c.id and d.kind = 'consentimiento' and d.status = 'aprobado';
  select * into v_priv from app.visoria_documents d where d.campaign_id = c.id and d.kind = 'privacidad' and d.status = 'aprobado';
  if v_con.id is null or v_priv.id is null or (payload->>'consentDocumentId') is distinct from v_con.id::text
     or (payload->>'privacyDocumentId') is distinct from v_priv.id::text then
    raise exception 'Document version changed';
  end if;

  -- Ya firmó esta versión: no se firma dos veces.
  k := private.visoria_vigente(c.id, p.id);
  if k.id is not null and k.event_hash = private.visoria_event_hash(c.id) then
    return jsonb_build_object('consentId', k.id, 'status', k.status, 'existing', true);
  end if;

  -- Quién firma.
  v_par := coalesce(s->>'relationship', '');
  if v_par not in ('madre', 'padre', 'tutor_legal', 'otro') then raise exception 'Relationship required'; end if;
  if v_par = 'otro' and length(btrim(coalesce(s->>'relationshipDetail', ''))) < 3 then raise exception 'Relationship detail required'; end if;
  if length(btrim(coalesce(s->>'name', ''))) < 5 or btrim(s->>'name') !~ '\S+\s+\S+' then raise exception 'Signer name required'; end if;
  v_phone := private.normalize_public_phone(s->>'phone');
  if v_phone is null then raise exception 'Phone required'; end if;
  if nullif(btrim(coalesce(s->>'email', '')), '') is not null and btrim(s->>'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email'; end if;
  v_em := jsonb_build_object('nombre', left(btrim(coalesce(payload->'emergencia'->>'nombre', '')), 120),
                             'telefono', private.normalize_public_phone(payload->'emergencia'->>'telefono'));
  if length(v_em->>'nombre') < 3 or (v_em->>'telefono') is null then raise exception 'Emergency contact required'; end if;
  if v_em->>'telefono' = v_phone then raise exception 'Emergency contact must be different'; end if;

  -- Cada declaración, una por una, con el texto exacto del servidor.
  v_decl := private.visoria_declaraciones(c.id);
  for d in select * from jsonb_array_elements(v_decl) loop
    v_val := payload->'choices'->(d->>'key');
    if jsonb_typeof(v_val->'value') is distinct from 'boolean' then
      if (d->>'required')::boolean or (d->>'choice')::boolean then raise exception 'Declaration required: %', d->>'key'; end if;
    end if;
    if (d->>'required')::boolean and (v_val->>'value')::boolean is not true then raise exception 'Declaration required: %', d->>'key'; end if;
    v_choices := v_choices || jsonb_build_object(d->>'key', jsonb_build_object('value', (v_val->>'value')::boolean, 'text', d->>'text',
      'required', (d->>'required')::boolean, 'clientAt', left(coalesce(v_val->>'at', ''), 40)));
  end loop;
  v_eval := (v_choices->'transfer_to_evaluator'->>'value')::boolean;
  v_media := coalesce((v_choices->'media_publication'->>'value')::boolean, false);

  -- La firma: un trazo de verdad, no un lienzo en blanco.
  v_puntos := coalesce((payload->'firma'->>'puntos')::int, 0);
  v_ancho := coalesce((payload->'firma'->>'ancho')::numeric, 0);
  v_alto := coalesce((payload->'firma'->>'alto')::numeric, 0);
  if v_firma !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(v_firma) > 200000 or length(v_firma) < 1500
     or v_puntos < 15 or v_ancho < 40 or v_alto < 12 then raise exception 'Signature required'; end if;

  -- Salud: sólo con el consentimiento expreso (ya validado arriba) y sólo lo mínimo.
  foreach q in array array['condicion', 'alergias', 'restriccion', 'atencion'] loop
    r := coalesce(v_salud->q->>'respuesta', '');
    if r not in ('ninguna', 'privado', 'si') then raise exception 'Health answer required: %', q; end if;
    if r = 'si' and length(btrim(coalesce(v_salud->q->>'detalle', ''))) < 2 then raise exception 'Health detail required: %', q; end if;
    if r in ('si', 'privado') then v_review := true; end if;
    v_resp := v_resp || jsonb_build_object(q, jsonb_build_object('respuesta', r,
      'detalle', case when r = 'si' then left(btrim(v_salud->q->>'detalle'), 300) else null end));
  end loop;

  -- El texto exacto que firma esta familia.
  v_nombre_menor := p.first_name || ' ' || p.last_name;
  v_fecha := to_char(p.birth_date, 'DD/MM/YYYY');
  v_text := private.visoria_rellena(v_con.body, jsonb_build_object(
    'firmante', btrim(s->>'name'),
    'parentesco', case v_par when 'madre' then 'MADRE' when 'padre' then 'PADRE' when 'tutor_legal' then 'TUTOR LEGAL'
                              else 'REPRESENTANTE (' || left(btrim(s->>'relationshipDetail'), 80) || ')' end,
    'menor', v_nombre_menor, 'nacimiento', v_fecha, 'telefono_firmante', v_phone,
    'contacto_emergencia', (v_em->>'nombre') || ' · ' || (v_em->>'telefono')));

  v_snapshot := private.visoria_material(c.id) || jsonb_build_object('slug', c.slug, 'campaignId', c.id);
  v_id := gen_random_uuid();
  v_evidence := jsonb_build_object('consentId', v_id, 'campaignId', c.id, 'prospectId', p.id, 'folio', p.folio,
    'eventHash', private.visoria_event_hash(c.id), 'consentHash', private.visoria_sha(v_text), 'consentDocumentHash', v_con.content_hash,
    'privacyHash', v_priv.content_hash, 'choices', v_choices, 'signer', btrim(s->>'name'), 'relationship', v_par,
    'signatureHash', private.visoria_sha(v_firma), 'signedAt', now());

  insert into app.visoria_consents(id, organization_id, campaign_id, prospect_id, sign_link_id, idempotency_key,
    signer_name, relationship, relationship_detail, signer_phone, signer_email,
    event_snapshot, event_hash, consent_document_id, consent_text, consent_text_hash, privacy_document_id, privacy_hash,
    insurance_status, choices, emergency, pickup, signature_png, signature_hash, signature_stats, ui_version, user_agent,
    evidence_hash, review_needed, review_reason)
  values (v_id, v_org, c.id, p.id, l.id, v_key,
    left(btrim(s->>'name'), 120), v_par, nullif(left(btrim(coalesce(s->>'relationshipDetail', '')), 120), ''), v_phone,
    nullif(lower(btrim(coalesce(s->>'email', ''))), ''),
    v_snapshot, private.visoria_event_hash(c.id), v_con.id, v_text, private.visoria_sha(v_text), v_priv.id, v_priv.content_hash,
    c.insurance_status, v_choices, v_em, nullif(left(btrim(coalesce(payload->>'recoge', '')), 300), ''),
    v_firma, private.visoria_sha(v_firma), jsonb_build_object('puntos', v_puntos, 'ancho', v_ancho, 'alto', v_alto,
      'trazos', coalesce((payload->'firma'->>'trazos')::int, 0)),
    left(coalesce(payload->>'uiVersion', ''), 40), left(coalesce(payload->>'userAgent', ''), 300),
    private.visoria_sha(v_evidence::text), v_par = 'otro',
    case when v_par = 'otro' then 'Firma alguien que no es madre, padre ni tutor legal: revisar facultades.' end);

  insert into app.visoria_health(organization_id, consent_id, prospect_id, campaign_id, answers, needs_review, review_status)
  values (v_org, v_id, p.id, c.id, v_resp, v_review, case when v_review then 'pendiente' else 'no_requiere' end);

  insert into app.visoria_media_history(organization_id, campaign_id, prospect_id, consent_id, decision, source, document_version)
  values (v_org, c.id, p.id, v_id, case when v_media then 'otorgada' else 'negada' end, 'firma', v_con.version);
  update app.prospects set image_consent = v_media, image_consent_at = case when v_media then now() else null end, updated_at = now()
   where id = p.id;

  perform private.visoria_audita(v_org, c.id, p.id, v_id, 'familia', 'firma', 'ok', null,
    jsonb_build_object('consentVersion', v_con.version, 'privacyVersion', v_priv.version, 'evaluator', v_eval, 'media', v_media,
                       'documentsOpened', coalesce(payload->'documentsOpened', '[]'::jsonb), 'healthReview', v_review));
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (v_org, 'VisoriaConsentSigned', 'prospect', p.id, jsonb_build_object('campaign', c.slug, 'consentId', v_id, 'version', v_con.version));
  return jsonb_build_object('consentId', v_id, 'status', 'pending_artifact', 'existing', false);
end $$;
revoke all on function private.visoria_firma(text, text, jsonb) from public, anon, authenticated;

-- La envoltura: el intento cuenta para el límite y el rechazo queda en la
-- bitácora aunque la firma no se guarde (lo de adentro se deshace entero).
create or replace function public.v2_public_visoria_sign(club_key text, token text, payload jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(club_key); l app.visoria_sign_links%rowtype;
begin
  begin
    perform private.enforce_public_rate_limit('visoria_firma', 20, interval '1 hour');
  exception when others then return jsonb_build_object('error', 'Too many requests. Try again later.');
  end;
  begin
    return private.visoria_firma(club_key, token, payload);
  exception when others then
    if v_org is not null then
      l := private.visoria_liga(v_org, token);
      perform private.visoria_audita(v_org, l.campaign_id, l.prospect_id, null, 'familia', 'firma', 'rechazado', sqlerrm, '{}'::jsonb);
    end if;
    return jsonb_build_object('error', sqlerrm);
  end;
end $$;
revoke all on function public.v2_public_visoria_sign(text, text, jsonb) from public;
grant execute on function public.v2_public_visoria_sign(text, text, jsonb) to anon, authenticated;

-- La familia retira el permiso de fotos para lo que viene (no borra la historia).
create or replace function public.v2_public_visoria_media_revoke(club_key text, token text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(club_key); l app.visoria_sign_links%rowtype; k app.visoria_consents%rowtype;
begin
  perform private.enforce_public_rate_limit('visoria_liga', 60, interval '1 hour');
  l := private.visoria_liga(v_org, token);
  if l.id is null then raise exception 'Link not valid'; end if;
  k := private.visoria_vigente(l.campaign_id, l.prospect_id);
  insert into app.visoria_media_history(organization_id, campaign_id, prospect_id, consent_id, decision, source)
  values (v_org, l.campaign_id, l.prospect_id, k.id, 'revocada', 'familia_liga');
  update app.prospects set image_consent = false, image_consent_at = null, updated_at = now() where id = l.prospect_id;
  perform private.visoria_audita(v_org, l.campaign_id, l.prospect_id, k.id, 'familia', 'imagen_revocada', 'ok', null, '{}'::jsonb);
  return jsonb_build_object('imageConsent', false);
end $$;
revoke all on function public.v2_public_visoria_media_revoke(text, text) from public;
grant execute on function public.v2_public_visoria_media_revoke(text, text) to anon, authenticated;

-- ---------- Para la función del expediente (sólo llave de servicio) ----------
-- Lo que lleva el PDF: sin salud. Quien lo pide: la familia (token) o staff.
create or replace function public.v2_visoria_artifact_context(consent_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare k app.visoria_consents%rowtype; p app.prospects%rowtype; c app.visoria_campaigns%rowtype; v_priv app.visoria_documents%rowtype;
        v_con app.visoria_documents%rowtype;
begin
  select * into k from app.visoria_consents where id = v2_visoria_artifact_context.consent_id;
  if k.id is null then raise exception 'Consent not found'; end if;
  select * into p from app.prospects where id = k.prospect_id;
  select * into c from app.visoria_campaigns where id = k.campaign_id;
  select * into v_priv from app.visoria_documents where id = k.privacy_document_id;
  select * into v_con from app.visoria_documents where id = k.consent_document_id;
  return jsonb_build_object('consentId', k.id, 'organizationId', k.organization_id, 'folio', p.folio,
    'child', jsonb_build_object('name', p.first_name || ' ' || p.last_name, 'birthDate', p.birth_date),
    'campaign', jsonb_build_object('title', c.title, 'slug', c.slug, 'location', k.event_snapshot->>'location', 'dates', k.event_snapshot->>'datesLabel',
                                   'organizer', k.event_snapshot->'legal'->>'organizador_legal', 'schedule', k.event_snapshot->'legal'->>'fecha_horario'),
    'signer', jsonb_build_object('name', k.signer_name, 'relationship', k.relationship, 'relationshipDetail', k.relationship_detail, 'phone', k.signer_phone),
    'emergency', k.emergency, 'pickup', k.pickup, 'insurance', k.insurance_status,
    'consent', jsonb_build_object('version', v_con.version, 'title', v_con.title, 'text', k.consent_text, 'hash', k.consent_text_hash, 'templateHash', v_con.content_hash),
    'privacy', jsonb_build_object('version', v_priv.version, 'title', v_priv.title, 'text', v_priv.body, 'hash', v_priv.content_hash),
    'choices', k.choices, 'signaturePng', k.signature_png, 'signatureHash', k.signature_hash,
    'signedAt', k.signed_at, 'timezone', k.timezone, 'eventHash', k.event_hash, 'evidenceHash', k.evidence_hash,
    'status', k.status, 'artifactPath', k.artifact_path, 'artifactSha256', k.artifact_sha256,
    'healthGiven', exists (select 1 from app.visoria_health h where h.consent_id = k.id));
end $$;

create or replace function public.v2_visoria_artifact_attach(consent_id uuid, path text, sha256 text, actor text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare k app.visoria_consents%rowtype; v text;
begin
  select * into k from app.visoria_consents where id = v2_visoria_artifact_attach.consent_id for update;
  if k.id is null then raise exception 'Consent not found'; end if;
  if k.artifact_path is not null then return jsonb_build_object('status', k.status, 'path', k.artifact_path, 'sha256', k.artifact_sha256, 'existing', true); end if;
  if coalesce(sha256, '') !~ '^[0-9a-f]{64}$' or coalesce(path, '') = '' then raise exception 'Invalid artifact'; end if;
  update app.visoria_consents set artifact_path = path, artifact_sha256 = v2_visoria_artifact_attach.sha256, artifact_at = now() where id = k.id;
  v := private.visoria_asienta(k.id);
  insert into app.visoria_audit(organization_id, campaign_id, prospect_id, consent_id, actor_kind, action, result, detail)
  values (k.organization_id, k.campaign_id, k.prospect_id, k.id, 'sistema', 'expediente_generado', 'ok', jsonb_build_object('sha256', sha256, 'by', left(actor, 40)));
  return jsonb_build_object('status', v, 'path', path, 'sha256', sha256, 'existing', false);
end $$;

-- Quién puede pedir el PDF: la liga de esa familia (sólo su consentimiento)
-- o staff de Fichajes/Visorías. Cada descarga queda en la bitácora.
create or replace function public.v2_visoria_artifact_access(consent_id uuid, token text, user_id uuid, purpose text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare k app.visoria_consents%rowtype; l app.visoria_sign_links%rowtype; v_ok boolean := false; v_kind text;
begin
  select * into k from app.visoria_consents where id = v2_visoria_artifact_access.consent_id;
  if k.id is null then raise exception 'Consent not found'; end if;
  if token is not null then
    l := private.visoria_liga(k.organization_id, token);
    v_ok := l.id is not null and l.prospect_id = k.prospect_id and l.campaign_id = k.campaign_id; v_kind := 'familia';
  elsif user_id is not null then
    v_ok := exists (select 1 from public.organization_memberships m
                     left join public.role_module_permissions rp on rp.organization_id = m.organization_id and rp.role = m.role and rp.module_code in ('prospectos', 'scouting')
                     left join private.membership_module_overrides mo on mo.organization_id = m.organization_id and mo.membership_id = m.id and mo.module_code in ('prospectos', 'scouting')
                    where m.organization_id = k.organization_id and m.user_id = v2_visoria_artifact_access.user_id and m.active
                      and coalesce(mo.can_write, rp.can_write, false));
    v_kind := 'staff';
  end if;
  insert into app.visoria_audit(organization_id, campaign_id, prospect_id, consent_id, actor_user_id, actor_kind, action, result, reason)
  values (k.organization_id, k.campaign_id, k.prospect_id, k.id, user_id, coalesce(v_kind, 'familia'), 'expediente_' || left(coalesce(purpose, 'descarga'), 30),
          case when v_ok then 'ok' else 'rechazado' end, null);
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'Not authorized'); end if;
  return jsonb_build_object('ok', true, 'path', k.artifact_path, 'status', k.status);
end $$;

-- La familia que apenas firmó encuentra su expediente con su liga.
create or replace function public.v2_visoria_consent_by_token(token text)
returns uuid language plpgsql stable security definer set search_path to '' as $$
declare l app.visoria_sign_links%rowtype;
begin
  select * into l from app.visoria_sign_links s where s.token_hash = private.visoria_sha(token) and s.revoked_at is null and s.expires_at > now();
  if l.id is null then return null; end if;
  return (private.visoria_vigente(l.campaign_id, l.prospect_id)).id;
end $$;

revoke all on function public.v2_visoria_artifact_context(uuid) from public, anon, authenticated;
revoke all on function public.v2_visoria_artifact_attach(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.v2_visoria_artifact_access(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.v2_visoria_consent_by_token(text) from public, anon, authenticated;
grant execute on function public.v2_visoria_artifact_context(uuid) to service_role;
grant execute on function public.v2_visoria_artifact_attach(uuid, text, text, text) to service_role;
grant execute on function public.v2_visoria_artifact_access(uuid, text, uuid, text) to service_role;
grant execute on function public.v2_visoria_consent_by_token(text) to service_role;

-- ---------- Staff ----------
-- El tablero: Fichajes ve contacto y emergencia; Visores, sólo lo deportivo.
-- Salud: nadie aquí. Sólo el estado de la revisión médica.
create or replace function public.v2_visoria_board(organization_id uuid, slug text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_board.organization_id; v_todo boolean; v_c app.visoria_campaigns%rowtype;
begin
  v_todo := private.has_module_access(v_org, 'prospects', false);
  if not (v_todo or private.has_module_access(v_org, 'scouting', false)) then raise exception 'Not authorized'; end if;
  select * into v_c from app.visoria_campaigns c where c.organization_id = v_org and c.slug = coalesce(v2_visoria_board.slug, c.slug)
   order by c.starts_on desc nulls last limit 1;
  if v_c.id is null then return jsonb_build_object('campaign', null, 'items', '[]'::jsonb, 'canSeeContact', v_todo); end if;
  return jsonb_build_object(
    'campaign', jsonb_build_object('id', v_c.id, 'slug', v_c.slug, 'title', v_c.title, 'datesLabel', v_c.dates_label, 'location', v_c.location,
                                   'startsOn', v_c.starts_on, 'capacity', v_c.capacity, 'open', v_c.is_open,
                                   'signingOpen', jsonb_array_length(private.visoria_faltantes(v_c.id)) = 0),
    'canSeeContact', v_todo,
    'canWrite', private.has_module_access(v_org, 'prospects', true) or private.has_module_access(v_org, 'scouting', true),
    'canHealth', private.has_module_access(v_org, 'visoria_salud', false),
    'canAdmin', private.has_module_access(v_org, 'admin', true),
    'items', coalesce((select jsonb_agg(x.j order by x.creado) from (
      select p.created_at as creado, jsonb_build_object(
        'id', p.id, 'folio', p.folio, 'firstName', p.first_name, 'lastName', p.last_name, 'birthDate', p.birth_date,
        'sex', p.sex, 'category', p.category_interest, 'type', p.registration_type, 'foot', p.dominant_foot, 'school', p.school_name,
        'position', p.metadata->'visoria'->>'posicion', 'photoPath', p.photo_path, 'photoThumbPath', p.photo_thumb_path,
        'imageConsent', p.image_consent,
        'access', case when v_todo then private.visoria_acceso(v_c.id, p.id)
                       else jsonb_build_object('status', case when private.visoria_acceso(v_c.id, p.id)->>'status' = 'AUTORIZADO' then 'AUTORIZADO' else 'NO_AUTORIZADO' end) end,
        'signed', (private.visoria_acceso(v_c.id, p.id)->>'consentId') is not null,
        'alert', coalesce((p.metadata->'visoria'->>'alertaOperativa')::boolean, false),
        'arrivedAt', p.metadata->'visoria'->>'llegoAt', 'channel', p.source_channel, 'createdAt', p.created_at,
        'evaluations', (select count(*) from app.scouting_reports r where r.prospect_id = p.id),
        'verdict', (select r.verdict from app.scouting_reports r where r.prospect_id = p.id order by r.created_at desc limit 1))
        || case when v_todo then (select jsonb_build_object(
             'guardian', p.guardian_name, 'phone', p.phone, 'email', p.email,
             'relationship', p.metadata->'visoria'->>'parentesco',
             'emergencia', coalesce(k.emergency, p.metadata->'visoria'->'emergencia'), 'recoge', coalesce(k.pickup, p.metadata->'visoria'->>'recoge'),
             'signedBy', k.signer_name, 'signedRelationship', k.relationship, 'signedAt', k.signed_at,
             'verification', k.verification_method, 'verifiedAt', k.verified_at, 'reviewReason', k.review_reason,
             'transfer', (k.choices->'transfer_to_evaluator'->>'value')::boolean, 'hasCopy', k.artifact_path is not null,
             'alertNote', p.metadata->'visoria'->>'alertaNota')
             from (select 1) u left join lateral (select * from app.visoria_consents kk where kk.campaign_id = v_c.id and kk.prospect_id = p.id and kk.invalidated_at is null order by kk.signed_at desc limit 1) k on true)
           else '{}'::jsonb end as j
        from app.prospects p
       where p.organization_id = v_org and p.source_campaign = v_c.slug and p.archived_at is null) x), '[]'::jsonb));
end $$;
revoke all on function public.v2_visoria_board(uuid, text) from public, anon;
grant execute on function public.v2_visoria_board(uuid, text) to authenticated;

create or replace function private.visoria_consent_de(p_org uuid, p_consent uuid)
returns app.visoria_consents language sql stable security definer set search_path to '' as $$
  select * from app.visoria_consents where id = p_consent and organization_id = p_org
$$;
revoke all on function private.visoria_consent_de(uuid, uuid) from public, anon, authenticated;

-- Verificar la identidad de quien firmó: por el WhatsApp del club (el pase
-- llegó del número registrado) o en persona con identificación.
create or replace function public.v2_visoria_verify(organization_id uuid, consent_id uuid, method text, reference text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_verify.organization_id; k app.visoria_consents%rowtype; v text;
begin
  if not (private.has_module_access(v_org, 'prospects', true) or private.has_module_access(v_org, 'scouting', true)) then raise exception 'Not authorized'; end if;
  k := private.visoria_consent_de(v_org, consent_id);
  if k.id is null then raise exception 'Consent not found'; end if;
  if k.invalidated_at is not null then raise exception 'Consent is invalid'; end if;
  if method not in ('whatsapp_club', 'presencial_identificacion') then raise exception 'Invalid verification method'; end if;
  if length(btrim(coalesce(reference, ''))) < 3 then raise exception 'Verification reference required'; end if;
  if k.verified_at is not null then return jsonb_build_object('status', k.status, 'existing', true); end if;
  update app.visoria_consents set verification_method = method, verification_reference = left(btrim(reference), 200),
         verified_by = (select auth.uid()), verified_at = now() where id = k.id;
  v := private.visoria_asienta(k.id);
  perform private.visoria_audita(v_org, k.campaign_id, k.prospect_id, k.id, 'staff', 'identidad_verificada', 'ok', null, jsonb_build_object('method', method));
  return jsonb_build_object('status', v);
end $$;

-- Firmó alguien que no es mamá, papá ni tutor legal: alguien lo revisa.
create or replace function public.v2_visoria_review(organization_id uuid, consent_id uuid, approve boolean, note text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_review.organization_id; k app.visoria_consents%rowtype; v text;
begin
  if not private.has_module_access(v_org, 'prospects', true) then raise exception 'Not authorized'; end if;
  k := private.visoria_consent_de(v_org, consent_id);
  if k.id is null then raise exception 'Consent not found'; end if;
  if length(btrim(coalesce(note, ''))) < 5 then raise exception 'Note required'; end if;
  if approve then
    update app.visoria_consents set review_resolved_at = now(), review_resolved_by = (select auth.uid()), review_note = left(btrim(note), 500) where id = k.id;
  else
    update app.visoria_consents set invalidated_at = now(), invalidated_by = (select auth.uid()), invalid_reason = left(btrim(note), 500) where id = k.id;
  end if;
  v := private.visoria_asienta(k.id);
  perform private.visoria_audita(v_org, k.campaign_id, k.prospect_id, k.id, 'staff', case when approve then 'facultades_aprobadas' else 'consentimiento_invalidado' end, 'ok', note, '{}'::jsonb);
  return jsonb_build_object('status', v);
end $$;

-- Anular un consentimiento (no se borra: queda con su motivo).
create or replace function public.v2_visoria_invalidate(organization_id uuid, consent_id uuid, reason text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_invalidate.organization_id; k app.visoria_consents%rowtype;
begin
  if not private.has_module_access(v_org, 'prospects', true) then raise exception 'Not authorized'; end if;
  k := private.visoria_consent_de(v_org, consent_id);
  if k.id is null then raise exception 'Consent not found'; end if;
  if length(btrim(coalesce(reason, ''))) < 5 then raise exception 'Reason required'; end if;
  update app.visoria_consents set invalidated_at = now(), invalidated_by = (select auth.uid()), invalid_reason = left(btrim(reason), 500) where id = k.id and invalidated_at is null;
  perform private.visoria_asienta(k.id);
  perform private.visoria_audita(v_org, k.campaign_id, k.prospect_id, k.id, 'staff', 'consentimiento_invalidado', 'ok', reason, '{}'::jsonb);
  return jsonb_build_object('status', 'invalid');
end $$;

-- Alerta operativa: no entra a la cancha hasta que se quite.
create or replace function public.v2_visoria_alert(organization_id uuid, prospect_id uuid, value boolean, note text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_alert.organization_id; p app.prospects%rowtype; v_c uuid;
begin
  if not (private.has_module_access(v_org, 'prospects', true) or private.has_module_access(v_org, 'scouting', true)) then raise exception 'Not authorized'; end if;
  select * into p from app.prospects pp where pp.id = v2_visoria_alert.prospect_id and pp.organization_id = v_org for update;
  if p.id is null or p.metadata->'visoria' is null then raise exception 'Prospect not found'; end if;
  if value and length(btrim(coalesce(note, ''))) < 3 then raise exception 'Note required'; end if;
  update app.prospects set metadata = jsonb_set(metadata, '{visoria}', (metadata->'visoria') - 'alertaOperativa' - 'alertaNota'
           || case when value then jsonb_build_object('alertaOperativa', true, 'alertaNota', left(btrim(note), 200)) else '{}'::jsonb end),
         updated_at = now() where id = p.id;
  select c.id into v_c from app.visoria_campaigns c where c.organization_id = v_org and c.slug = p.source_campaign;
  perform private.visoria_audita(v_org, v_c, p.id, null, 'staff', case when value then 'alerta_operativa' else 'alerta_retirada' end, 'ok', note, '{}'::jsonb);
  return jsonb_build_object('alert', value);
end $$;

-- Liga para que la familia firme (o descargue su copia). Va por WhatsApp.
create or replace function public.v2_visoria_sign_link(organization_id uuid, prospect_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_sign_link.organization_id; p app.prospects%rowtype; v_c uuid;
begin
  if not private.has_module_access(v_org, 'prospects', true) then raise exception 'Not authorized'; end if;
  select * into p from app.prospects pp where pp.id = v2_visoria_sign_link.prospect_id and pp.organization_id = v_org;
  select c.id into v_c from app.visoria_campaigns c where c.organization_id = v_org and c.slug = p.source_campaign;
  if p.id is null or v_c is null then raise exception 'Prospect not found'; end if;
  perform private.visoria_audita(v_org, v_c, p.id, null, 'staff', 'liga_enviada', 'ok', null, '{}'::jsonb);
  return jsonb_build_object('token', private.visoria_nueva_liga(v_org, v_c, p.id), 'phone', p.phone, 'guardian', p.guardian_name, 'firstName', p.first_name);
end $$;

-- La familia pidió (por WhatsApp o en persona) cambiar el permiso de fotos.
create or replace function public.v2_visoria_media(organization_id uuid, prospect_id uuid, value boolean, source text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_media.organization_id; p app.prospects%rowtype; v_c uuid; k app.visoria_consents%rowtype;
begin
  if not private.has_module_access(v_org, 'prospects', true) then raise exception 'Not authorized'; end if;
  select * into p from app.prospects pp where pp.id = v2_visoria_media.prospect_id and pp.organization_id = v_org for update;
  select c.id into v_c from app.visoria_campaigns c where c.organization_id = v_org and c.slug = p.source_campaign;
  if p.id is null or v_c is null then raise exception 'Prospect not found'; end if;
  if length(btrim(coalesce(source, ''))) < 3 then raise exception 'Source required'; end if;
  -- Otorgar sólo con su firma: el staff no puede encender un permiso que la familia no dio.
  if value then raise exception 'Only the family can grant image permission'; end if;
  k := private.visoria_vigente(v_c, p.id);
  insert into app.visoria_media_history(organization_id, campaign_id, prospect_id, consent_id, decision, source, actor_user_id)
  values (v_org, v_c, p.id, k.id, 'revocada', left(btrim(source), 120), (select auth.uid()));
  update app.prospects set image_consent = false, image_consent_at = null, updated_at = now() where id = p.id;
  perform private.visoria_audita(v_org, v_c, p.id, k.id, 'staff', 'imagen_revocada', 'ok', source, '{}'::jsonb);
  return jsonb_build_object('imageConsent', false);
end $$;

-- Ficha de salud: sólo con el módulo de salud, con motivo, y queda auditado.
create or replace function public.v2_visoria_health(organization_id uuid, consent_id uuid, reason text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_health.organization_id; h app.visoria_health%rowtype;
begin
  if not private.is_active_member(v_org) then raise exception 'Not authorized'; end if;
  if not private.has_module_access(v_org, 'visoria_salud', false) then
    perform private.visoria_audita(v_org, null, null, consent_id, 'staff', 'salud_consultada', 'rechazado', 'Not authorized', '{}'::jsonb);
    return jsonb_build_object('error', 'Not authorized');
  end if;
  if length(btrim(coalesce(reason, ''))) < 3 then raise exception 'Reason required'; end if;
  select * into h from app.visoria_health hh where hh.consent_id = v2_visoria_health.consent_id and hh.organization_id = v_org;
  if h.id is null then raise exception 'Health record not found'; end if;
  perform private.visoria_audita(v_org, h.campaign_id, h.prospect_id, h.consent_id, 'staff', 'salud_consultada', 'ok', reason, '{}'::jsonb);
  return jsonb_build_object('answers', h.answers, 'needsReview', h.needs_review, 'reviewStatus', h.review_status, 'reviewNote', h.review_note, 'reviewedAt', h.reviewed_at);
end $$;

create or replace function public.v2_visoria_health_review(organization_id uuid, consent_id uuid, decision text, note text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_health_review.organization_id; h app.visoria_health%rowtype;
begin
  if not private.has_module_access(v_org, 'visoria_salud', true) then raise exception 'Not authorized'; end if;
  if decision not in ('apto', 'no_apto', 'pendiente') then raise exception 'Invalid decision'; end if;
  if length(btrim(coalesce(note, ''))) < 5 then raise exception 'Note required'; end if;
  select * into h from app.visoria_health hh where hh.consent_id = v2_visoria_health_review.consent_id and hh.organization_id = v_org for update;
  if h.id is null then raise exception 'Health record not found'; end if;
  update app.visoria_health set review_status = decision, reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = left(btrim(note), 500) where id = h.id;
  perform private.visoria_audita(v_org, h.campaign_id, h.prospect_id, h.consent_id, 'staff', 'revision_medica', 'ok', null, jsonb_build_object('decision', decision));
  return jsonb_build_object('reviewStatus', decision);
end $$;

-- Lo que se le entregó al club evaluador: sólo con su autorización, sin salud.
create or replace function public.v2_visoria_transfer(organization_id uuid, prospect_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_transfer.organization_id; p app.prospects%rowtype; c app.visoria_campaigns%rowtype; k app.visoria_consents%rowtype;
begin
  if not private.has_module_access(v_org, 'prospects', true) then raise exception 'Not authorized'; end if;
  select * into p from app.prospects pp where pp.id = v2_visoria_transfer.prospect_id and pp.organization_id = v_org;
  select * into c from app.visoria_campaigns cc where cc.organization_id = v_org and cc.slug = p.source_campaign;
  if p.id is null or c.id is null then raise exception 'Prospect not found'; end if;
  k := private.visoria_vigente(c.id, p.id);
  if k.id is null or (k.choices->'transfer_to_evaluator'->>'value')::boolean is not true or k.event_hash <> private.visoria_event_hash(c.id) then
    perform private.visoria_audita(v_org, c.id, p.id, k.id, 'staff', 'transferencia_evaluador', 'rechazado', 'Sin autorización vigente', '{}'::jsonb);
    return jsonb_build_object('error', 'Transfer not authorized');
  end if;
  insert into app.visoria_transfers(organization_id, campaign_id, prospect_id, consent_id, evaluator, data_categories, purpose, actor_user_id)
  values (v_org, c.id, p.id, k.id, c.legal_config->>'evaluador_nombre', c.legal_config->>'evaluador_datos', c.legal_config->>'evaluador_finalidad', (select auth.uid()));
  perform private.visoria_audita(v_org, c.id, p.id, k.id, 'staff', 'transferencia_evaluador', 'ok', null, '{}'::jsonb);
  -- Sólo lo deportivo. Nunca salud ni contacto.
  return jsonb_build_object('evaluator', c.legal_config->>'evaluador_nombre', 'data', jsonb_build_object(
    'nombre', p.first_name || ' ' || p.last_name, 'nacimiento', p.birth_date, 'categoria', p.category_interest,
    'posicion', p.metadata->'visoria'->>'posicion', 'pierna', p.dominant_foot,
    'evaluaciones', (select coalesce(jsonb_agg(jsonb_build_object('fecha', r.observed_at, 'veredicto', r.verdict, 'tecnica', r.technical_score,
       'fisico', r.physical_score, 'tactica', r.tactical_score, 'actitud', r.mental_score)), '[]'::jsonb) from app.scouting_reports r where r.prospect_id = p.id)));
end $$;

-- Configuración del evento, qué falta para abrir la firma y la bitácora.
create or replace function public.v2_visoria_setup(organization_id uuid, slug text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_setup.organization_id; c app.visoria_campaigns%rowtype;
begin
  if not private.has_module_access(v_org, 'prospects', false) then raise exception 'Not authorized'; end if;
  select * into c from app.visoria_campaigns cc where cc.organization_id = v_org and cc.slug = coalesce(v2_visoria_setup.slug, cc.slug)
   order by cc.starts_on desc nulls last limit 1;
  if c.id is null then raise exception 'Campaign not found'; end if;
  return jsonb_build_object(
    'campaign', jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'datesLabel', c.dates_label, 'location', c.location,
      'startsOn', c.starts_on, 'capacity', c.capacity, 'open', c.is_open, 'legal', c.legal_config,
      'insurance', c.insurance_status, 'insuranceDetail', c.insurance_detail, 'insuranceVerifiedAt', c.insurance_verified_at),
    'required', to_jsonb(private.visoria_campos_requeridos()),
    'missing', private.visoria_faltantes(c.id),
    'eventHash', private.visoria_event_hash(c.id),
    'canAdmin', private.has_module_access(v_org, 'admin', true),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('gate', a.gate, 'note', a.note, 'approvedAt', a.approved_at,
        'current', a.event_hash = private.visoria_event_hash(c.id) and a.revoked_at is null, 'revokedAt', a.revoked_at) order by a.approved_at desc)
        from app.visoria_approvals a where a.campaign_id = c.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'version', d.version, 'title', d.title, 'status', d.status,
        'hash', d.content_hash, 'campaign', d.campaign_id is not null, 'createdAt', d.created_at, 'approvedAt', d.approved_at, 'body', d.body) order by d.created_at desc)
        from app.visoria_documents d where d.organization_id = v_org and (d.campaign_id = c.id or (d.campaign_id is null and d.status = 'plantilla'))), '[]'::jsonb),
    'counts', (select jsonb_build_object('consents', count(*), 'signed', count(*) filter (where k.status = 'signed'))
                 from app.visoria_consents k where k.campaign_id = c.id and k.invalidated_at is null),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('at', a.occurred_at, 'action', a.action, 'result', a.result, 'kind', a.actor_kind,
        'reason', a.reason, 'prospectId', a.prospect_id) order by a.occurred_at desc) from (select * from app.visoria_audit aa where aa.campaign_id = c.id order by aa.occurred_at desc limit 80) a), '[]'::jsonb));
end $$;

-- Cambiar la configuración. Si cambia algo material, las aprobaciones dejan de
-- valer solas (la huella cambia) y los consentimientos piden firma nueva.
create or replace function public.v2_visoria_setup_update(organization_id uuid, campaign_id uuid, changes jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_setup_update.organization_id; c app.visoria_campaigns%rowtype; v_antes text; v_despues text;
        v_legal jsonb; k text; v_ins text;
begin
  if not private.has_module_access(v_org, 'admin', true) then raise exception 'Not authorized'; end if;
  select * into c from app.visoria_campaigns cc where cc.id = v2_visoria_setup_update.campaign_id and cc.organization_id = v_org for update;
  if c.id is null then raise exception 'Campaign not found'; end if;
  v_antes := private.visoria_event_hash(c.id);
  v_legal := c.legal_config;
  for k in select jsonb_object_keys(coalesce(changes->'legal', '{}'::jsonb)) loop
    if k !~ '^[a-z_]{3,40}$' then raise exception 'Invalid field'; end if;
    v_legal := v_legal || jsonb_build_object(k, left(btrim(coalesce(changes->'legal'->>k, '')), 2000));
  end loop;
  v_ins := coalesce(changes->>'insurance', c.insurance_status);
  if v_ins not in ('sin_verificar', 'sin_seguro_verificado', 'con_seguro_verificado') then raise exception 'Invalid insurance status'; end if;
  update app.visoria_campaigns set
    legal_config = v_legal,
    location = coalesce(nullif(btrim(changes->>'location'), ''), location),
    dates_label = coalesce(nullif(btrim(changes->>'datesLabel'), ''), dates_label),
    is_open = coalesce((changes->>'open')::boolean, is_open),
    insurance_status = v_ins,
    insurance_detail = case when changes ? 'insuranceDetail' then nullif(left(btrim(changes->>'insuranceDetail'), 3000), '') else insurance_detail end,
    insurance_verified_by = case when v_ins is distinct from c.insurance_status then (select auth.uid()) else insurance_verified_by end,
    insurance_verified_at = case when v_ins is distinct from c.insurance_status then now() else insurance_verified_at end,
    updated_at = now()
  where id = c.id;
  v_despues := private.visoria_event_hash(c.id);
  perform private.visoria_audita(v_org, c.id, null, null, 'staff', 'evento_actualizado', 'ok', null,
    jsonb_build_object('material', v_antes <> v_despues, 'fields', coalesce((select jsonb_agg(x) from jsonb_object_keys(coalesce(changes->'legal', '{}'::jsonb)) x), '[]'::jsonb)
      || case when changes ? 'insurance' then '["seguro"]'::jsonb else '[]'::jsonb end));
  return jsonb_build_object('materialChange', v_antes <> v_despues, 'eventHash', v_despues, 'missing', private.visoria_faltantes(c.id));
end $$;

-- Nueva versión de una plantilla (consentimiento, aviso o cláusula). La
-- anterior se retira; no se edita ni se borra.
create or replace function public.v2_visoria_template(organization_id uuid, kind text, title text, body text, version text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_template.organization_id; v_id uuid;
begin
  if not private.has_module_access(v_org, 'admin', true) then raise exception 'Not authorized'; end if;
  if kind not in ('consentimiento', 'privacidad', 'clausula_sin_seguro', 'clausula_con_seguro') then raise exception 'Invalid kind'; end if;
  if length(btrim(coalesce(body, ''))) < 50 or length(btrim(coalesce(title, ''))) < 3 or length(btrim(coalesce(version, ''))) < 2 then raise exception 'Document incomplete'; end if;
  update app.visoria_documents d set status = 'retirada', retired_at = now()
   where d.organization_id = v_org and d.campaign_id is null and d.kind = v2_visoria_template.kind and d.status = 'plantilla';
  insert into app.visoria_documents(organization_id, campaign_id, kind, version, title, body, content_hash, status, created_by)
  values (v_org, null, kind, left(btrim(version), 40), left(btrim(title), 200), body, private.visoria_sha(body), 'plantilla', (select auth.uid()))
  returning id into v_id;
  perform private.visoria_audita(v_org, null, null, null, 'staff', 'plantilla_nueva', 'ok', null, jsonb_build_object('kind', kind, 'version', version));
  return jsonb_build_object('id', v_id);
end $$;

-- Aprobar. La legal congela el consentimiento y el aviso de esta visoría con
-- los datos del evento; no se puede con un campo vacío o un placeholder.
create or replace function public.v2_visoria_approve(organization_id uuid, campaign_id uuid, gate text, note text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_approve.organization_id; c app.visoria_campaigns%rowtype; v_falta jsonb; v_n int;
        v_campos jsonb; t_con app.visoria_documents%rowtype; t_priv app.visoria_documents%rowtype; v_con text; v_priv text;
        v_pend text[]; v_ver text; v_hash text;
begin
  if not private.has_module_access(v_org, 'admin', true) then raise exception 'Not authorized'; end if;
  select * into c from app.visoria_campaigns cc where cc.id = v2_visoria_approve.campaign_id and cc.organization_id = v_org for update;
  if c.id is null then raise exception 'Campaign not found'; end if;
  if gate not in ('legal', 'operativa', 'seguridad') then raise exception 'Invalid gate'; end if;
  if length(btrim(coalesce(note, ''))) < 15 then raise exception 'Approval note required'; end if;
  v_falta := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(private.visoria_faltantes(c.id)) x
               where x::text not like '"aprobacion:%');
  if jsonb_array_length(v_falta) > 0 then raise exception 'Event setup incomplete: %', v_falta::text; end if;
  v_hash := private.visoria_event_hash(c.id);

  if gate = 'legal' then
    select * into t_con from app.visoria_documents d where d.organization_id = v_org and d.campaign_id is null and d.kind = 'consentimiento' and d.status = 'plantilla';
    select * into t_priv from app.visoria_documents d where d.organization_id = v_org and d.campaign_id is null and d.kind = 'privacidad' and d.status = 'plantilla';
    if t_con.id is null or t_priv.id is null then raise exception 'Templates missing'; end if;
    select count(*) + 1 into v_n from app.visoria_documents d where d.campaign_id = c.id and d.kind = 'consentimiento';
    v_ver := c.slug || '-v' || v_n;
    v_campos := private.visoria_campos_evento(c.id, 'CONSENTIMIENTO ' || v_ver, 'AVISO ' || v_ver);
    v_con := private.visoria_rellena(t_con.body, v_campos);
    v_priv := private.visoria_rellena(t_priv.body, v_campos);
    v_pend := private.visoria_pendientes_de_texto(v_con) || private.visoria_pendientes_de_texto(v_priv);
    if array_length(v_pend, 1) > 0 then raise exception 'Unresolved fields: %', array_to_string(v_pend, ', '); end if;
    if v_con ~ '\[[A-ZÁÉÍÓÚÑ /]{4,}\]' or v_priv ~ '\[[A-ZÁÉÍÓÚÑ /]{4,}\]' then raise exception 'Unresolved bracket placeholders'; end if;
    update app.visoria_documents d set status = 'reemplazado' where d.campaign_id = c.id and d.status = 'aprobado';
    insert into app.visoria_documents(organization_id, campaign_id, kind, version, title, body, content_hash, status, source_template_ids, created_by, approved_by, approved_at)
    values (v_org, c.id, 'consentimiento', 'CONSENTIMIENTO ' || v_ver, t_con.title, v_con, private.visoria_sha(v_con), 'aprobado',
            jsonb_build_object('consentimiento', t_con.id, 'clausula', c.insurance_status), (select auth.uid()), (select auth.uid()), now()),
           (v_org, c.id, 'privacidad', 'AVISO ' || v_ver, t_priv.title, v_priv, private.visoria_sha(v_priv), 'aprobado',
            jsonb_build_object('privacidad', t_priv.id), (select auth.uid()), (select auth.uid()), now());
  end if;

  insert into app.visoria_approvals(organization_id, campaign_id, gate, event_hash, note, approved_by)
  values (v_org, c.id, gate, v_hash, left(btrim(note), 1000), (select auth.uid()));
  perform private.visoria_audita(v_org, c.id, null, null, 'staff', 'aprobacion_' || gate, 'ok', note, jsonb_build_object('eventHash', v_hash));
  return jsonb_build_object('missing', private.visoria_faltantes(c.id), 'eventHash', v_hash);
end $$;

-- Quitar una aprobación (cierra la firma de inmediato).
create or replace function public.v2_visoria_revoke_approval(organization_id uuid, campaign_id uuid, gate text, reason text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_revoke_approval.organization_id;
begin
  if not private.has_module_access(v_org, 'admin', true) then raise exception 'Not authorized'; end if;
  if length(btrim(coalesce(reason, ''))) < 5 then raise exception 'Reason required'; end if;
  update app.visoria_approvals a set revoked_at = now(), revoked_by = (select auth.uid()), revoke_reason = left(btrim(reason), 500)
   where a.campaign_id = v2_visoria_revoke_approval.campaign_id and a.organization_id = v_org and a.gate = v2_visoria_revoke_approval.gate and a.revoked_at is null;
  perform private.visoria_audita(v_org, campaign_id, null, null, 'staff', 'aprobacion_retirada_' || gate, 'ok', reason, '{}'::jsonb);
  return jsonb_build_object('missing', private.visoria_faltantes(campaign_id));
end $$;

-- Incidentes: se registran hechos, no culpas. Lo crea el staff en cancha; lo
-- ven Presidencia (salud) y quien lo registró. Nada se reescribe: se agrega.
create or replace function public.v2_visoria_incident(organization_id uuid, campaign_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_incident.organization_id; v_id uuid; v_p uuid := nullif(payload->>'prospectId', '')::uuid;
begin
  if not (private.has_module_access(v_org, 'prospects', true) or private.has_module_access(v_org, 'scouting', true)) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from app.visoria_campaigns c where c.id = v2_visoria_incident.campaign_id and c.organization_id = v_org) then raise exception 'Campaign not found'; end if;
  if v_p is not null and not exists (select 1 from app.prospects p where p.id = v_p and p.organization_id = v_org) then raise exception 'Prospect not found'; end if;
  if length(btrim(coalesce(payload->>'facts', ''))) < 10 or length(btrim(coalesce(payload->>'place', ''))) < 3 then raise exception 'Facts required'; end if;
  insert into app.visoria_incidents(organization_id, campaign_id, prospect_id, occurred_at, place, activity, facts, people_present, first_aid,
    emergency_called, guardian_contacted_at, transfer, created_by)
  values (v_org, campaign_id, v_p, coalesce((payload->>'occurredAt')::timestamptz, now()), left(btrim(payload->>'place'), 200),
    nullif(left(btrim(coalesce(payload->>'activity', '')), 200), ''), left(btrim(payload->>'facts'), 4000),
    nullif(left(btrim(coalesce(payload->>'peoplePresent', '')), 1000), ''), nullif(left(btrim(coalesce(payload->>'firstAid', '')), 2000), ''),
    coalesce((payload->>'emergencyCalled')::boolean, false), nullif(payload->>'guardianContactedAt', '')::timestamptz,
    nullif(left(btrim(coalesce(payload->>'transfer', '')), 1000), ''), (select auth.uid()))
  returning id into v_id;
  perform private.visoria_audita(v_org, campaign_id, v_p, null, 'staff', 'incidente_registrado', 'ok', null, jsonb_build_object('incidentId', v_id));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.v2_visoria_incident_entry(organization_id uuid, incident_id uuid, kind text, note text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_incident_entry.organization_id; i app.visoria_incidents%rowtype;
begin
  select * into i from app.visoria_incidents ii where ii.id = v2_visoria_incident_entry.incident_id and ii.organization_id = v_org;
  if i.id is null then raise exception 'Incident not found'; end if;
  if not (private.has_module_access(v_org, 'visoria_salud', true) or (i.created_by = (select auth.uid())
          and (private.has_module_access(v_org, 'prospects', true) or private.has_module_access(v_org, 'scouting', true)))) then raise exception 'Not authorized'; end if;
  if kind not in ('seguimiento', 'evidencia', 'cierre', 'reapertura') then raise exception 'Invalid kind'; end if;
  if length(btrim(coalesce(note, ''))) < 3 then raise exception 'Note required'; end if;
  insert into app.visoria_incident_entries(incident_id, kind, note, created_by) values (i.id, kind, left(btrim(note), 4000), (select auth.uid()));
  perform private.visoria_audita(v_org, i.campaign_id, i.prospect_id, null, 'staff', 'incidente_' || kind, 'ok', null, jsonb_build_object('incidentId', i.id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.v2_visoria_incidents(organization_id uuid, campaign_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_visoria_incidents.organization_id; v_todo boolean;
begin
  v_todo := private.has_module_access(v_org, 'visoria_salud', false);
  if not (v_todo or private.has_module_access(v_org, 'prospects', true) or private.has_module_access(v_org, 'scouting', true)) then raise exception 'Not authorized'; end if;
  perform private.visoria_audita(v_org, campaign_id, null, null, 'staff', 'incidentes_consultados', 'ok', null, '{}'::jsonb);
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'occurredAt', i.occurred_at, 'place', i.place, 'activity', i.activity, 'facts', i.facts,
      'peoplePresent', i.people_present, 'firstAid', i.first_aid, 'emergencyCalled', i.emergency_called, 'guardianContactedAt', i.guardian_contacted_at,
      'transfer', i.transfer, 'createdAt', i.created_at, 'mine', i.created_by = (select auth.uid()),
      'child', (select p.first_name || ' ' || p.last_name from app.prospects p where p.id = i.prospect_id),
      'closed', (select e.kind = 'cierre' from app.visoria_incident_entries e where e.incident_id = i.id and e.kind in ('cierre', 'reapertura') order by e.created_at desc limit 1),
      'entries', (select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                    from app.visoria_incident_entries e where e.incident_id = i.id)) order by i.occurred_at desc)
    from app.visoria_incidents i
   where i.organization_id = v_org and i.campaign_id = v2_visoria_incidents.campaign_id and (v_todo or i.created_by = (select auth.uid()))), '[]'::jsonb);
end $$;

revoke all on function public.v2_visoria_verify(uuid, uuid, text, text), public.v2_visoria_review(uuid, uuid, boolean, text),
  public.v2_visoria_invalidate(uuid, uuid, text), public.v2_visoria_alert(uuid, uuid, boolean, text),
  public.v2_visoria_sign_link(uuid, uuid), public.v2_visoria_media(uuid, uuid, boolean, text),
  public.v2_visoria_health(uuid, uuid, text), public.v2_visoria_health_review(uuid, uuid, text, text),
  public.v2_visoria_transfer(uuid, uuid), public.v2_visoria_setup(uuid, text), public.v2_visoria_setup_update(uuid, uuid, jsonb),
  public.v2_visoria_template(uuid, text, text, text, text), public.v2_visoria_approve(uuid, uuid, text, text),
  public.v2_visoria_revoke_approval(uuid, uuid, text, text), public.v2_visoria_incident(uuid, uuid, jsonb),
  public.v2_visoria_incident_entry(uuid, uuid, text, text), public.v2_visoria_incidents(uuid, uuid) from public, anon;
grant execute on function public.v2_visoria_verify(uuid, uuid, text, text), public.v2_visoria_review(uuid, uuid, boolean, text),
  public.v2_visoria_invalidate(uuid, uuid, text), public.v2_visoria_alert(uuid, uuid, boolean, text),
  public.v2_visoria_sign_link(uuid, uuid), public.v2_visoria_media(uuid, uuid, boolean, text),
  public.v2_visoria_health(uuid, uuid, text), public.v2_visoria_health_review(uuid, uuid, text, text),
  public.v2_visoria_transfer(uuid, uuid), public.v2_visoria_setup(uuid, text), public.v2_visoria_setup_update(uuid, uuid, jsonb),
  public.v2_visoria_template(uuid, text, text, text, text), public.v2_visoria_approve(uuid, uuid, text, text),
  public.v2_visoria_revoke_approval(uuid, uuid, text, text), public.v2_visoria_incident(uuid, uuid, jsonb),
  public.v2_visoria_incident_entry(uuid, uuid, text, text), public.v2_visoria_incidents(uuid, uuid) to authenticated;
