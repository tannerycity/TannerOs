revoke execute on function public.v2_enroll_academy(uuid,uuid,uuid,date,numeric,text) from public, anon;
grant execute on function public.v2_enroll_academy(uuid,uuid,uuid,date,numeric,text) to authenticated;

revoke execute on function public.v2_order_detail(uuid,uuid) from public, anon;
grant execute on function public.v2_order_detail(uuid,uuid) to authenticated;

revoke execute on function public.v2_orders(uuid,text) from public, anon;
grant execute on function public.v2_orders(uuid,text) to authenticated;

revoke execute on function public.v2_upsert_academy(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text) from public, anon;
grant execute on function public.v2_upsert_academy(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text) to authenticated;

revoke execute on function public.v2_upsert_academy_enhanced(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text,integer) from public, anon;
grant execute on function public.v2_upsert_academy_enhanced(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text,integer) to authenticated;;
