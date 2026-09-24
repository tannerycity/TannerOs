-- R1 · Quien registro el movimiento DE VERDAD
--
-- LO QUE REPORTO EL CLUB
-- Un egreso de $600 por "5 balones" decia "Pagó: Michel". Michel no lo pago.
-- Medido en la base: ese movimiento lo registro la cuenta "iPad" (rol
-- Taquilla) el 23 de septiembre a las 20:00. Alguien escribio el nombre.
--
-- DOS HECHOS DISTINTOS METIDOS EN UN CAMPO
-- query_cashier_snapshot arma 'registeredBy' asi:
--
--   coalesce(nullif(trim(e.paid_by_name),''), pre.display_name)
--
-- Es un coalesce: si alguien tecleo un nombre, gana el texto y la cuenta real
-- NUNCA se muestra. La cuenta solo aparece cuando nadie escribio nada. O sea
-- que el dato declarado TAPA al dato auditado, que es justo al reves de lo que
-- sirve para revisar.
--
--   paid_by_name / collected_by_name  -> DECLARADO. Se teclea. No prueba nada.
--   created_by_user_id                -> AUDITADO. No se puede teclear.
--
-- Medido hoy: 27 egresos registrados, 23 desde la cuenta "Presidencia" y 4
-- desde "iPad". Solo 2 traen un nombre escrito encima — pero son justo los 2
-- que no se pueden revisar.
--
-- ESTA MIGRACION NO TOCA EL SNAPSHOT.
-- query_cashier_snapshot son 7 KB que arman la caja del dia entera. Reescribirla
-- a mano para agregar dos campos es el tipo de transcripcion que rompe el flujo
-- de dinero del club por una coma. Se agrega una consulta aparte, chica y
-- auditable, que la pantalla pide cuando alguien pregunta por un movimiento.
--
-- LO QUE NO ARREGLA NINGUN CODIGO
-- Las dos cuentas que registran dinero se llaman "Presidencia" y "iPad". No son
-- personas. Aunque esta consulta diga la verdad, la verdad va a ser "lo
-- registro el iPad". Saber QUIEN estaba en el iPad exige una cuenta por
-- persona, y eso es una decision del club, no una migracion.

create or replace function private.query_movement_audit(
  p_organization_id uuid,
  p_movement_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v jsonb;
begin
  -- Quien puede ver el libro puede ver quien lo escribio. No tiene sentido
  -- enseniar un movimiento y esconder su autor.
  if not private.has_module_access(p_organization_id,'taquilla',false)
     and not private.has_module_access(p_organization_id,'accounting',false) then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'kind','expense',
    'date', e.expense_date,
    'amount', e.amount,
    'concept', e.concept,
    'status', e.status,
    -- Lo que alguien ESCRIBIO. Se marca como declarado para que la pantalla
    -- no lo pueda presentar como prueba.
    'declared', jsonb_build_object(
      'label','Pagó',
      'name', nullif(trim(e.paid_by_name),''),
      'counterparty', nullif(trim(e.supplier_name),'')),
    -- Lo que el sistema VIO.
    'audited', jsonb_build_object(
      'account', pr.display_name,
      'role', m.role,
      'at', e.created_at,
      'source', e.source,
      'voidedByAccount', prv.display_name,
      'voidedAt', e.voided_at,
      'voidReason', nullif(trim(e.void_reason),'')),
    -- El dato que contesta la pregunta de un jalon: ¿el nombre escrito es el
    -- mismo que la cuenta? Si no, hay que preguntarle a alguien.
    'declaredDiffersFromAccount',
      (nullif(trim(e.paid_by_name),'') is not null
       and lower(trim(coalesce(e.paid_by_name,''))) <> lower(trim(coalesce(pr.display_name,''))))
  ) into v
  from app.expenses e
  left join public.profiles pr on pr.user_id = e.created_by_user_id
  left join public.organization_memberships m on m.user_id = e.created_by_user_id and m.organization_id = e.organization_id
  left join public.profiles prv on prv.user_id = e.voided_by_user_id
  where e.id = p_movement_id and e.organization_id = p_organization_id;

  if v is not null then return v; end if;

  select jsonb_build_object(
    'kind','payment',
    'date', p.payment_date,
    'amount', p.amount,
    'concept', p.concept,
    'status', p.status,
    'declared', jsonb_build_object(
      'label','Cobró',
      'name', nullif(trim(p.collected_by_name),''),
      'counterparty', nullif(trim(p.payer_name),'')),
    'audited', jsonb_build_object(
      'account', pr.display_name,
      'role', m.role,
      'at', p.created_at,
      'source', p.source,
      'voidedByAccount', prv.display_name,
      'voidedAt', p.voided_at,
      'voidReason', null,
      -- En un cobro hay un tercer actor: quien lo concilio despues. Ese si es
      -- el control de verdad, porque lo hace una persona distinta.
      'reconciledByAccount', prr.display_name),
    'declaredDiffersFromAccount',
      (nullif(trim(p.collected_by_name),'') is not null
       and lower(trim(coalesce(p.collected_by_name,''))) <> lower(trim(coalesce(pr.display_name,''))))
  ) into v
  from app.payments p
  left join public.profiles pr on pr.user_id = p.created_by_user_id
  left join public.organization_memberships m on m.user_id = p.created_by_user_id and m.organization_id = p.organization_id
  left join public.profiles prv on prv.user_id = p.voided_by_user_id
  left join public.profiles prr on prr.user_id = p.reconciled_by_user_id
  where p.id = p_movement_id and p.organization_id = p_organization_id;

  if v is null then raise exception 'Movement not found'; end if;
  return v;
end
$function$;

create or replace function public.v2_movement_audit(organization_id uuid, movement_id uuid)
returns jsonb
language sql stable security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_movement_audit(organization_id, movement_id) $function$;

revoke all on function private.query_movement_audit(uuid,uuid) from public, anon, authenticated;
revoke all on function public.v2_movement_audit(uuid,uuid) from public, anon;
grant execute on function public.v2_movement_audit(uuid,uuid) to authenticated;

do $$
declare v int; v_org uuid; v_uid uuid; r jsonb;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='v2_movement_audit';
  if v <> 1 then raise exception 'v2_movement_audit quedo % veces', v; end if;
  select count(*) into v from information_schema.role_routine_grants
   where routine_schema='private' and routine_name='query_movement_audit'
     and grantee in ('PUBLIC','anon','authenticated');
  if v <> 0 then raise exception 'query_movement_audit quedo con % permisos sueltos', v; end if;

  -- Se prueba contra el movimiento que origino esto: el de los 5 balones.
  select m.organization_id, m.user_id into v_org, v_uid
    from public.organization_memberships m join public.profiles pr on pr.user_id=m.user_id and pr.active
   where m.active and m.role='Presidencia' limit 1;
  if v_uid is null then raise notice 'R1 · sin usuario para verificar'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub',v_uid::text,'role','authenticated')::text, true);

  select public.v2_movement_audit(v_org, e.id) into r
    from app.expenses e where e.organization_id=v_org and e.concept ilike '%balon%' limit 1;
  if r is null then raise notice 'R1 · no hay movimiento de balones para probar'; return; end if;
  if (r->'audited'->>'account') is null then raise exception 'R1 · no devolvio la cuenta que lo registro'; end if;
  raise notice 'R1 · "%": declarado=% · cuenta=% (%) · difieren=%',
    r->>'concept', r->'declared'->>'name', r->'audited'->>'account',
    r->'audited'->>'role', r->>'declaredDiffersFromAccount';
end $$;
