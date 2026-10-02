-- Quien cobra en Taquilla puede cobrar mensualidades sin ver Cobranza
--
-- LO QUE PIDIÓ EL CLUB: que Zul (Operaciones) "pueda cobrar, que no pueda ver
-- cobranza". Operaciones escribe en Taquilla y no ve Cobranza, pero cobrar una
-- mensualidad exigía escribir en Cobranza ('billing'): con la regla vieja, o
-- no cobraba, o había que enseñarle la cartera de adeudos de todo el club.
-- Presidencia eligió la opción A el 02/10/2026: que Taquilla baste.
--
-- Cobrar es trabajo de caja; ver la cartera de adeudos es otro. Así lo trata
-- ya el resto de la caja: "Otro ingreso" (command_post_general_income) acepta
-- Taquilla o Contabilidad.
--
-- ÚNICO CAMBIO: la primera línea del candado pasa de
--   has_module_access(org,'billing',true)
-- a
--   has_any_module_access(org, array['billing','taquilla'], true)
-- Todo lo demás —monto, idempotencia, pagador, reparto al cargo más viejo,
-- evento PaymentPosted, quién cobró— queda exactamente igual.
--
-- Hoy escriben en Taquilla: Presidencia, Operaciones (Brandon y Zul) y la
-- cuenta Taquilla (iPad). Presidencia y el iPad ya podían por Cobranza; los
-- que ganan el permiso son Brandon y Zul.
--
-- REVERSIBLE: regresar la línea a has_module_access(...,'billing',true).

create or replace function private.command_post_payment(p_organization_id uuid, p_player_id uuid, p_amount numeric, p_payment_date date, p_method text, p_reference text, p_concept text, p_payer_type text, p_payer_name text, p_idempotency_key text, p_collected_by_name text, p_expected_amount numeric, p_observations text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare v_id uuid; v_actor uuid:=(select auth.uid()); v_payer_type text:=coalesce(nullif(trim(p_payer_type),''),'guardian');
begin
  if not private.has_any_module_access(p_organization_id,array['billing','taquilla'],true) then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
  if v_payer_type not in ('guardian','sponsor','player','organization','other') then raise exception 'Invalid payer type'; end if;
  if v_payer_type='sponsor' and nullif(trim(coalesce(p_payer_name,'')),'') is null then raise exception 'Sponsor name required'; end if;
  if p_expected_amount is not null and p_expected_amount < 0 then raise exception 'Expected amount cannot be negative'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then raise exception 'Player not found'; end if;
  select id into v_id from app.payments where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_id is not null then return v_id; end if;
  insert into app.payments(organization_id,player_id,amount,payment_date,method,reference,concept,status,source,category,idempotency_key,payer_type,payer_name,payment_purpose,credit_status,collected_by_name,created_by_user_id,expected_amount,observations,created_at,updated_at)
  values(p_organization_id,p_player_id,p_amount,coalesce(p_payment_date,current_date),coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),coalesce(nullif(trim(p_concept),''),'Mensualidad'),'posted','tanneros_v2','Mensualidad',trim(p_idempotency_key),v_payer_type,nullif(trim(p_payer_name),''),'billing','available',nullif(trim(p_collected_by_name),''),v_actor,p_expected_amount,nullif(trim(p_observations),''),now(),now()) returning id into v_id;
  perform app.allocate_payment_oldest_first(v_id);
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'PaymentPosted','payment',v_id,jsonb_build_object('player_id',p_player_id,'amount',p_amount,'payment_date',coalesce(p_payment_date,current_date),'payerType',v_payer_type,'payerName',nullif(trim(p_payer_name),''),'collectedBy',nullif(trim(p_collected_by_name),''),'expectedAmount',p_expected_amount),v_actor,trim(p_idempotency_key));
  return v_id;
end $function$;
