-- h43 (25/10/2026): logo de cada marca, para verlo en el mapa del uniforme.
-- Se guarda en tanneros-private bajo organizations/<org>/sponsors/logos/<marca>/
-- (las políticas de storage del módulo sponsors ya cubren esa ruta).
alter table app.sponsors add column if not exists logo_bucket text;
alter table app.sponsors add column if not exists logo_path text;

create or replace function private.command_set_sponsor_logo(p_organization_id uuid, p_sponsor_id uuid, p_logo_path text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private', 'storage'
as $function$
declare
  v_parts text[];
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then
    raise exception 'Not authorized';
  end if;
  if not exists (select 1 from app.sponsors s where s.id = p_sponsor_id and s.organization_id = p_organization_id and s.archived_at is null) then
    raise exception 'Sponsor not found';
  end if;

  if p_logo_path is not null then
    v_parts := string_to_array(p_logo_path, '/');
    if coalesce(array_length(v_parts, 1), 0) <> 6
       or v_parts[1] <> 'organizations'
       or v_parts[2] <> p_organization_id::text
       or v_parts[3] <> 'sponsors'
       or v_parts[4] <> 'logos'
       or v_parts[5] <> p_sponsor_id::text
       or v_parts[6] !~* '^logo-[0-9]{10,16}\.(png|webp|jpg|jpeg)$'
    then
      raise exception 'Invalid photo path';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'tanneros-private' and o.name = p_logo_path) then
      raise exception 'Photo upload not found';
    end if;
  end if;

  update app.sponsors s
     set logo_bucket = case when p_logo_path is null then null else 'tanneros-private' end,
         logo_path = p_logo_path,
         updated_at = now()
   where s.id = p_sponsor_id and s.organization_id = p_organization_id;

  return jsonb_build_object('id', p_sponsor_id, 'logoPath', p_logo_path,
    'logoBucket', case when p_logo_path is null then null else 'tanneros-private' end);
end
$function$;

create or replace function public.v2_set_sponsor_logo(organization_id uuid, sponsor_id uuid, logo_path text)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select private.command_set_sponsor_logo(organization_id, sponsor_id, logo_path)
$function$;

revoke all on function private.command_set_sponsor_logo(uuid, uuid, text) from public, anon;
revoke all on function public.v2_set_sponsor_logo(uuid, uuid, text) from public, anon;
grant execute on function public.v2_set_sponsor_logo(uuid, uuid, text) to authenticated;

-- El tablero de patrocinios regresa el logo de cada marca.
do $patch$
declare
  v_def text := pg_get_functiondef('private.query_sponsor_admin(uuid)'::regprocedure);
  v_new text;
begin
  if position('''logoPath''' in v_def) > 0 then return; end if;
  v_new := replace(v_def, '''lostReason'',s.lost_reason,', '''lostReason'',s.lost_reason,''logoPath'',s.logo_path,''logoBucket'',s.logo_bucket,');
  if v_new = v_def then raise exception 'query_sponsor_admin: no se encontró dónde agregar el logo'; end if;
  execute v_new;
end
$patch$;
