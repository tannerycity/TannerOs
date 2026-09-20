
-- Corrección atómica de un cobro de Tanner: deshace la aplicación en su cuenta Y reembolsa, todo-o-nada.
-- Solo Presidencia. Reusa las funciones privadas que ya existen (con sus propias validaciones).
create or replace function private.command_correct_tanner_payment(p_organization_id uuid, p_payment_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path to 'pg_catalog','public','app','private'
as $$
declare v app.payments%rowtype;
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
end $$;

create or replace function public.v2_correct_tanner_payment(organization_id uuid, payment_id uuid, reason text)
returns void language sql security definer set search_path to 'pg_catalog','public','private'
as $$ select private.command_correct_tanner_payment(organization_id, payment_id, reason) $$;

revoke all on function public.v2_correct_tanner_payment(uuid,uuid,text) from public, anon;
grant execute on function public.v2_correct_tanner_payment(uuid,uuid,text) to authenticated;
;
