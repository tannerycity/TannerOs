-- b3 · La configuración del club también trae cómo pagar
--
-- El botón "Confirmar por WhatsApp" de Pedidos (a3) arma el mensaje con los
-- datos de depósito. Los lee de aquí, igual que el WhatsApp del club, para no
-- escribir la CLABE en el código: cada club tendrá la suya.
create or replace function private.query_club_config(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare o record;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  select name, settings into o from public.organizations where id=p_organization_id;
  if not found then raise exception 'Organization not found'; end if;
  return jsonb_build_object(
    'name', o.name,
    'whatsapp', nullif(regexp_replace(coalesce(o.settings->>'whatsappNumber',''),'\D','','g'),''),
    -- Dos letras por defecto a partir del nombre del club: "Tannery City FC" -> "TC".
    'passwordPrefix', coalesce(
      nullif(upper(regexp_replace(coalesce(o.settings->>'passwordPrefix',''),'[^A-Za-z0-9]','','g')),''),
      nullif(upper(substring(regexp_replace(o.name,'[^A-Za-z ]','','g') from '^(\w)')||
                   coalesce(substring(regexp_replace(o.name,'[^A-Za-z ]','','g') from ' (\w)'),'')),''),
      'TC'),
    'storeUrl', nullif(btrim(coalesce(o.settings->>'storeUrl','')),''),
    'paymentInstructions', coalesce(o.settings->'paymentInstructions', '{}'::jsonb));
end
$$;
