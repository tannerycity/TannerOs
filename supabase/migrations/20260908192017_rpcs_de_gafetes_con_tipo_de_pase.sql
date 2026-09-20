-- Cirugía dirigida sobre las definiciones existentes en vez de reescribirlas a
-- mano: reescribir una función larga a mano ya costó una regresión esta sesión.
-- Cada reemplazo verifica su ancla y aborta si no la encuentra.
do $$
declare d text; n text;
  procedure_missing constant text := 'Ancla no encontrada en command_create_parking: ';
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace
   where nsp.nspname='private' and p.proname='command_create_parking';
  if d is null then raise exception 'No existe command_create_parking'; end if;

  n := d;
  -- 1) el tipo entra como parámetro con default, para no romper llamadas viejas
  if position('p_courtesy_reason text)' in n)=0 then raise exception '%', procedure_missing||'firma'; end if;
  n := replace(n,'p_courtesy_reason text)','p_courtesy_reason text, p_pass_type text DEFAULT ''tanner'')');
  -- 2) normalización del tipo
  if position('v_reason text := nullif(btrim(coalesce(p_courtesy_reason,'''')),'''');' in n)=0 then raise exception '%', procedure_missing||'declare'; end if;
  n := replace(n,'v_reason text := nullif(btrim(coalesce(p_courtesy_reason,'''')),'''');',
    'v_reason text := nullif(btrim(coalesce(p_courtesy_reason,'''')),'''');'||chr(10)||
    '  v_type text := case when lower(coalesce(btrim(p_pass_type),'''')) = ''vip'' then ''vip'' else ''tanner'' end;');
  -- 3) columna y valor en el insert, y precio según tipo
  if position('price, is_courtesy, courtesy_reason, granted_by_user_id,' in n)=0 then raise exception '%', procedure_missing||'columnas'; end if;
  n := replace(n,'price, is_courtesy, courtesy_reason, granted_by_user_id,','price, pass_type, is_courtesy, courtesy_reason, granted_by_user_id,');
  if position('else app.parking_pass_price() end,' in n)=0 then raise exception '%', procedure_missing||'precio'; end if;
  n := replace(n,'else app.parking_pass_price() end,','else app.parking_pass_price(v_type) end, v_type,');
  -- 4) que quede en la bitácora
  n := replace(n,'''holder_kind'', v_kind,','''holder_kind'', v_kind, ''pass_type'', v_type,');

  execute n;
end $$;

drop function if exists private.command_create_parking(uuid,text,uuid,text,text,text,text,boolean,text);
drop function if exists public.v2_create_parking(uuid,text,text,uuid,text,text,text,boolean,text);

create function public.v2_create_parking(organization_id uuid, holder_kind text, plate text, player_id uuid,
  holder_name text, holder_phone text, vehicle text, courtesy boolean, courtesy_reason text,
  pass_type text default 'tanner')
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_create_parking(organization_id, holder_kind, player_id, holder_name,
  holder_phone, plate, vehicle, courtesy, courtesy_reason, pass_type) $function$;

revoke all on function public.v2_create_parking(uuid,text,text,uuid,text,text,text,boolean,text,text) from public, anon;
grant execute on function public.v2_create_parking(uuid,text,text,uuid,text,text,text,boolean,text,text) to authenticated;;
