alter table app.programs add column if not exists legacy_id text;
create unique index if not exists app_programs_org_legacy_uidx on app.programs(organization_id,legacy_id) where legacy_id is not null;

insert into app.programs(
 organization_id,legacy_id,slug,name,program_type,category_label,description,starts_on,ends_on,schedule,location,capacity,fee,status,public_registration_enabled,settings,created_at,updated_at,archived_at,age_min,age_max,fee_weekly,weeks
)
select
 c.organization_id,c.id,'legacy-'||substr(md5(c.id),1,12),coalesce(nullif(trim(c.name),''),'Programa legacy'),
 coalesce(nullif(trim(c.kind),''),nullif(trim(c.type),''),'program'),nullif(trim(c.category),''),nullif(trim(c.description),''),c.start_date,c.end_date,
 case when nullif(trim(coalesce(c.schedule,'')),'') is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('label',trim(c.schedule))) end,
 nullif(trim(c.location),''),c.capacity,c.fee,
 case when coalesce(c.deleted,false) then 'archived' when c.status='Activo' then 'active' else 'draft' end,
 (not coalesce(c.deleted,false) and c.status='Activo'),
 jsonb_strip_nulls(jsonb_build_object('legacy_responsible',nullif(trim(c.responsible),''),'legacy_group_label',nullif(trim(c.group_label),''),'legacy_notes',nullif(trim(c.notes),''),'legacy_status',nullif(trim(c.status),''))),
 coalesce(c.created_at,c.updated_at,now()),coalesce(c.updated_at,c.legacy_updated_at,c.created_at,now()),
 case when coalesce(c.deleted,false) then coalesce(c.updated_at,c.legacy_updated_at,now()) else null end,
 c.age_min,c.age_max,c.fee_weekly,c.weeks
from public.summer_courses c
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.program_enrollments add column if not exists legacy_id text;
alter table app.program_enrollments add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists app_program_enrollments_org_legacy_uidx on app.program_enrollments(organization_id,legacy_id) where legacy_id is not null;

insert into app.program_enrollments(
 organization_id,legacy_id,program_id,player_id,participant_first_name,participant_last_name,phone,email,birth_date,status,payment_status,consent,notes,created_at,updated_at,metadata
)
select
 e.organization_id,e.id,pgr.id,pl.id,coalesce(nullif(trim(e.child_name),''),'Sin nombre'),nullif(trim(e.child_apellidos),''),
 private.normalize_legacy_phone_safe(e.phone),nullif(lower(trim(e.email)),''),e.birth_date,
 case when coalesce(e.deleted,false) then 'cancelled' when e.status='Pagado' then 'confirmed' when e.status='Activo' then 'confirmed' else 'registered' end,
 case when e.status='Pagado' or coalesce(e.payment_amount,0)>0 then 'paid' else 'pending' end,
 jsonb_strip_nulls(jsonb_build_object(
   'participation',e.auth_participation,'fitness',e.auth_fitness,'image',e.auth_image,'rules',e.auth_rules,
   'signedBy',nullif(trim(e.signed_by),''),'signedAt',e.signed_at,
   'dataAccepted',lower(coalesce(e.consent_interno,'')) in ('true','1','si','sí','yes'),
   'imageAccepted',lower(coalesce(e.consent_imagen,'')) in ('true','1','si','sí','yes'),
   'privacyNoticeVersion',nullif(trim(e.consent_version),''),'consentAt',e.consent_fecha,'origin',nullif(trim(e.consent_origen),'')
 )),
 nullif(trim(e.notes),''),coalesce(e.created_at,e.updated_at,now()),coalesce(e.updated_at,e.legacy_updated_at,e.created_at,now()),
 jsonb_strip_nulls(jsonb_build_object(
   'legacy_course_name',nullif(trim(e.course_name),''),'legacy_age',e.age,'legacy_foot',nullif(trim(e.foot),''),'legacy_played_before',nullif(trim(e.played_before),''),'legacy_played_where',nullif(trim(e.played_where),''),
   'legacy_tutor',nullif(trim(e.tutor),''),'legacy_phone_raw',nullif(trim(e.phone),''),'school',nullif(trim(e.school),''),'address',nullif(trim(e.address),''),'blood_type',nullif(trim(e.blood_type),''),'allergies',nullif(trim(e.allergies),''),'medical_notes',nullif(trim(e.medical_notes),''),'medications',nullif(trim(e.medications),''),
   'emergency_contact',nullif(trim(e.emergency_contact),''),'emergency_phone',nullif(trim(e.emergency_phone),''),'emergency_relation',nullif(trim(e.emergency_relation),''),'source',nullif(trim(e.source),''),'legacy_status',nullif(trim(e.status),''),'plan',nullif(trim(e.plan),''),'weeks_contracted',e.weeks_contracted,
   'payment_amount',e.payment_amount,'payment_method',nullif(trim(e.payment_method),''),'payment_date',e.payment_date,'payment_ref',nullif(trim(e.payment_ref),''),'converted_to',nullif(trim(e.converted_to),''),'converted_id',nullif(trim(e.converted_id),''),'converted_at',e.converted_at,'legacy_photo_present',nullif(trim(coalesce(e.photo_data,'')),'') is not null,'legacy_deleted',coalesce(e.deleted,false)
 ))
