-- h88 · Límite de intentos en las 7 funciones públicas que no lo tenían
--
-- Auditoría del 11/11/2026: de las funciones que cualquiera puede llamar sin
-- sesión (v2_public_*), siete no pasaban por private.enforce_public_rate_limit.
-- Un robot podía:
--   - llenar Candidatos de solicitudes falsas (v2_public_apply_staff),
--   - reescribir la foto o el CV de un registro adivinando su id
--     (v2_public_attach_*; el id es un uuid, pero sin tope se puede insistir),
--   - probar ligas de confirmación de pedido sin freno
--     (v2_public_order_to_confirm / v2_public_confirm_order, h87).
--
-- Qué cambia: sólo el envoltorio público. Antes de llamar a private.* cuenta el
-- intento con la misma función que ya usan registro, tienda, visorías y becas.
-- Misma firma, mismo resultado, mismos permisos (create or replace los conserva).
-- v2_public_order_to_confirm deja de ser STABLE porque ahora anota el intento.
--
-- Topes (por huella de quien llama, igual que el resto):
--   solicitud de staff ........ 10 por hora
--   adjuntar foto / CV ........ 30 por hora
--   ver pedido por confirmar .. 60 por hora
--   confirmar / pedir cambio .. 20 por hora

create or replace function public.v2_public_apply_staff(club_key text, application jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $$
begin
  perform private.enforce_public_rate_limit('apply_staff', 10, interval '1 hour');
  return private.public_apply_staff(club_key, application);
end $$;

create or replace function public.v2_public_attach_program_photo(club_key text, enrollment_id uuid, photo_path text)
returns boolean language plpgsql security definer set search_path to ''
as $$
begin
  perform private.enforce_public_rate_limit('attach_program_photo', 30, interval '1 hour');
  return private.public_attach_program_photo(club_key, enrollment_id, photo_path);
end $$;

create or replace function public.v2_public_attach_prospect_photo(club_key text, prospect_id uuid, photo_path text, photo_thumb_path text default null)
returns boolean language plpgsql security definer set search_path to ''
as $$
begin
  perform private.enforce_public_rate_limit('attach_prospect_photo', 30, interval '1 hour');
  return private.public_attach_prospect_photo(club_key, prospect_id, photo_path, photo_thumb_path);
end $$;

create or replace function public.v2_public_attach_staff_cv(club_key text, application_id uuid, cv_path text, cv_name text default null)
returns boolean language plpgsql security definer set search_path to ''
as $$
begin
  perform private.enforce_public_rate_limit('attach_staff_cv', 30, interval '1 hour');
  return private.public_attach_staff_cv(club_key, application_id, cv_path, cv_name);
end $$;

create or replace function public.v2_public_attach_staff_photo(club_key text, application_id uuid, photo_path text, photo_thumb_path text default null)
returns boolean language plpgsql security definer set search_path to ''
as $$
begin
  perform private.enforce_public_rate_limit('attach_staff_photo', 30, interval '1 hour');
  return private.public_attach_staff_photo(club_key, application_id, photo_path, photo_thumb_path);
end $$;

create or replace function public.v2_public_order_to_confirm(token text)
returns jsonb language plpgsql volatile security definer set search_path to ''
as $$
begin
  perform private.enforce_public_rate_limit('order_to_confirm', 60, interval '1 hour');
  return private.public_order_to_confirm(token);
end $$;

create or replace function public.v2_public_confirm_order(token text, decision text, nota text default null)
returns jsonb language plpgsql security definer set search_path to ''
as $$
begin
  perform private.enforce_public_rate_limit('confirm_order', 20, interval '1 hour');
  return private.public_confirm_order(token, decision, nota);
end $$;
