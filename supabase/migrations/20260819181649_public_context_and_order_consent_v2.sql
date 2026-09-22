alter table app.orders add column if not exists consent jsonb not null default '{}'::jsonb;

create or replace function private.public_registration_context(p_public_key text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public','private'
as $$
declare v_org uuid; v_name text;
begin
  v_org:=private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  select name into v_name from public.organizations where id=v_org and active=true;
  return jsonb_build_object('organizationId',v_org,'organizationName',coalesce(v_name,'Tannery City FC'));
end $$;

create or replace function public.v2_public_context(club_key text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.public_registration_context($1) $$;
revoke all on function public.v2_public_context(text) from public;
grant execute on function public.v2_public_context(text) to anon,authenticated;

create or replace function private.public_create_order_enhanced(
  p_public_key text,p_customer_name text,p_customer_phone text,p_customer_email text,p_items jsonb,p_notes text,p_consent jsonb
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v_result jsonb; v_id uuid;
begin
  if coalesce((p_consent->>'dataAccepted')::boolean,false) is distinct from true then raise exception 'Privacy consent required'; end if;
  if coalesce(length(trim(p_consent->>'privacyNoticeVersion')),0)<4 then raise exception 'Privacy notice version required'; end if;
  v_result:=private.public_create_order(p_public_key,p_customer_name,p_customer_phone,p_customer_email,p_items,p_notes);
  v_id:=(v_result->>'id')::uuid;
  update app.orders set consent=coalesce(p_consent,'{}'::jsonb),updated_at=now() where id=v_id;
  return v_result;
end $$;

create or replace function public.v2_public_order_enhanced(
  club_key text,customer_name text,customer_phone text,customer_email text,items jsonb,notes text,consent jsonb
) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.public_create_order_enhanced($1,$2,$3,$4,$5,$6,$7) $$;
revoke all on function public.v2_public_order_enhanced(text,text,text,text,jsonb,text,jsonb) from public;
grant execute on function public.v2_public_order_enhanced(text,text,text,text,jsonb,text,jsonb) to anon,authenticated;;
