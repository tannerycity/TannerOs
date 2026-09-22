-- Entregar ya no exige teclear el folio: para cuando se entrega, el gafete ya
-- lo trae puesto desde que se aprobó. Si por lo que sea llegara sin folio, se
-- genera aquí en vez de rebotarle al de la ventanilla.
create or replace function private.command_issue_parking(
  p_organization_id uuid, p_pass_id uuid, p_folio text default null::text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare pp app.parking_passes; v_folio text;
begin
  if not private.has_any_module_access(p_organization_id, array['estacionamiento', 'players','billing','accounting'], true)
    then raise exception 'Not authorized'; end if;
  select * into pp from app.parking_passes
    where id=p_pass_id and organization_id=p_organization_id for update;
  if pp.id is null then raise exception 'Gafete no encontrado'; end if;
  if pp.status <> 'approved' then raise exception 'Primero hay que autorizar el gafete'; end if;
  v_folio := coalesce(
    nullif(btrim(coalesce(p_folio,'')),''),
    pp.folio,
    app.next_parking_folio(p_organization_id, pp.season, pp.pass_type));
  update app.parking_passes set status='issued', issued_at=now(), folio=v_folio, updated_at=now()
   where id=pp.id;
  perform app.log_parking_event(pp.id,'issued','staff',null, jsonb_build_object('folio', v_folio));
  return jsonb_build_object('ok', true, 'folio', v_folio);
end $function$;
revoke all on function private.command_issue_parking(uuid,uuid,text) from public, anon, authenticated;
;
