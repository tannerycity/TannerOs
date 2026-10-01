-- Los permisos especiales de cada persona, a la vista y con quién los dio
--
-- LO QUE PIDIÓ EL CLUB: darle a una persona permisos que su rol no trae
-- (Zul: Operaciones + Patrocinadores) y que "todos lo vean".
--
-- La pantalla de Usuarios YA permite ajustar módulo por módulo a una persona
-- (private.membership_module_overrides), y cada cambio ya guarda quién y
-- cuándo (updated_by_user_id, updated_at y un evento
-- MembershipModuleAccessChanged). Lo que no hacía era DECIRLO: la ficha
-- marcaba "Ajuste especial" sin nombre ni fecha.
--
-- Este cambio sólo agrega dos campos por módulo en v2_users_admin:
--   overrideBy  quién autorizó el ajuste (nombre de su perfil)
--   overrideAt  cuándo
--
-- Mismo permiso de lectura que antes (módulo 'users'). Nada se escribe.
-- REVERSIBLE: recrear la función sin esos dos campos.

create or replace function private.query_users_admin(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public', 'app', 'private', 'auth'
as $function$
declare
  v_members jsonb;
  v_invites jsonb;
  v_players jsonb;
begin
  if not private.has_module_access(p_organization_id,'users',false) then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId',m.id,
    'userId',m.user_id,
    'displayName',p.display_name,
    'email',u.email,
    'role',m.role,
    'roleCode',private.legacy_role_to_code(m.role),
    'active',m.active,
    'isOwner',m.is_owner,
    'profileActive',coalesce(p.active,true),
    'createdAt',m.created_at,
    'updatedAt',m.updated_at,
    'linkedPlayers',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',pl.id,
        'name',trim(concat_ws(' ',pl.first_name,pl.last_name)),
        'category',pl.category,
        'status',pl.status
      ) order by pl.first_name,pl.last_name),'[]'::jsonb)
      from app.user_player_access upa
      join app.players pl
        on pl.id=upa.player_id
       and pl.organization_id=upa.organization_id
       and pl.archived_at is null
      where upa.organization_id=m.organization_id
        and upa.user_id=m.user_id
        and upa.access_kind='family'
    ),
    'modules',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'moduleCode',md.code,
        'moduleName',md.name,
        'enabled',private.module_enabled(p_organization_id,md.code),
        'baseCanRead',coalesce(rp.can_read,false),
        'baseCanWrite',coalesce(rp.can_write,false),
        'overrideCanRead',mo.can_read,
        'overrideCanWrite',mo.can_write,
        'effectiveCanRead',private.module_enabled(p_organization_id,md.code) and coalesce(mo.can_read,rp.can_read,false),
        'effectiveCanWrite',private.module_enabled(p_organization_id,md.code) and coalesce(mo.can_read,rp.can_read,false) and coalesce(mo.can_write,rp.can_write,false),
        'customized',mo.membership_id is not null,
        'overrideBy',case when mo.membership_id is not null then coalesce(nullif(btrim(ob.display_name),''),'Alguien sin nombre') end,
        'overrideAt',mo.updated_at,
        'sortOrder',md.sort_order
      ) order by md.sort_order,md.code),'[]'::jsonb)
      from public.modules md
      left join public.role_module_permissions rp
        on rp.organization_id=m.organization_id
       and rp.role=m.role
       and rp.module_code=md.code
      left join private.membership_module_overrides mo
        on mo.organization_id=m.organization_id
       and mo.membership_id=m.id
       and mo.module_code=md.code
      left join public.profiles ob on ob.user_id=mo.updated_by_user_id
      where md.active=true
    )
  ) order by m.is_owner desc,coalesce(p.display_name,u.email,m.user_id::text)),'[]'::jsonb)
  into v_members
  from public.organization_memberships m
  left join public.profiles p on p.user_id=m.user_id
  left join auth.users u on u.id=m.user_id
  where m.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'email',i.email,'roleCode',i.role_code,'status',i.status,'expiresAt',i.expires_at,
    'acceptedAt',i.accepted_at,'createdAt',i.created_at,'updatedAt',i.updated_at
  ) order by i.created_at desc),'[]'::jsonb)
  into v_invites
  from app.organization_invitations i
  where i.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pl.id,
    'name',trim(concat_ws(' ',pl.first_name,pl.last_name)),
    'category',pl.category,
    'status',pl.status
  ) order by pl.status='active' desc,pl.first_name,pl.last_name),'[]'::jsonb)
  into v_players
  from app.players pl
  where pl.organization_id=p_organization_id and pl.archived_at is null;

  return jsonb_build_object('members',v_members,'invitations',v_invites,'players',v_players);
end
$function$;
