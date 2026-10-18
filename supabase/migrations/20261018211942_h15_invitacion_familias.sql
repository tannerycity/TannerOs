-- Portal de familias, fase 1: entrar sin depender de que el staff dicte una
-- contraseña (18/10/2026). "Quiero que la gente ya empiece a meterse."
-- Medido hoy: 72 tutores, 2 con cuenta, 0 entraron en 30 días; 71 tienen
-- teléfono y sólo 8 correo.
--
-- El club manda por WhatsApp una liga personal (/familias/#i=<token>). La
-- familia abre, ve "eres tutora de Gianluca (T10)", crea su contraseña y
-- entra. Su usuario es su teléfono. La misma liga sirve para recuperar la
-- contraseña de quien ya tiene cuenta. El token sólo se guarda como hash,
-- vence en 14 días y sirve una vez.
create table if not exists app.family_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  guardian_id uuid not null references app.guardians(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('invite', 'reset')),
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists family_invites_guardian on app.family_invites (guardian_id, created_at desc);
alter table app.family_invites enable row level security;
revoke all on app.family_invites from anon, authenticated;

-- 10 dígitos de México: "+52 477 123 4567" -> "4771234567". Sin 10 dígitos, null.
create or replace function private.phone10(p text)
returns text language sql immutable set search_path to '' as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 10
              then right(regexp_replace(p, '\D', '', 'g'), 10) end
$$;

create or replace function private.family_token_hash(p_token text)
returns text language sql immutable set search_path to 'pg_catalog' as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- Quién invita: Presidencia o quien maneja Usuarios.
create or replace function private.can_invite_families(p_organization_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog', 'private' as $$
  select private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id, 'users', true)
$$;

-- La lista del staff: cada tutor con hijo activo, sus hijos y en qué va.
create or replace function public.v2_family_portal_overview(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private', 'auth' as $$
declare v_org uuid := organization_id;
begin
  if not private.can_invite_families(v_org) then raise exception 'Not authorized'; end if;
  return (
    with tutores as (
      select g.id, trim(concat_ws(' ', g.first_name, g.last_name)) as nombre, g.first_name, private.phone10(g.phone) as tel,
             g.user_id, u.last_sign_in_at, coalesce(u.raw_app_meta_data->>'login_username', u.email) as usuario,
             (select jsonb_agg(jsonb_build_object('nombre', trim(concat_ws(' ', p.first_name, p.last_name)), 'primerNombre', p.first_name, 'categoria', p.category) order by p.first_name)
                from app.player_guardians pg join app.players p on p.id = pg.player_id
               where pg.guardian_id = g.id and p.status = 'active') as hijos,
             (select max(i.created_at) from app.family_invites i where i.guardian_id = g.id) as invitada,
             (select max(i.used_at) from app.family_invites i where i.guardian_id = g.id) as aceptada
        from app.guardians g left join auth.users u on u.id = g.user_id
       where g.organization_id = v_org and coalesce(g.status, 'active') <> 'inactive')
    select jsonb_build_object(
      'total', count(*),
      'conCuenta', count(*) filter (where user_id is not null),
      'entraron30', count(*) filter (where last_sign_in_at > now() - interval '30 days'),
      'invitadas', count(*) filter (where invitada is not null and user_id is null),
      'tutores', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'nombre', nombre, 'primerNombre', first_name, 'telefono', tel, 'hijos', coalesce(hijos, '[]'::jsonb),
        'tieneCuenta', user_id is not null, 'usuario', case when user_id is not null then usuario end,
        'ultimaEntrada', last_sign_in_at, 'invitada', invitada, 'aceptada', aceptada) order by nombre), '[]'::jsonb))
    from tutores where hijos is not null);
end $$;
revoke all on function public.v2_family_portal_overview(uuid) from public, anon;
grant execute on function public.v2_family_portal_overview(uuid) to authenticated;

