create or replace function private.role_code_to_legacy(p_role_code text)
returns text language sql immutable set search_path='' as $$
  select case p_role_code
    when 'president' then 'Presidencia'
    when 'operations' then 'Operaciones'
    when 'coach' then 'Formadores'
    when 'academy' then 'Academia'
    when 'cashier' then 'Taquilla'
    when 'accounting' then 'Contabilidad'
    when 'commercial' then 'La Quinta Fuerza'
    when 'scouting' then 'Scouting'
    when 'player' then 'Tanner'
    else null end
$$;

create or replace function private.legacy_role_to_code(p_role text)
returns text language sql immutable set search_path='' as $$
  select case p_role
    when 'Presidencia' then 'president'
    when 'Operaciones' then 'operations'
    when 'Formadores' then 'coach'
    when 'Academia' then 'academy'
    when 'Taquilla' then 'cashier'
    when 'Contabilidad' then 'accounting'
    when 'La Quinta Fuerza' then 'commercial'
    when 'Scouting' then 'scouting'
    when 'Tanner' then 'player'
    else null end
$$;

create or replace function private.query_users_admin(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','public','app','private','auth' as $$
declare v_members jsonb; v_invites jsonb;
begin
  if not private.has_module_access(p_organization_id,'users',false) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId',m.id,'userId',m.user_id,'displayName',p.display_name,'email',u.email,
    'role',m.role,'roleCode',private.legacy_role_to_code(m.role),'active',m.active,'isOwner',m.is_owner,
    'profileActive',coalesce(p.active,true),'createdAt',m.created_at,'updatedAt',m.updated_at
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
  from app.organization_invitations i where i.organization_id=p_organization_id;
  return jsonb_build_object('members',v_members,'invitations',v_invites);
end $$;

create or replace function private.command_update_membership_admin(p_organization_id uuid,p_membership_id uuid,p_role_code text,p_active boolean)
returns void language plpgsql security definer set search_path='pg_catalog','public','app','private' as $$
declare v_role text; v_owner boolean; v_user uuid;
begin
  if not private.can_manage_users(p_organization_id) then raise exception 'Not authorized'; end if;
  select is_owner,user_id into v_owner,v_user from public.organization_memberships where id=p_membership_id and organization_id=p_organization_id for update;
  if v_user is null then raise exception 'Membership not found'; end if;
  if v_owner then raise exception 'Owner membership is protected'; end if;
  v_role:=private.role_code_to_legacy(p_role_code);
  if v_role is null then raise exception 'Invalid role'; end if;
  update public.organization_memberships set role=v_role,active=coalesce(p_active,true),updated_at=now() where id=p_membership_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'OrganizationMembershipUpdated','membership',p_membership_id,jsonb_build_object('roleCode',p_role_code,'active',coalesce(p_active,true)),(select auth.uid()));
end $$;

create or replace function private.command_revoke_invitation(p_organization_id uuid,p_invitation_id uuid)
returns void language plpgsql security definer set search_path='pg_catalog','app','private' as $$
begin
  if not private.can_manage_users(p_organization_id) then raise exception 'Not authorized'; end if;
  update app.organization_invitations set status='revoked',updated_at=now()
  where id=p_invitation_id and organization_id=p_organization_id and status='pending';
  if not found then raise exception 'Pending invitation not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'OrganizationInvitationRevoked','invitation',p_invitation_id,'{}'::jsonb,(select auth.uid()));
end $$;

create or replace function public.v2_users_admin(organization_id uuid) returns jsonb language sql stable security definer set search_path='pg_catalog','private' as $$ select private.query_users_admin(organization_id) $$;
create or replace function public.v2_update_membership(organization_id uuid,membership_id uuid,role_code text,active boolean) returns void language sql security definer set search_path='pg_catalog','private' as $$ select private.command_update_membership_admin(organization_id,membership_id,role_code,active) $$;
create or replace function public.v2_revoke_invitation(organization_id uuid,invitation_id uuid) returns void language sql security definer set search_path='pg_catalog','private' as $$ select private.command_revoke_invitation(organization_id,invitation_id) $$;

revoke all on function public.v2_users_admin(uuid) from public,anon;
revoke all on function public.v2_update_membership(uuid,uuid,text,boolean) from public,anon;
revoke all on function public.v2_revoke_invitation(uuid,uuid) from public,anon;
grant execute on function public.v2_users_admin(uuid) to authenticated;
grant execute on function public.v2_update_membership(uuid,uuid,text,boolean) to authenticated;
grant execute on function public.v2_revoke_invitation(uuid,uuid) to authenticated;;
