
create or replace function private.command_correct_tanner_payment(p_organization_id uuid, p_payment_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path to 'pg_catalog','public','app','private'
as $$
declare v app.payments%rowtype; v_actor uuid:=(select auth.uid());
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede corregir un cobro de Tanner'; end if;
  if coalesce(length(trim(p_reason)),0)<3 then raise exception 'Escribe el motivo (queda en el VAR)'; end if;
  select * into v from app.payments where id=p_payment_id and organization_id=p_organization_id;
  if not found then raise exception 'Cobro no encontrado'; end if;
  if v.player_id is null then raise exception 'Este movimiento no es un cobro de Tanner'; end if;
  if v.status<>'posted' then raise exception 'Solo se puede corregir un cobro publicado'; end if;
  -- 1) deshacer la aplicación (libera el saldo del Tanner)
  perform private.command_reverse_payment_allocations(p_organization_id, p_payment_id, p_reason);
  -- 2) reembolsar el monto completo (ya libre)
  perform private.command_refund_payment(p_organization_id, p_payment_id, v.amount, current_date,
    coalesce(nullif(v.method,''),'efectivo'), 'Corrección en taquilla', p_reason, 'correct:'||p_payment_id::text);
  -- 3) marcar el pago como REEMBOLSADO (traza + sale de la caja + el botón desaparece)
  update app.payments
    set status='refunded', voided_at=now(), void_reason=p_reason, voided_by_user_id=v_actor, updated_at=now()
    where id=p_payment_id and organization_id=p_organization_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
    values(p_organization_id,'TannerPaymentCorrected','payment',p_payment_id,
      jsonb_build_object('reason',p_reason,'amount',v.amount),v_actor);
end $$;
;