-- Crea la liga de un tutor (y anula las anteriores sin usar). El token se
-- devuelve una sola vez; en la base sólo queda su hash.
create or replace function public.v2_family_invite_link(organization_id uuid, guardian_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private', 'auth' as $$
declare v_org uuid := organization_id; g record; v_token text; v_purpose text; v_usuario text;
begin
  if not private.can_invite_families(v_org) then raise exception 'Not authorized'; end if;
  select x.* into g from app.guardians x where x.id = v2_family_invite_link.guardian_id and x.organization_id = v_org;
  if not found then raise exception 'Guardian not found'; end if;
  v_purpose := case when g.user_id is null then 'invite' else 'reset' end;
  if g.user_id is not null then
    select coalesce(u.raw_app_meta_data->>'login_username', u.email) into v_usuario from auth.users u where u.id = g.user_id;
  end if;
  update app.family_invites i set expires_at = now() where i.guardian_id = g.id and i.used_at is null and i.expires_at > now();
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into app.family_invites(organization_id, guardian_id, token_hash, purpose, created_by, expires_at)
  values (v_org, g.id, private.family_token_hash(v_token), v_purpose, (select auth.uid()), now() + interval '14 days');
  return jsonb_build_object('token', v_token, 'purpose', v_purpose, 'telefono', private.phone10(g.phone),
    'usuario', coalesce(v_usuario, private.phone10(g.phone)), 'expira', now() + interval '14 days');
end $$;
revoke all on function public.v2_family_invite_link(uuid, uuid) from public, anon;
grant execute on function public.v2_family_invite_link(uuid, uuid) to authenticated;

-- Lo que ve quien abre la liga, sin sesión: su nombre, sus hijos y el club.
create or replace function public.v2_public_family_invite(token text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private', 'auth' as $$
declare i record; g record; v_usuario text;
begin
  perform private.enforce_public_rate_limit('family_invite', 30, interval '1 hour');
  select x.* into i from app.family_invites x where x.token_hash = private.family_token_hash(token);
  if not found then return jsonb_build_object('valid', false, 'reason', 'invalid'); end if;
  if i.used_at is not null then return jsonb_build_object('valid', false, 'reason', 'used'); end if;
  if i.expires_at <= now() then return jsonb_build_object('valid', false, 'reason', 'expired'); end if;
  select x.* into g from app.guardians x where x.id = i.guardian_id;
  if g.user_id is not null then
    select coalesce(u.raw_app_meta_data->>'login_username', u.email) into v_usuario from auth.users u where u.id = g.user_id;
  end if;
  return jsonb_build_object('valid', true, 'purpose', i.purpose,
    'primerNombre', g.first_name,
    'club', (select o.name from public.organizations o where o.id = i.organization_id),
    'usuario', coalesce(v_usuario, private.phone10(g.phone)),
    'hijos', coalesce((select jsonb_agg(jsonb_build_object('primerNombre', p.first_name, 'categoria', p.category) order by p.first_name)
                         from app.player_guardians pg join app.players p on p.id = pg.player_id
                        where pg.guardian_id = g.id and p.status = 'active'), '[]'::jsonb));
end $$;
revoke all on function public.v2_public_family_invite(text) from public;
grant execute on function public.v2_public_family_invite(text) to anon, authenticated;

-- Sólo la edge function family-access (llave de servicio): resuelve el token
-- y, cuando la cuenta ya existe, la consume. Nunca anon ni authenticated.
create or replace function public.v2_family_invite_resolve(token text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private', 'auth' as $$
declare i record; g record;
begin
  select x.* into i from app.family_invites x where x.token_hash = private.family_token_hash(token)
     and x.used_at is null and x.expires_at > now();
  if not found then return jsonb_build_object('ok', false); end if;
  select x.* into g from app.guardians x where x.id = i.guardian_id;
  return jsonb_build_object('ok', true, 'guardianId', g.id, 'organizationId', g.organization_id,
    'nombre', trim(concat_ws(' ', g.first_name, g.last_name)), 'telefono', private.phone10(g.phone), 'userId', g.user_id,
    'usuario', (select u.raw_app_meta_data->>'login_username' from auth.users u where u.id = g.user_id),
    'correo', (select u.email from auth.users u where u.id = g.user_id));
end $$;
revoke all on function public.v2_family_invite_resolve(text) from public, anon, authenticated;
grant execute on function public.v2_family_invite_resolve(text) to service_role;

create or replace function public.v2_family_invite_consume(token text, user_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $$
declare i record; v_n int;
begin
  select x.* into i from app.family_invites x where x.token_hash = private.family_token_hash(token)
     and x.used_at is null and x.expires_at > now() for update;
  if not found then raise exception 'Invite not valid'; end if;
  update app.guardians g set user_id = v2_family_invite_consume.user_id, updated_at = now()
   where g.id = i.guardian_id and (g.user_id is null or g.user_id = v2_family_invite_consume.user_id);
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Guardian already linked to another account'; end if;
  update app.family_invites set used_at = now() where id = i.id;
  -- Una liga usada anula las demás de ese tutor.
  update app.family_invites set expires_at = now() where guardian_id = i.guardian_id and used_at is null and expires_at > now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.v2_family_invite_consume(text, uuid) from public, anon, authenticated;
grant execute on function public.v2_family_invite_consume(text, uuid) to service_role;
