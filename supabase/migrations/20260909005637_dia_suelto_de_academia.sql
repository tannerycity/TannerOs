-- El que no está inscrito y cae un día suelto. Hasta ahora ese dinero no tenía
-- dónde registrarse: o lo inscribías al mes completo o se cobraba por fuera.
--
-- Se guarda el día, no solo el cargo, porque el cargo por sí solo no dice qué día
-- fue ni permite evitar que se cobre dos veces la misma fecha.
create table if not exists app.academy_day_passes(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  academy_id uuid not null references app.academies(id),
  player_id uuid not null references app.players(id),
  day date not null,
  price numeric not null check (price > 0),
  charge_id uuid references app.charges(id),
  notes text,
  created_by_user_id uuid,
  created_at timestamptz not null default now()
);

-- Un mismo Tanner no puede tener dos veces el mismo día en la misma academia.
create unique index if not exists ux_academy_day_unico
  on app.academy_day_passes(organization_id, academy_id, player_id, day);
create index if not exists ix_academy_day_por_academia
  on app.academy_day_passes(organization_id, academy_id, day);

alter table app.academy_day_passes enable row level security;


create or replace function private.command_register_academy_day(
  p_organization_id uuid,
  p_academy_id uuid,
  p_player_id uuid,
  p_day date,
  p_price numeric default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  v_ac app.academies%rowtype;
  v_nombre text; v_precio numeric; v_dia date := coalesce(p_day, current_date);
  v_charge uuid; v_pase uuid; v_perfil uuid;
begin
  if not private.has_module_access(p_organization_id,'academias',true)
     or not private.has_module_access(p_organization_id,'billing',true) then
    raise exception 'Not authorized';
  end if;

  select * into v_ac from app.academies
  where id=p_academy_id and organization_id=p_organization_id and archived_at is null;
  if not found then raise exception 'Esa academia no existe en el club'; end if;

  select trim(concat_ws(' ',first_name,last_name)) into v_nombre from app.players
  where id=p_player_id and organization_id=p_organization_id and archived_at is null and status='active';
  if v_nombre is null then raise exception 'Ese Tanner no está activo en el club'; end if;

  -- Cobrar un día por adelantado invita a cobrar por algo que todavía no pasó.
  if v_dia > current_date then raise exception 'No se puede registrar un día que todavía no llega'; end if;

  -- Si ese día ya está cubierto por su inscripción, cobrarlo aparte sería
  -- cobrárselo dos veces: ya lo paga en la mensualidad.
  if exists(select 1 from app.academy_enrollments e
            where e.organization_id=p_organization_id and e.academy_id=p_academy_id
              and e.player_id=p_player_id and e.starts_on<=v_dia
              and (e.ends_on is null or e.ends_on>=v_dia)
              and e.status in ('active','cancelled')) then
    raise exception 'Ese día ya está cubierto por su inscripción mensual: no se cobra aparte';
  end if;

  if exists(select 1 from app.academy_day_passes d
            where d.organization_id=p_organization_id and d.academy_id=p_academy_id
              and d.player_id=p_player_id and d.day=v_dia) then
    raise exception 'Ese día ya está registrado para este Tanner';
  end if;

  v_precio := coalesce(p_price, v_ac.hourly_rate);
  if coalesce(v_precio,0) <= 0 then
    raise exception 'Esta academia no tiene precio por día configurado: ponlo en los datos de la academia o escríbelo aquí';
  end if;

  select id into v_perfil from app.billing_profiles
  where player_id=p_player_id and organization_id=p_organization_id;

  insert into app.academy_day_passes(organization_id,academy_id,player_id,day,price,notes,created_by_user_id)
  values(p_organization_id,p_academy_id,p_player_id,v_dia,v_precio,nullif(trim(p_notes),''),auth.uid())
  returning id into v_pase;

  -- El día suelto no genera recargo: se paga el día que se va, no es una mensualidad.
  insert into app.charges(organization_id,player_id,billing_profile_id,charge_type,billing_period,
    concept,amount,due_date,status,source,late_fee_eligible,idempotency_key,posted_at,payer_type)
  values(p_organization_id,p_player_id,v_perfil,'academy_day',date_trunc('month',v_dia)::date,
    'Día suelto · '||v_ac.name||' · '||to_char(v_dia,'DD/MM/YYYY'),
    v_precio, v_dia, 'posted','academy_day_pass', false,
    'academy-day:'||v_pase::text, now(),'guardian')
  returning id into v_charge;

  update app.academy_day_passes set charge_id=v_charge where id=v_pase;

  insert into app.audit_events(organization_id,actor_user_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
  values(p_organization_id, auth.uid(), private.current_actor_label(p_organization_id),
    'academyDayRegistered','academy_day_pass',v_pase::text,
    jsonb_build_object('academyId',p_academy_id,'academy',v_ac.name,'playerId',p_player_id,
      'player',v_nombre,'day',v_dia,'price',v_precio,'chargeId',v_charge,'notes',nullif(trim(p_notes),'')),
    now());

  return jsonb_build_object('id',v_pase,'chargeId',v_charge,'player',v_nombre,
    'day',v_dia,'price',v_precio,'academy',v_ac.name);
end $function$;
revoke all on function private.command_register_academy_day(uuid,uuid,uuid,date,numeric,text) from public, anon, authenticated;

create or replace function public.v2_register_academy_day(
  organization_id uuid, academy_id uuid, player_id uuid,
  day date default null, price numeric default null, notes text default null
) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_register_academy_day(organization_id,academy_id,player_id,day,price,notes) $function$;
revoke all on function public.v2_register_academy_day(uuid,uuid,uuid,date,numeric,text) from public, anon;
grant execute on function public.v2_register_academy_day(uuid,uuid,uuid,date,numeric,text) to authenticated;;
