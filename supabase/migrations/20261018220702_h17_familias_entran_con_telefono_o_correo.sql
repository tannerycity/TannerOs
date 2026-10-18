-- Portal de familias (18/10/2026): "que con el teléfono o con el correo
-- puedan entrar". La cuenta vive con un correo interno (<tel>@familias...,
-- un usuario viejo o su correo real); la familia escribe lo que recuerde.
--
-- v2_public_family_login(identificador, contraseña) devuelve el correo con
-- el que se inicia sesión SOLO si la contraseña es correcta. Si no, null, sin
-- decir si el teléfono o el correo existen: no sirve para averiguar quién es
-- familia del club. Limitado a 20 intentos por hora por dispositivo, y sólo
-- mira cuentas ligadas a un tutor (el staff entra por su lado).
create or replace function private.family_login_lookup(p_identifier text, p_password text)
returns text
language plpgsql volatile security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  v_id text := lower(btrim(coalesce(p_identifier,'')));
  v_tel text;
  v_login text;
begin
  perform private.enforce_public_rate_limit('family_login', 20, interval '1 hour');
  if v_id = '' or coalesce(p_password,'') = '' or length(p_password) > 200 then return null; end if;
  if v_id ~ '^[\d\s()+.-]+$' then v_tel := private.phone10(v_id); end if;

  select u.email into v_login
    from auth.users u
   where u.deleted_at is null
     and u.encrypted_password like '$2%'
     and exists (select 1 from app.guardians g where g.user_id = u.id)
     and u.id in (
       select u2.id from auth.users u2 where position('@' in v_id) > 0 and lower(u2.email) = v_id
       union
       select g.user_id from app.guardians g
        where g.user_id is not null
          and ((position('@' in v_id) > 0 and lower(btrim(g.email)) = v_id)
            or (v_tel is not null and private.phone10(g.phone) = v_tel))
     )
     and u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
   limit 1;
  return v_login;
end $function$;
revoke all on function private.family_login_lookup(text, text) from public, anon, authenticated;

create or replace function public.v2_public_family_login(identificador text, contrasena text)
returns jsonb language sql volatile security definer set search_path to 'pg_catalog','private'
as $$ select jsonb_build_object('login', private.family_login_lookup(identificador, contrasena)) $$;
revoke all on function public.v2_public_family_login(text, text) from public;
grant execute on function public.v2_public_family_login(text, text) to anon, authenticated;
