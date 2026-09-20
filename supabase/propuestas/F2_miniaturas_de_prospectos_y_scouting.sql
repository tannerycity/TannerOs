-- PROPUESTA · NO APLICADA · NO PROBADA
--
-- Los 39 MB que la herramienta de fotos NO cubre.
--
-- EL HALLAZGO: `v2/admin/fotos` arregla el padrón y nada más. Midiendo dónde
-- están de verdad los PNG (20 de septiembre de 2026):
--
--   players    37 PNG · 105 MB  ← la herramienta sí
--   prospects  13 PNG ·  35 MB  ← NO
--   scouting    2 PNG ·   4 MB  ← NO
--   branding   11 PNG · 651 kB  ← a propósito: son los iconos de la app
--
-- Importante para no exagerar el problema: esos 39 MB son **espacio, no
-- tráfico**. Las listas de prospectos y scouting no abren fotos solas —lo
-- impide una barrera de `qa-static.mjs`— así que casi no generan egress. Pesan
-- para el límite de 1 GB y para la cuenta del SaaS, no para la factura que
-- disparó la alarma.
--
-- Por qué hace falta una migración para prospectos, y no sólo código:
--
--   · `app.prospects` tiene `photo_path` pero **no tiene `photo_thumb_path`**.
--     No hay dónde guardar una miniatura.
--   · No existe ninguna RPC autenticada que actualice la foto de un prospecto.
--     La única que hay, `v2_public_attach_prospect_photo`, es del formulario
--     público, pide la llave del club y sólo escribe `photo_path`.
--
-- Scouting NO necesita migración: `v2_set_scouting_photo` ya recibe las dos
-- rutas. Pero ojo con esto, que costaría un despliegue fallido:
--
--     v_parts[5] !~* '^profile-[0-9]{10,16}\.(...)$'
--
--   Esa función **valida el formato de la ruta**. La herramienta de fotos
--   escribe `profile-<stamp>-opt<stamp>.webp`, que NO pasa esa validación. Al
--   extender la herramienta a scouting hay que escribir `profile-<stamp>.webp`
--   con una marca de tiempo nueva, no agregarle un sufijo a la vieja.
--
-- REVERSO al final.
--
-- Lo que SÍ se verificó, sin aplicar nada: las columnas de `app.prospects`, la
-- salida de `private.query_prospects`, y el cuerpo de `v2_set_scouting_photo`
-- con su validación de ruta.
--
-- Lo que NO: que corra. Nadie la ha ejecutado.

begin;

alter table app.prospects
  add column if not exists photo_thumb_path text;

comment on column app.prospects.photo_thumb_path is
  'Miniatura del prospecto. Las listas sólo consumen esto; sin miniatura van las iniciales, nunca el original.';

-- La lista de prospectos tiene que devolver la miniatura, si no, el contrato de
-- egress no se puede cumplir desde el cliente.
--
-- OJO: `private.query_prospects` devuelve 32 columnas y el orden importa. La
-- nueva va AL FINAL. Cambiar el orden de una columna existente rompe todas las
-- pantallas que la consumen por posición.
--
--   Aquí va el `create or replace function private.query_prospects(...)`
--   completo, con `photo_thumb_path` agregado al final del RETURNS TABLE y del
--   SELECT. Se deja indicado y no escrito a ciegas: la función vive en la base
--   y hay que sacarla con `pg_get_functiondef` al momento de aplicar esto, para
--   no arriesgarse a pisar cambios que le hayan hecho desde el 20 de septiembre.
--
--   Postgres no deja cambiar el tipo de retorno de una función existente, así
--   que primero va un `drop function` y luego el `create`. Eso implica volver a
--   otorgar el EXECUTE, y —la trampa de siempre— volver a REVOCARLO de PUBLIC:
--   crear una función en `private` le regala EXECUTE a PUBLIC otra vez.

create or replace function private.set_prospect_photo(
  p_organization_id uuid,
  p_prospect_id     uuid,
  p_photo_path      text,
  p_photo_thumb_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','public','private'
as $fn$
declare v_partes text[]; v_partes_mini text[];
begin
  if not private.has_module_access(p_organization_id, 'prospects', true) then
    raise exception 'Not authorized';
  end if;

  -- Misma validación de ruta que usa scouting: una ruta sólo puede apuntar a la
  -- carpeta de SU prospecto, dentro de SU club. Sin esto, quien pueda llamar la
  -- función podría apuntar la foto de un prospecto a un archivo ajeno.
  v_partes := string_to_array(coalesce(p_photo_path, ''), '/');
  if coalesce(array_length(v_partes, 1), 0) <> 5
     or v_partes[1] <> 'organizations'
     or v_partes[2] <> p_organization_id::text
     or v_partes[3] <> 'prospects'
     or v_partes[4] <> p_prospect_id::text then
    raise exception 'La ruta de la foto no corresponde a este prospecto';
  end if;

  if p_photo_thumb_path is not null then
    v_partes_mini := string_to_array(p_photo_thumb_path, '/');
    if coalesce(array_length(v_partes_mini, 1), 0) <> 5
       or v_partes_mini[2] <> p_organization_id::text
       or v_partes_mini[4] <> p_prospect_id::text then
      raise exception 'La ruta de la miniatura no corresponde a este prospecto';
    end if;
  end if;

  update app.prospects
     set photo_path = p_photo_path,
         photo_thumb_path = p_photo_thumb_path,
         photo_uploaded_at = now()
   where id = p_prospect_id and organization_id = p_organization_id;

  if not found then raise exception 'Prospecto no encontrado'; end if;
  return jsonb_build_object('ok', true, 'prospectId', p_prospect_id);
end
$fn$;

revoke all on function private.set_prospect_photo(uuid,uuid,text,text)
  from public, anon, authenticated;

create or replace function public.v2_set_prospect_photo(
  organization_id uuid, prospect_id uuid, photo_path text, photo_thumb_path text default null
)
returns jsonb
language sql
security invoker
set search_path to 'pg_catalog','private'
as $fn$
  select private.set_prospect_photo(organization_id, prospect_id, photo_path, photo_thumb_path)
$fn$;

grant execute on function public.v2_set_prospect_photo(uuid,uuid,text,text) to authenticated;

commit;


-- ============================================================================
-- REVERSO · no borra ninguna foto ni ningún prospecto.
-- ============================================================================
--
-- begin;
--   drop function if exists public.v2_set_prospect_photo(uuid,uuid,text,text);
--   drop function if exists private.set_prospect_photo(uuid,uuid,text,text);
--   -- La columna se deja: quitarla perdería las miniaturas ya generadas, y
--   -- una columna de más no le estorba a nadie.
--   -- alter table app.prospects drop column photo_thumb_path;
-- commit;
