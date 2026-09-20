alter table app.organization_invitations drop constraint if exists organization_invitations_role_code_check;
alter table app.organization_invitations add constraint organization_invitations_role_code_check
check (role_code in ('owner','president','operations','coach','academy','cashier','accounting','commercial','scouting','player'));

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,app,private
as $fn$
begin
  insert into public.profiles(user_id,display_name,phone,active,created_at,updated_at)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,''),'@',1)),new.phone,true,now(),now())
  on conflict(user_id) do nothing;
  if new.email is not null and new.confirmed_at is not null then
    perform private.accept_pending_invites(new.id,new.email);
  end if;
  return new;
end;
$fn$;

revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update(display_name,phone,avatar_path,updated_at) on public.profiles to authenticated;

create or replace function private.command_create_invitation(p_organization_id uuid,p_email text,p_role_code text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog,public,app,private,extensions
as $fn$
declare v_id uuid; v_actor uuid:=(select auth.uid()); v_email text:=lower(trim(p_email));
begin
  if not private.can_manage_users(p_organization_id) then raise exception 'Not authorized'; end if;
  if v_email is null or position('@' in v_email)<2 then raise exception 'Valid email required'; end if;
  if p_role_code not in ('owner','president','operations','coach','academy','cashier','accounting','commercial','scouting','player') then raise exception 'Invalid role'; end if;
  update app.organization_invitations set status='revoked',updated_at=now()
    where organization_id=p_organization_id and lower(email)=v_email and status='pending';
  insert into app.organization_invitations(organization_id,email,role_code,invited_by,token_hash,status,expires_at)
  values(p_organization_id,v_email,p_role_code,v_actor,encode(digest(gen_random_uuid()::text,'sha256'),'hex'),'pending',now()+interval '7 days')
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'OrganizationInvitationCreated','invitation',v_id,jsonb_build_object('email',v_email,'role_code',p_role_code),v_actor);
  return v_id;
end;
$fn$;
revoke all on function private.command_create_invitation(uuid,text,text) from public,anon,authenticated;

create or replace function public.v2_create_invitation(organization_id uuid,email text,role_code text)
returns uuid language sql security invoker set search_path=pg_catalog,private
as $$ select private.command_create_invitation(organization_id,email,role_code) $$;
revoke all on function public.v2_create_invitation(uuid,text,text) from public,anon;
grant execute on function public.v2_create_invitation(uuid,text,text) to authenticated;

create or replace function public.v2_my_context()
returns table(user_id uuid,display_name text,organization_id uuid,organization_name text,organization_slug text,role text,is_owner boolean)
language sql
security invoker
set search_path=pg_catalog,public
as $$
  select p.user_id,p.display_name,o.id,o.name,o.slug,m.role,m.is_owner
  from public.profiles p
  join public.organization_memberships m on m.user_id=p.user_id and m.active=true
  join public.organizations o on o.id=m.organization_id and o.status='active'
  where p.user_id=(select auth.uid()) and p.active=true
$$;
revoke all on function public.v2_my_context() from public,anon;
grant execute on function public.v2_my_context() to authenticated;;
