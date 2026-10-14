-- Quién edita el catálogo (14/10/2026): "Zul no tiene permisos para editar el
-- catálogo, vamos a dárselo". Presidencia sigue pudiendo siempre; además puede
-- quien tenga un AJUSTE ESPECIAL personal de Catálogo con escritura (Usuarios ›
-- persona › Catálogo). Es por persona a propósito: no se abre a todo un rol
-- (ni a Marketing, que tiene Catálogo por rol). Promociones siguen siendo de
-- Presidencia.
create or replace function private.can_edit_catalog(p_organization_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public','private' as $$
  select private.is_presidency(p_organization_id)
      or (private.is_active_member(p_organization_id) and exists (
           select 1 from public.organization_memberships m
             join private.membership_module_overrides mo
               on mo.organization_id = m.organization_id and mo.membership_id = m.id and mo.module_code = 'catalogo'
            where m.organization_id = p_organization_id and m.user_id = (select auth.uid()) and m.active
              and mo.can_read and mo.can_write))
$$;
revoke all on function private.can_edit_catalog(uuid) from public, anon;
grant execute on function private.can_edit_catalog(uuid) to authenticated;

do $$
declare f text; d text;
begin
  foreach f in array array[
    'private.command_upsert_product(uuid,uuid,text,text,text,numeric,numeric,jsonb,boolean,text,integer)',
    'private.command_set_product_archived(uuid,uuid,boolean)',
    'private.command_upsert_bundle(uuid,uuid,text,text,numeric,numeric,jsonb,boolean,date,text)',
    'private.command_set_bundle_archived(uuid,uuid,boolean)',
    'private.set_product_personalizable(uuid,uuid,boolean)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('can_edit_catalog' in d) = 0 then
      d := replace(d, 'if not private.is_presidency(p_organization_id) then raise exception ''Solo Presidencia puede editar el catálogo'';',
                      'if not private.can_edit_catalog(p_organization_id) then raise exception ''No tienes permiso para editar el catálogo'';');
      if position('can_edit_catalog' in d) = 0 then raise exception 'No se pudo parchar %', f; end if;
      execute d;
    end if;
  end loop;
end $$;

create or replace function public.v2_can_edit_catalog(organization_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','private' as $$
  select private.can_edit_catalog(organization_id)
$$;
revoke all on function public.v2_can_edit_catalog(uuid) from public, anon;
grant execute on function public.v2_can_edit_catalog(uuid) to authenticated;
