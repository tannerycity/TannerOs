create or replace function public.gateway_table_columns(p_table text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(c.column_name, c.data_type), '{}'::jsonb)
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_table;
$$;

revoke all on function public.gateway_table_columns(text) from public, anon, authenticated;
grant execute on function public.gateway_table_columns(text) to service_role;;
