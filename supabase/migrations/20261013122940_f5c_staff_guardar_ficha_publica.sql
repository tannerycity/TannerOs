-- f5c: la llamada pública para guardar la ficha del staff. Es plpgsql a
-- propósito: su cuerpo no se valida al crearla, así que puede existir antes
-- que private.save_staff_member (que Presidencia aplica aparte porque quita
-- categorías y pide confirmación). Mientras no exista, responde un error
-- claro que la pantalla de Staff traduce.
create or replace function public.v2_save_staff_member(organization_id uuid, member jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return private.save_staff_member(organization_id, member);
end $$;
revoke all on function public.v2_save_staff_member(uuid, jsonb) from public, anon;
grant execute on function public.v2_save_staff_member(uuid, jsonb) to authenticated;
