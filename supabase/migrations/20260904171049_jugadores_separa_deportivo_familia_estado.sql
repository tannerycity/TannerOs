-- 1) Dos módulos nuevos: datos de familia (salud, domicilio, tutor, documentos) y
--    alta/baja (decisión de club). 'jugadores' (deportivo: posición, pierna, dorsal,
--    categoría) se queda como está y sigue siendo la base para poder guardar algo.
insert into public.modules (code, name, category, description, is_core, active, sort_order)
values
  ('jugadores_familia','Jugadores · Datos de familia','club','Salud, domicilio, contacto de emergencia, tutor y documentación — separado de lo deportivo.',false,true,55),
  ('jugadores_estado','Jugadores · Alta y baja','club','Dar de alta o de baja a un Tanner del club — decisión administrativa separada de la edición del expediente.',false,true,56)
on conflict (code) do nothing;

insert into public.plan_modules (plan_id, module_code, enabled)
select id, m.code, true
from public.plans, (values ('jugadores_familia'),('jugadores_estado')) as m(code)
where name = 'Tannery Internal Full'
on conflict (plan_id, module_code) do update set enabled = true;

-- Operaciones y Presidencia conservan todo. Formadores se queda solo con lo deportivo
-- (ya tiene 'jugadores' de antes, no se toca).
insert into public.role_module_permissions (organization_id, role, module_code, can_read, can_write)
select o.id, r.role, m.code, true, true
from public.organizations o
cross join (values ('Presidencia'), ('Operaciones')) as r(role)
cross join (values ('jugadores_familia'),('jugadores_estado')) as m(code)
on conflict (organization_id, role, module_code)
do update set can_read = true, can_write = true;

