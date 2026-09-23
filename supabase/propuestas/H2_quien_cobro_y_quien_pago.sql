-- H2 · Quien del club cobro y quien entrego cada pago
--
-- APLICADA EN PRODUCCION el 2026-09-22.
-- Migracion: 20260922200825_h2_quien_cobro_y_quien_pago
--
-- POR QUE TEXTO Y NO SOLO EL USUARIO
-- Medido en produccion con H1 ya aplicada, esto es lo que el usuario del
-- sistema muestra hoy en los egresos:
--     "Presidencia"  14 movimientos
--     "iPad"          3 movimientos
-- Ninguno es una persona: son cuentas compartidas. El usuario NO responde
-- "quien le pago a los profes".
--
-- Y por que no solo texto: un texto se deja vacio, se escribe mal o se pone a
-- modo. Si un dia hay un descuadre, no queda nada duro.
--
-- Van los dos. El texto dice quien fue; el usuario es el rastro que nadie
-- puede falsificar. La pantalla muestra el texto y, si no hay, cae al usuario.
--
-- DOS CUIDADOS QUE ESTA MIGRACION SI TIENE
--
-- 1. Anadir un parametro NO reemplaza la funcion: crea una segunda y deja la
--    vieja. Eso fue el bug de v2_post_expense, que dejo a Taquilla sin poder
--    registrar egresos con "Could not choose the best candidate function".
--    Aqui cada funcion se crea Y se borra la anterior en la misma transaccion,
--    y al final se comprueba que quede una sola. Si no, se revienta sola.
--
-- 2. El cuerpo de command_post_payment se copia TAL CUAL del que corre hoy,
--    con un solo anadido. Escribirlo de memoria habria perdido cosas que no
--    se ven a simple vista, entre ellas
--        perform app.allocate_payment_oldest_first(v_id);
--    que es lo que aplica el cobro a los adeudos del Tanner. Sin esa linea los
--    cobros entrarian pero no bajarian ninguna deuda.

begin;

-- 1 · Donde se guarda -------------------------------------------------------
-- Nullable: no bloquean, no tocan lo existente, y lo viejo se queda en null,
-- que es la verdad (nunca se pregunto quien fue).
alter table app.payments add column if not exists collected_by_name text;
alter table app.payments add column if not exists created_by_user_id uuid;
alter table app.expenses add column if not exists paid_by_name text;

comment on column app.payments.collected_by_name is
  'Quien del club recibio el dinero, escrito a mano. El iPad es cuenta compartida, asi que el usuario no alcanza.';
comment on column app.payments.created_by_user_id is
  'Cuenta con la que se registro. Rastro duro; puede ser compartida.';
comment on column app.expenses.paid_by_name is
  'Quien del club entrego el pago. Distinto de supplier_name, que es a quien se le pago.';

-- 2 · Cobro de un Tanner ----------------------------------------------------
-- Copia exacta de la funcion que corre hoy. Lo unico nuevo esta marcado.
create or replace function private.command_post_payment(
  p_organization_id uuid, p_player_id uuid, p_amount numeric, p_payment_date date,
  p_method text, p_reference text, p_concept text, p_payer_type text,
  p_payer_name text, p_idempotency_key text,
  p_collected_by_name text                                   -- NUEVO
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare v_id uuid; v_actor uuid:=(select auth.uid()); v_payer_type text:=coalesce(nullif(trim(p_payer_type),''),'guardian');
begin
  if not private.has_module_access(p_organization_id,'billing',true) then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
  if v_payer_type not in ('guardian','sponsor','player','organization','other') then raise exception 'Invalid payer type'; end if;
  if v_payer_type='sponsor' and nullif(trim(coalesce(p_payer_name,'')),'') is null then raise exception 'Sponsor name required'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then raise exception 'Player not found'; end if;
  select id into v_id from app.payments where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_id is not null then return v_id; end if;
  insert into app.payments(organization_id,player_id,amount,payment_date,method,reference,concept,status,source,category,idempotency_key,payer_type,payer_name,payment_purpose,credit_status,
    collected_by_name,created_by_user_id,                     -- NUEVO
    created_at,updated_at)
  values(p_organization_id,p_player_id,p_amount,coalesce(p_payment_date,current_date),coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),coalesce(nullif(trim(p_concept),''),'Mensualidad'),'posted','tanneros_v2','Mensualidad',trim(p_idempotency_key),v_payer_type,nullif(trim(p_payer_name),''),'billing','available',
    nullif(trim(p_collected_by_name),''), v_actor,            -- NUEVO
    now(),now()) returning id into v_id;
  perform app.allocate_payment_oldest_first(v_id);
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'PaymentPosted','payment',v_id,jsonb_build_object('player_id',p_player_id,'amount',p_amount,'payment_date',coalesce(p_payment_date,current_date),'payerType',v_payer_type,'payerName',nullif(trim(p_payer_name),''),
    'collectedBy',nullif(trim(p_collected_by_name),'')),      -- NUEVO
    v_actor,trim(p_idempotency_key));
  return v_id;
end $function$;

create or replace function public.v2_post_payment(
  organization_id uuid, player_id uuid, amount numeric, payment_date date, method text,
  reference text default null::text, concept text default null::text,
  payer_type text default 'guardian'::text, payer_name text default null::text,
  idempotency_key text default null::text,
  collected_by_name text default null::text                  -- NUEVO
) returns uuid
language sql
set search_path to 'pg_catalog', 'private'
as $function$
  select private.command_post_payment(organization_id,player_id,amount,payment_date,method,reference,concept,payer_type,payer_name,idempotency_key,collected_by_name)
$function$;

-- La version SIN el parametro se va. Si se quedara, una llamada con diez
-- argumentos encajaria con las dos y Postgres se negaria a elegir.
drop function if exists public.v2_post_payment(uuid,uuid,numeric,date,text,text,text,text,text,text);
drop function if exists private.command_post_payment(uuid,uuid,numeric,date,text,text,text,text,text,text);

-- Crear una funcion en private la vuelve ejecutable por PUBLIC. Se revoca
-- siempre: private es private.
revoke all on function private.command_post_payment(uuid,uuid,numeric,date,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.v2_post_payment(uuid,uuid,numeric,date,text,text,text,text,text,text,text) to authenticated;

-- 3 · Que quede una sola de cada una ---------------------------------------
do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='v2_post_payment';
  if v <> 1 then raise exception 'v2_post_payment quedo % veces; una llamada saldria ambigua', v; end if;

  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='command_post_payment';
  if v <> 1 then raise exception 'command_post_payment quedo % veces', v; end if;
end $$;

commit;

-- REVERSA
--   alter table app.payments drop column collected_by_name, drop column created_by_user_id;
--   alter table app.expenses drop column paid_by_name;
--   y recrear las dos funciones sin el ultimo parametro. Guardar antes:
--     select pg_get_functiondef(oid) from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname in ('public','private')
--       and p.proname in ('v2_post_payment','command_post_payment');
