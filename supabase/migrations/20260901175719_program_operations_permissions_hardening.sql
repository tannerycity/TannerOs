
revoke all on function private.public_enroll_program_enhanced(text,text,text,text,text,text,date,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.public_attach_program_photo(text,uuid,text) from public,anon,authenticated;
revoke all on function private.command_create_program_enrollment(uuid,uuid,text,text,text,date,jsonb) from public,anon,authenticated;
revoke all on function private.command_mark_program_attendance(uuid,uuid,date,text,text,text) from public,anon,authenticated;
revoke all on function private.command_post_program_payment(uuid,uuid,numeric,date,text,text,text) from public,anon,authenticated;

revoke all on function public.v2_create_program_enrollment(uuid,uuid,text,text,text,date,jsonb) from public,anon;
revoke all on function public.v2_mark_program_attendance(uuid,uuid,date,text,text,text) from public,anon;
revoke all on function public.v2_post_program_payment(uuid,uuid,numeric,date,text,text,text) from public,anon;
revoke all on function public.v2_program_admin(uuid) from public,anon;

grant execute on function public.v2_create_program_enrollment(uuid,uuid,text,text,text,date,jsonb) to authenticated,service_role;
grant execute on function public.v2_mark_program_attendance(uuid,uuid,date,text,text,text) to authenticated,service_role;
grant execute on function public.v2_post_program_payment(uuid,uuid,numeric,date,text,text,text) to authenticated,service_role;
grant execute on function public.v2_program_admin(uuid) to authenticated,service_role;
;
