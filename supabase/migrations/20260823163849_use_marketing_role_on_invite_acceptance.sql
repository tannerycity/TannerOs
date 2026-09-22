create or replace function private.accept_pending_invites(p_user_id uuid,p_email text)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public','app'
as $function$
declare r record;v_count integer:=0;v_legacy_role text;
begin
  for r in
    select * from app.organization_invitations
    where lower(email)=lower(p_email) and status='pending' and expires_at>=now()
    for update
  loop
    v_legacy_role:=case r.role_code
      when 'owner' then 'Presidencia'
      when 'president' then 'Presidencia'
      when 'operations' then 'Operaciones'
      when 'coach' then 'Formadores'
      when 'academy' then 'Academia'
      when 'cashier' then 'Taquilla'
      when 'accounting' then 'Contabilidad'
      when 'commercial' then 'Marketing'
      when 'scouting' then 'Scouting'
      when 'player' then 'Tanner'
      else null end;
    if v_legacy_role is null then raise exception 'Unknown role code %',r.role_code;end if;
    insert into public.organization_memberships(organization_id,user_id,role,active,is_owner,created_at,updated_at)
    values(r.organization_id,p_user_id,v_legacy_role,true,r.role_code='owner',now(),now())
    on conflict(organization_id,user_id) do update set role=excluded.role,active=true,is_owner=excluded.is_owner,updated_at=now();
    update app.organization_invitations set status='accepted',accepted_by=p_user_id,accepted_at=now(),updated_at=now() where id=r.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$function$;;
