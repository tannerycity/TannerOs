-- G1 · Una sola v2_post_expense, y que guarde quien pago
--
-- APLICADA EN PRODUCCION el 2026-09-22.
-- Migracion: 20260922205814_g1_una_sola_v2_post_expense_con_paid_by
-- Lo que sigue es el SQL tal como se aplico, copiado de
-- supabase_migrations.schema_migrations. Si este archivo y la base no
-- coinciden, la base manda.
--
-- EL PROBLEMA
-- public.v2_post_expense existia dos veces:
--   oid 28972 ·  9 argumentos (la vieja)
--   oid 32499 · 10 argumentos (con supplier_name text default null)
-- y lo mismo en private.command_post_expense (oids 28969 y 32498).
--
-- Como el decimo argumento tenia DEFAULT, una llamada con nueve encajaba con
-- las dos y Postgres se negaba a elegir:
--   "Could not choose the best candidate function between: ..."
--
-- Eso dejo a Taquilla sin poder registrar egresos. Contabilidad si mandaba
-- supplier_name, asi que ahi nunca se noto: el mismo boton funcionaba en una
-- pantalla y fallaba en la otra.
--
-- POR QUE SE APLICO AHORA Y NO SOLO EL DROP QUE DECIA ESTE ARCHIVO
-- El parche que estaba en produccion (mandar siempre supplier_name desde las
-- dos pantallas) funcionaba, pero dejaba la trampa puesta para la siguiente
-- pantalla. Y al preparar H2 se metio en Taquilla una llamada con
-- paid_by_name, un parametro que NO existia todavia: eso habria roto el
-- registro de egresos de la misma forma. Asi que G1 hace las dos cosas en una
-- sola transaccion: anadir paid_by_name y dejar una sola version de cada
-- funcion.
--
-- QUE HACE, EN ORDEN
--   1. Crea private.command_post_expense con 11 argumentos. El cuerpo se copia
--      TAL CUAL del que corria, con dos anadidos: la columna paid_by_name en
--      el insert y 'paidBy' en el evento de dominio.
--   2. Crea public.v2_post_expense con 11 argumentos (supplier_name y
--      paid_by_name con default null).
--   3. Borra las CUATRO versiones viejas: publica de 9 y de 10, privada de 9
--      y de 10. Las firmas van completas a proposito: sin ellas Postgres no
--      sabria cual borrar.
--   4. Revoca la privada de public/anon/authenticated. Crear una funcion en
--      private vuelve a darle EXECUTE a PUBLIC, asi que hay que revocar cada
--      vez.
--   5. Comprueba que quede UNA sola de cada una. Si no, revienta y la
--      transaccion no entra.
--
-- RESULTADO VERIFICADO DESPUES DE APLICAR
--   private.command_post_expense  1 version  11 args
--   private.command_post_payment  1 version  11 args
--   public.v2_post_expense        1 version  11 args
--   public.v2_post_payment        1 version  11 args
--
-- PARA REVERTIR
-- No hay vuelta atras automatica: el cuerpo viejo ya no esta en pg_proc. Para
-- volver al estado anterior hay que recrear las versiones de 9 y 10 a partir
-- del historial de este archivo. En la practica no hace falta: la version de
-- 11 acepta las mismas llamadas (los dos parametros nuevos tienen default),
-- asi que ningun cliente existente pierde comportamiento.

-- El cuerpo se copia TAL CUAL del que corre hoy. Lo unico nuevo es
-- p_paid_by_name y su columna en el insert.
create or replace function private.command_post_expense(
  p_organization_id uuid, p_amount numeric, p_expense_date date, p_category text,
  p_method text, p_reference text, p_concept text, p_metadata jsonb,
  p_idempotency_key text, p_supplier_name text, p_paid_by_name text
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_id uuid; v_actor uuid:=(select auth.uid());
begin
  if not (private.has_module_access(p_organization_id,'accounting',true) or private.has_module_access(p_organization_id,'taquilla',true)) then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Expense amount must be greater than zero'; end if;
  if nullif(trim(coalesce(p_category,'')),'') is null then raise exception 'Expense category required'; end if;
  if nullif(trim(coalesce(p_concept,'')),'') is null then raise exception 'Expense concept required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
  select id into v_id from app.expenses where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_id is not null then return v_id; end if;
  insert into app.expenses(organization_id,amount,expense_date,category,method,reference,concept,supplier_name,status,source,metadata,idempotency_key,created_by_user_id,paid_by_name,created_at,updated_at)
  values(p_organization_id,p_amount,coalesce(p_expense_date,current_date),trim(p_category),coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),trim(p_concept),
    nullif(trim(coalesce(p_supplier_name, p_metadata->>'who','')),''),
    'posted','tanneros_v2',coalesce(p_metadata,'{}'::jsonb),trim(p_idempotency_key),v_actor,
    nullif(trim(p_paid_by_name),''),
    now(),now())
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'ExpensePosted','expense',v_id,jsonb_build_object('amount',p_amount,'category',trim(p_category),'expenseDate',coalesce(p_expense_date,current_date),'paidBy',nullif(trim(p_paid_by_name),'')),v_actor,trim(p_idempotency_key));
  return v_id;
exception when unique_violation then
  select id into v_id from app.expenses where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_id is null then raise; end if;
  return v_id;
end
$function$;

create or replace function public.v2_post_expense(
  organization_id uuid, amount numeric, expense_date date, category text,
  method text, reference text, concept text, metadata jsonb,
  idempotency_key text,
  supplier_name text default null::text,
  paid_by_name text default null::text
) returns uuid
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select private.command_post_expense(organization_id,amount,expense_date,category,method,reference,concept,metadata,idempotency_key,supplier_name,paid_by_name)
$function$;

-- Las DOS versiones viejas se van. La de 9 es la que causaba
-- "Could not choose the best candidate function between: ..."
drop function if exists public.v2_post_expense(uuid,numeric,date,text,text,text,text,jsonb,text);
drop function if exists public.v2_post_expense(uuid,numeric,date,text,text,text,text,jsonb,text,text);
drop function if exists private.command_post_expense(uuid,numeric,date,text,text,text,text,jsonb,text);
drop function if exists private.command_post_expense(uuid,numeric,date,text,text,text,text,jsonb,text,text);

revoke all on function private.command_post_expense(uuid,numeric,date,text,text,text,text,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.v2_post_expense(uuid,numeric,date,text,text,text,text,jsonb,text,text,text) to authenticated;

do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='v2_post_expense';
  if v <> 1 then raise exception 'v2_post_expense quedo % veces; una llamada saldria ambigua', v; end if;

  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='command_post_expense';
  if v <> 1 then raise exception 'command_post_expense quedo % veces', v; end if;
end $$;
