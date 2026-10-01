-- La miniatura del registro público por fin puede subirse
--
-- El formulario público sube DOS archivos: profile.<ext> (la foto) y
-- profile-thumb.<ext> (la miniatura de ~8 kB que usan las listas). La
-- función que hace de candado para visitantes anónimos sólo aceptaba
-- 'profile\.', así que la miniatura se rechazaba SIEMPRE. El formulario
-- lo trata como opcional y sigue sin ella, así que nadie se enteraba.
--
-- Medido hoy: de los últimos 8 registros públicos con foto, 0 traen
-- miniatura. v2_public_attach_prospect_photo ya esperaba la ruta
-- 'profile-thumb.'; lo único que faltaba era dejarla subir.
--
-- Mismas reglas que para la foto: el prospecto existe, vino del formulario
-- público, pide foto, todavía no tiene una y tiene menos de 24 horas.
--
-- REVERSIBLE: quitar '(-thumb)?' del patrón la regresa a como estaba.

create or replace function private.public_prospect_photo_upload_allowed(p_name text)
returns boolean
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app'
as $function$
declare v_org uuid; v_prospect uuid;
begin
  if p_name !~* '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/prospects/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/profile(-thumb)?\.(jpg|jpeg|png|webp)$' then return false; end if;
  v_org:=split_part(p_name,'/',2)::uuid;
  v_prospect:=split_part(p_name,'/',4)::uuid;
  return exists(
    select 1 from app.prospects p
    where p.id=v_prospect and p.organization_id=v_org and p.source='public_form'
      and p.photo_required=true and p.photo_path is null and p.created_at >= now()-interval '24 hours'
  );
exception when others then return false;
end $function$;
