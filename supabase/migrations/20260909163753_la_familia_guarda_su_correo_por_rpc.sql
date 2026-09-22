-- Mismo defecto que el alta: guardar el correo de contacto tocaba
-- admin.from("guardians"), o sea public.guardians, que no existe.
--
-- Aquí quien llama es el tutor, no Presidencia: el candado es que sólo puede
-- tocar la fila ligada a su propio usuario. Por eso no lleva has_module_access.
create or replace function private.command_save_my_contact_email(p_email text)
returns jsonb
language plpgsql volatile security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_n int; v_email text := lower(trim(p_email));
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Escribe un correo válido';
  end if;
  update app.guardians set email=v_email, updated_at=now()
   where user_id=(select auth.uid());
  get diagnostics v_n = row_count;
  if v_n=0 then raise exception 'Not authorized'; end if;
  return jsonb_build_object('ok',true,'email',v_email);
end $function$;
revoke all on function private.command_save_my_contact_email(text) from public, anon, authenticated;

create or replace function public.v2_save_my_contact_email(email text)
returns jsonb language sql volatile security definer set search_path to 'pg_catalog','private'
as $$ select private.command_save_my_contact_email(email) $$;
revoke all on function public.v2_save_my_contact_email(text) from public, anon;
grant execute on function public.v2_save_my_contact_email(text) to authenticated;
;