-- 2) query_my_modules necesita conocer los códigos nuevos (mismo bug de canonical list
--    que ya corregimos para commerce_finance/catalogo).
CREATE OR REPLACE FUNCTION private.query_my_modules(p_organization_id uuid)
 RETURNS TABLE(module_code text, can_read boolean, can_write boolean, enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  return query
  with canonical(code) as (values
    ('players'),('billing'),('accounting'),('academies'),('attendance'),('callups'),('programs'),('commerce'),('prospects'),('scouting'),('sponsors'),('equipment'),('calendar'),('users'),('admin'),('qa'),
    ('commerce_finance'),('catalogo'),('jugadores_familia'),('jugadores_estado')
  )
  select c.code,private.has_module_access(p_organization_id,c.code,false),private.has_module_access(p_organization_id,c.code,true),private.module_enabled(p_organization_id,c.code)
  from canonical c;
end $function$;

-- 3) command_update_player_profile: si el que llama no tiene 'jugadores_familia' con
--    escritura, los campos de familia se ignoran (se conservan los valores actuales),
--    aunque alguien intente mandarlos directo por RPC. Lo deportivo sigue igual.
CREATE OR REPLACE FUNCTION private.command_update_player_profile(p_organization_id uuid, p_player_id uuid, p_first_name text, p_last_name text, p_birth_date date, p_position text, p_dominant_foot text, p_jersey_number text, p_school text, p_blood_type text, p_allergies text, p_address text, p_emergency_contact_name text, p_emergency_contact_phone text, p_notes text, p_guardian_name text, p_guardian_phone text, p_guardian_email text, p_guardian_relationship text, p_can_pickup boolean, p_receives_billing boolean, p_sex text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
declare v_current_guardian uuid; v_target_guardian uuid; v_phone text; v_emergency text; v_name text; v_email text; v_foot text; v_sex text; v_has_family boolean; v_row app.players%rowtype;
begin
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
  select * into v_row from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null for update;
  if not found then raise exception 'Player not found'; end if;

  v_has_family := private.has_module_access(p_organization_id,'jugadores_familia',true);
  if not v_has_family then
    p_first_name:=v_row.first_name; p_last_name:=v_row.last_name; p_birth_date:=v_row.birth_date;
    p_school:=v_row.school; p_blood_type:=v_row.blood_type; p_allergies:=v_row.allergies; p_address:=v_row.address;
    p_emergency_contact_name:=v_row.emergency_contact_name; p_emergency_contact_phone:=v_row.emergency_contact_phone;
    p_notes:=v_row.notes; p_sex:=v_row.sex;
    p_guardian_name:=null; p_guardian_phone:=null; p_guardian_email:=null; p_guardian_relationship:=null;
    p_can_pickup:=null; p_receives_billing:=null;
  end if;

  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'Player first name required'; end if;
  if coalesce(length(trim(p_last_name)),0)<2 then raise exception 'Player last name required'; end if;
  if p_birth_date is null or p_birth_date>current_date then raise exception 'Valid birth date required'; end if;
  v_foot:=case lower(trim(coalesce(p_dominant_foot,''))) when '' then null when 'right' then 'right' when 'derecha' then 'right' when 'left' then 'left' when 'izquierda' then 'left' when 'both' then 'both' when 'ambas' then 'both' when 'por definir' then null else '__invalid__' end;
  if v_foot='__invalid__' then raise exception 'Invalid dominant foot'; end if;
  v_sex:=case when nullif(trim(coalesce(p_sex,'')),'') is null then null when upper(trim(p_sex)) in ('M','F') then upper(trim(p_sex)) else '__invalid__' end;
  if v_sex='__invalid__' then raise exception 'Invalid sex'; end if;
  if length(trim(coalesce(p_jersey_number,'')))>4 then raise exception 'Invalid jersey number'; end if;
  v_emergency:=case when nullif(trim(coalesce(p_emergency_contact_phone,'')),'') is null then null else private.normalize_public_phone(p_emergency_contact_phone) end;
  update app.players set first_name=trim(p_first_name),last_name=trim(p_last_name),birth_date=p_birth_date,position=nullif(trim(coalesce(p_position,'')),''),dominant_foot=v_foot,jersey_number=nullif(trim(coalesce(p_jersey_number,'')),''),school=nullif(trim(coalesce(p_school,'')),''),blood_type=nullif(trim(coalesce(p_blood_type,'')),''),allergies=nullif(trim(coalesce(p_allergies,'')),''),address=nullif(trim(coalesce(p_address,'')),''),emergency_contact_name=nullif(trim(coalesce(p_emergency_contact_name,'')),''),emergency_contact_phone=v_emergency,notes=nullif(trim(coalesce(p_notes,'')),''),sex=coalesce(v_sex,sex),updated_at=now() where id=p_player_id and organization_id=p_organization_id;
  v_name:=nullif(trim(coalesce(p_guardian_name,'')),'');
  if v_name is not null then
    if length(v_name)<2 then raise exception 'Guardian name required'; end if;
    v_phone:=private.normalize_public_phone(p_guardian_phone); if v_phone is null then raise exception 'Guardian phone required'; end if;
    v_email:=nullif(lower(trim(coalesce(p_guardian_email,''))),'');
    if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid guardian email'; end if;
    select pg.guardian_id into v_current_guardian from app.player_guardians pg where pg.organization_id=p_organization_id and pg.player_id=p_player_id and pg.is_primary limit 1;
    select g.id into v_target_guardian from app.guardians g where g.organization_id=p_organization_id and g.status='active' and g.phone=v_phone order by (g.id=v_current_guardian) desc,g.created_at limit 1;
    if v_target_guardian is null and v_current_guardian is not null then
      v_target_guardian:=v_current_guardian;
      update app.guardians set first_name=v_name,last_name=null,phone=v_phone,email=v_email,relationship_default=nullif(trim(coalesce(p_guardian_relationship,'')),''),updated_at=now() where id=v_target_guardian and organization_id=p_organization_id;
    elsif v_target_guardian is null then
      insert into app.guardians(organization_id,first_name,last_name,phone,email,relationship_default,status,created_at,updated_at)
      values(p_organization_id,v_name,null,v_phone,v_email,nullif(trim(coalesce(p_guardian_relationship,'')),''),'active',now(),now()) returning id into v_target_guardian;
    else
      update app.guardians set first_name=v_name,email=coalesce(v_email,email),relationship_default=coalesce(nullif(trim(coalesce(p_guardian_relationship,'')),''),relationship_default),updated_at=now() where id=v_target_guardian and organization_id=p_organization_id;
    end if;
    update app.player_guardians set is_primary=false where organization_id=p_organization_id and player_id=p_player_id and is_primary and guardian_id<>v_target_guardian;
    insert into app.player_guardians(player_id,guardian_id,relationship,is_primary,can_pickup,receives_billing,organization_id,created_at)
    values(p_player_id,v_target_guardian,coalesce(nullif(trim(coalesce(p_guardian_relationship,'')),''),'Tutor'),true,coalesce(p_can_pickup,true),coalesce(p_receives_billing,true),p_organization_id,now())
    on conflict(player_id,guardian_id) do update set relationship=excluded.relationship,is_primary=true,can_pickup=excluded.can_pickup,receives_billing=excluded.receives_billing;
  end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PlayerProfileUpdated','player',p_player_id,jsonb_build_object('guardianUpdated',v_name is not null,'emergencyPhone',v_emergency is not null,'dominantFoot',v_foot,'sex',v_sex),(select auth.uid()));
  return private.query_player_profile(p_organization_id,p_player_id);
end
$function$;

-- 4) Alta/baja: gate propio 'jugadores_estado', ya no basta con escritura genérica en 'jugadores'.
CREATE OR REPLACE FUNCTION private.command_withdraw_player(p_organization_id uuid, p_player_id uuid, p_date date, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'private'
AS $function$
begin
  if not private.has_module_access(p_organization_id,'jugadores_estado',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then raise exception 'Player not found'; end if;
  perform app.withdraw_player(p_player_id,p_date,p_reason,(select auth.uid())::text);
end;
$function$;

CREATE OR REPLACE FUNCTION private.command_reactivate_player(p_organization_id uuid, p_player_id uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'private'
AS $function$
begin
  if not private.has_module_access(p_organization_id,'jugadores_estado',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then raise exception 'Player not found'; end if;
  perform app.reactivate_player(p_player_id,p_date,(select auth.uid())::text);
end;
$function$;

-- 5) Checklist de documentación (acta, CURP, constancia de estudios) es papeleo/familia,
--    no deportivo.
CREATE OR REPLACE FUNCTION private.command_set_player_document(p_organization_id uuid, p_player_id uuid, p_document_type text, p_received boolean, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'jugadores_familia',true) then raise exception 'Not authorized'; end if;
  if p_document_type not in ('birth_certificate','curp','studies') then raise exception 'Invalid document type'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null) then raise exception 'Player not found'; end if;
  insert into app.player_document_status(organization_id,player_id,document_type,received,received_at,received_by_user_id,notes,legacy_value,created_at,updated_at)
  values(p_organization_id,p_player_id,p_document_type,coalesce(p_received,false),case when coalesce(p_received,false) then now() else null end,case when coalesce(p_received,false) then (select auth.uid()) else null end,nullif(trim(coalesce(p_notes,'')),''),null,now(),now())
  on conflict(organization_id,player_id,document_type) do update set received=excluded.received,received_at=case when excluded.received then coalesce(app.player_document_status.received_at,now()) else null end,received_by_user_id=case when excluded.received then (select auth.uid()) else null end,notes=excluded.notes,updated_at=now()
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PlayerDocumentStatusUpdated','player_document',v_id,jsonb_build_object('playerId',p_player_id,'documentType',p_document_type,'received',coalesce(p_received,false)),(select auth.uid()));
  return private.query_player_documents(p_organization_id,p_player_id);
end $function$;
;
