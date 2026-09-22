
-- 1) campos de anulación (VAR) en payments
alter table app.payments add column if not exists voided_at timestamptz;
alter table app.payments add column if not exists void_reason text;
alter table app.payments add column if not exists voided_by_user_id uuid;

-- 2) borrar (anular) un OTRO INGRESO: solo Presidencia, motivo obligatorio (VAR)
create or replace function private.command_void_income(p_organization_id uuid, p_payment_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v app.payments%rowtype; v_actor uuid:=(select auth.uid());
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede borrar un ingreso'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Escribe el motivo (por qué se borra)'; end if;
  select * into v from app.payments where id=p_payment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Ingreso no encontrado'; end if;
  if v.player_id is not null then raise exception 'Es un pago de un Tanner. Usa Reembolsar para conservar su saldo.'; end if;
  if v.status<>'posted' then raise exception 'Solo se puede borrar un ingreso publicado'; end if;
  update app.payments set status='void', voided_at=now(), void_reason=trim(p_reason), voided_by_user_id=v_actor, updated_at=now() where id=v.id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'IncomeVoided','payment',v.id,
    jsonb_build_object('reason',trim(p_reason),'amount',v.amount,'category',v.category,'concept',v.concept),v_actor);
end $$;

create or replace function public.v2_void_income(organization_id uuid, payment_id uuid, reason text)
returns void language sql security definer set search_path to 'pg_catalog','public','private'
as $$ select private.command_void_income(organization_id, payment_id, reason) $$;

revoke all on function public.v2_void_income(uuid,uuid,text) from public, anon;
grant execute on function public.v2_void_income(uuid,uuid,text) to authenticated;
;