from public.summer_enrollments e
join app.programs pgr on pgr.organization_id=e.organization_id and pgr.legacy_id=e.course_id
left join app.players pl on pl.organization_id=e.organization_id and pl.legacy_id=e.converted_id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.sponsors add column if not exists legacy_id text;
alter table app.sponsors add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists app_sponsors_org_legacy_uidx on app.sponsors(organization_id,legacy_id) where legacy_id is not null;

insert into app.sponsors(
 organization_id,legacy_id,name,sponsor_type,contact_name,phone,email,status,notes,created_at,updated_at,archived_at,tier,relationship_type,stage,potential_value,next_action,next_action_at,metadata
)
select
 s.organization_id,s.id,coalesce(nullif(trim(s.name),''),'Sponsor legacy'),nullif(trim(s.tipo_relacion),''),nullif(trim(s.contact_name),''),
 private.normalize_legacy_phone_safe(s.phone),nullif(lower(trim(s.email)),''),
 case when coalesce(s.deleted,false) then 'archived' when s.etapa='Activo' then 'active' when s.etapa in ('Contactado','En plática','Por cerrar') then 'negotiation' else 'prospect' end,
 nullif(trim(s.notes),''),coalesce(s.created_at,s.updated_at,now()),coalesce(s.updated_at,s.legacy_updated_at,s.created_at,now()),
 case when coalesce(s.deleted,false) then coalesce(s.updated_at,s.legacy_updated_at,now()) else null end,
 nullif(trim(s.tier),''),nullif(trim(s.tipo_relacion),''),nullif(trim(s.etapa),''),s.valor_potencial,nullif(trim(s.proximo_movimiento),''),
 case when s.proximo_fecha is null then null else s.proximo_fecha::timestamp at time zone 'America/Mexico_City' end,
 jsonb_strip_nulls(jsonb_build_object('legacy_status',nullif(trim(s.status),''),'legacy_phone_raw',nullif(trim(s.phone),''),'legacy_closed_date',s.closed_date,'legacy_assets',s.assets,'legacy_movements',s.movimientos,'legacy_deleted',coalesce(s.deleted,false)))
from public.sponsors s
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.sponsor_agreements add column if not exists legacy_id text;
alter table app.sponsor_agreements add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists app_sponsor_agreements_org_legacy_uidx on app.sponsor_agreements(organization_id,legacy_id) where legacy_id is not null;

insert into app.sponsor_agreements(
 organization_id,legacy_id,sponsor_id,starts_on,ends_on,monetary_value,benefits_received,deliverables,status,notes,created_at,updated_at,metadata
)
select
 s.organization_id,'legacy-sponsor-'||s.id,sp.id,s.start_date,s.end_date,s.amount,
 case when jsonb_typeof(coalesce(s.recibimos,'[]'::jsonb))='array' then coalesce(s.recibimos,'[]'::jsonb) else jsonb_build_array(s.recibimos) end,
 case when jsonb_typeof(coalesce(s.damos,'[]'::jsonb))='array' then coalesce(s.damos,'[]'::jsonb) else jsonb_build_array(s.damos) end,
 case when coalesce(s.deleted,false) then 'completed' when s.etapa='Activo' then 'active' else 'draft' end,
 nullif(trim(s.notes),''),coalesce(s.created_at,s.updated_at,now()),coalesce(s.updated_at,s.legacy_updated_at,s.created_at,now()),
 jsonb_strip_nulls(jsonb_build_object('legacy_convenio',s.convenio,'legacy_stage',nullif(trim(s.etapa),''),'legacy_closed_date',s.closed_date,'legacy_deleted',coalesce(s.deleted,false)))
from public.sponsors s
join app.sponsors sp on sp.organization_id=s.organization_id and sp.legacy_id=s.id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.equipment_items add column if not exists legacy_id text;
alter table app.equipment_items add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists app_equipment_org_legacy_uidx on app.equipment_items(organization_id,legacy_id) where legacy_id is not null;

insert into app.equipment_items(
 organization_id,legacy_id,sku,name,category,quantity,min_stock,unit_cost,location,status,notes,created_at,updated_at,archived_at,metadata
)
select
 e.organization_id,e.id,null,coalesce(nullif(trim(e.name),''),'Utilería legacy'),nullif(trim(e.category),''),greatest(0,coalesce(e.quantity,0)),greatest(0,coalesce(e.min_stock,0)::integer),e.cost_unit,nullif(trim(e.location),''),
 case when e.status='Dañado' then 'retired' when coalesce(e.deleted,false) then 'retired' else 'active' end,
 nullif(trim(e.notes),''),coalesce(e.created_at,e.updated_at,now()),coalesce(e.updated_at,e.legacy_updated_at,e.created_at,now()),
 case when coalesce(e.deleted,false) then coalesce(e.updated_at,e.legacy_updated_at,now()) else null end,
 jsonb_strip_nulls(jsonb_build_object('legacy_status',nullif(trim(e.status),''),'legacy_responsible',nullif(trim(e.responsible),''),'legacy_photo_present',nullif(trim(coalesce(e.photo_data,'')),'') is not null,'legacy_photo_updated_at',e.photo_updated_at,'legacy_deleted',coalesce(e.deleted,false)))
from public.equipment e
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;;
