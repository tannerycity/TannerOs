-- Números de camiseta: elegir en un toque
--
-- PEDIDO DE PRESIDENCIA (08/10/2026): "siempre que tengo que elegir el
-- número de un jugador es un pedo": hay que entrar a Jugadores, ver cuáles
-- están libres, regresar al pedido y teclearlo.
--
-- MEDIDO: 17 de 64 Tanners activos sin número. Fichar sólo tenía un campo de
-- texto; al levantar un pedido de kit el número salía vacío; y quien levanta
-- pedidos (Tienda) no podía guardar el número en el expediente.
--
-- QUÉ HACE:
--   v2_jersey_board(organization_id, category): los números ocupados de una
--     categoría (con quién lo trae) y 6 sugeridos libres. Lo ve quien ve
--     Jugadores, Tienda o Fichajes.
--   v2_assign_jersey(organization_id, player_id, number): le pone el número
--     al Tanner. Revisa que nadie de su categoría lo traiga y dice quién lo
--     tiene. Jugadores (escritura) puede asignar o cambiar; Tienda (escritura)
--     sólo puede ASIGNAR a quien todavía no tiene número, nunca cambiarlo.
--     Queda en la bitácora.
--
-- REVERSIBLE: borrar las funciones.

create or replace function private.query_jersey_board(p_organization_id uuid, p_category text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private'
as $function$
declare v_ocupados jsonb; v_sug jsonb;
begin
  if not private.has_any_module_access(p_organization_id, array['players','commerce','prospects'], false) then
    raise exception 'Not authorized';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('number',trim(p.jersey_number),'playerId',p.id,
           'name',trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')))
           order by nullif(regexp_replace(p.jersey_number,'\D','','g'),'')::int nulls last), '[]'::jsonb)
    into v_ocupados
    from app.players p
   where p.organization_id=p_organization_id and p.archived_at is null and p.status='active'
     and lower(trim(p.category))=lower(trim(coalesce(p_category,'')))
     and nullif(trim(p.jersey_number),'') is not null;
  select coalesce(jsonb_agg(n::text order by n),'[]'::jsonb) into v_sug
    from (select n from generate_series(1,99) n
           where not exists(select 1 from jsonb_array_elements(v_ocupados) o where o->>'number'=n::text)
           order by n limit 6) s;
  return jsonb_build_object('category',p_category,'taken',v_ocupados,'suggested',v_sug);
end $function$;

create or replace function public.v2_jersey_board(organization_id uuid, category text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_jersey_board(organization_id, category) $function$;
revoke all on function public.v2_jersey_board(uuid,text) from public, anon;
grant execute on function public.v2_jersey_board(uuid,text) to authenticated;

create or replace function private.command_assign_jersey(p_organization_id uuid, p_player_id uuid, p_number text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $function$
declare v app.players%rowtype; v_num text := trim(coalesce(p_number,'')); v_jugadores boolean; v_tienda boolean; v_quien text;
begin
  v_jugadores := private.has_module_access(p_organization_id,'players',true);
  v_tienda := private.has_module_access(p_organization_id,'commerce',true);
  if not (v_jugadores or v_tienda) then raise exception 'Not authorized'; end if;
  if v_num !~ '^[0-9]{1,3}$' then raise exception 'El número va de 1 a 3 dígitos'; end if;
  select * into v from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null for update;
  if not found then raise exception 'Tanner no encontrado'; end if;
  if trim(coalesce(v.jersey_number,'')) = v_num then
    return jsonb_build_object('playerId',v.id,'number',v_num,'changed',false);
  end if;
  if not v_jugadores and nullif(trim(v.jersey_number),'') is not null then
    raise exception 'Este Tanner ya trae el #%. Sólo quien edita Jugadores puede cambiarlo', trim(v.jersey_number);
  end if;
  select trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) into v_quien
    from app.players p
   where p.organization_id=p_organization_id and p.id<>v.id and p.archived_at is null and p.status='active'
     and lower(trim(p.category))=lower(trim(coalesce(v.category,''))) and trim(p.jersey_number)=v_num
   limit 1;
  if v_quien is not null then raise exception 'El #% ya es de % en %', v_num, v_quien, v.category; end if;
  update app.players set jersey_number=v_num, updated_at=now() where id=v.id;
  insert into app.audit_events(organization_id,actor_user_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
  values(p_organization_id, auth.uid(), private.current_actor_label(p_organization_id),
         'jerseyAssigned','players',v.id::text,
         jsonb_build_object('antes',nullif(trim(v.jersey_number),''),'despues',v_num,'categoria',v.category),now());
  return jsonb_build_object('playerId',v.id,'number',v_num,'changed',true);
end $function$;

create or replace function public.v2_assign_jersey(organization_id uuid, player_id uuid, number text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_assign_jersey(organization_id, player_id, number) $function$;
revoke all on function public.v2_assign_jersey(uuid,uuid,text) from public, anon;
grant execute on function public.v2_assign_jersey(uuid,uuid,text) to authenticated;
