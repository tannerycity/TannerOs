-- Una familia que pide desde el portal llega como Tanner Pass. El club decide el
-- tipo al autorizar, que es el punto donde ya se decide folio y cortesía.
-- El precio se recalcula ANTES de generar el cargo: el cargo usaba pp.price, que
-- se leyó al entrar, así que un cambio de tipo se habría cobrado al precio viejo.
do $$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace
   where nsp.nspname='private' and p.proname='command_approve_parking';
  if d is null then raise exception 'No existe command_approve_parking'; end if;
  n := d;

  if position('p_courtesy_reason text DEFAULT NULL::text)' in n)=0 then raise exception 'Ancla: firma'; end if;
  n := replace(n,'p_courtesy_reason text DEFAULT NULL::text)','p_courtesy_reason text DEFAULT NULL::text, p_pass_type text DEFAULT NULL::text)');

  if position('v_courtesy boolean; v_reason text; v_concepto text;' in n)=0 then raise exception 'Ancla: declare'; end if;
  n := replace(n,'v_courtesy boolean; v_reason text; v_concepto text;','v_courtesy boolean; v_reason text; v_concepto text; v_type text; v_price numeric;');

  if position('if v_courtesy and v_reason is null then raise exception ''Escribe el motivo de la cortesía''; end if;' in n)=0 then raise exception 'Ancla: motivo'; end if;
  n := replace(n,'if v_courtesy and v_reason is null then raise exception ''Escribe el motivo de la cortesía''; end if;',
    'if v_courtesy and v_reason is null then raise exception ''Escribe el motivo de la cortesía''; end if;'||chr(10)||
    '  v_type := case when lower(coalesce(btrim(p_pass_type),'''')) in (''vip'',''tanner'') then lower(btrim(p_pass_type)) else pp.pass_type end;'||chr(10)||
    '  v_price := case when v_courtesy then 0 else app.parking_pass_price(v_type) end;');

  if position('v_concepto, pp.price,' in n)=0 then raise exception 'Ancla: precio del cargo'; end if;
  n := replace(n,'v_concepto, pp.price,','v_concepto, v_price,');

  if position('price=case when v_courtesy then 0 else price end,' in n)=0 then raise exception 'Ancla: update de precio'; end if;
  n := replace(n,'price=case when v_courtesy then 0 else price end,','price=v_price, pass_type=v_type,');

  if position('''price'', case when v_courtesy then 0 else pp.price end,' in n)=0 then raise exception 'Ancla: bitácora'; end if;
  n := replace(n,'''price'', case when v_courtesy then 0 else pp.price end,','''price'', v_price, ''pass_type'', v_type,');

  execute n;
end $$;

drop function if exists private.command_approve_parking(uuid,uuid,text,boolean,text);
drop function if exists public.v2_approve_parking(uuid,uuid,text,boolean,text);

create function public.v2_approve_parking(organization_id uuid, pass_id uuid, folio text default null,
  courtesy boolean default null, courtesy_reason text default null, pass_type text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_approve_parking(organization_id, pass_id, folio, courtesy, courtesy_reason, pass_type) $function$;

revoke all on function private.command_approve_parking(uuid,uuid,text,boolean,text,text) from public, anon, authenticated;
revoke all on function public.v2_approve_parking(uuid,uuid,text,boolean,text,text) from public, anon;
grant execute on function public.v2_approve_parking(uuid,uuid,text,boolean,text,text) to authenticated;;
