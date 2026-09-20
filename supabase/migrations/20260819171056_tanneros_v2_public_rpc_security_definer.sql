create or replace function public.v2_public_register(club_key text, first_name text, last_name text default null, birth_date date default null, phone text default null, email text default null, guardian_name text default null, category_interest text default null, source_campaign text default null, consent jsonb default '{}'::jsonb)
returns uuid
language sql
security definer
set search_path = pg_catalog, private
as 'select private.public_register_prospect($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';

create or replace function public.v2_public_products(club_key text)
returns jsonb
language sql
security definer
set search_path = pg_catalog, private
as 'select private.public_products($1)';

create or replace function public.v2_public_order(club_key text, customer_name text, customer_phone text, customer_email text, items jsonb, notes text default null)
returns jsonb
language sql
security definer
set search_path = pg_catalog, private
as 'select private.public_create_order($1,$2,$3,$4,$5,$6)';

create or replace function public.v2_public_programs(club_key text, program_slug text default null)
returns jsonb
language sql
security definer
set search_path = pg_catalog, private
as 'select private.public_programs($1,$2)';

create or replace function public.v2_public_program_enroll(club_key text, program_slug text, first_name text, last_name text, phone text, email text, birth_date date, consent jsonb)
returns jsonb
language sql
security definer
set search_path = pg_catalog, private
as 'select private.public_enroll_program($1,$2,$3,$4,$5,$6,$7,$8)';

revoke all on function public.v2_public_register(text,text,text,date,text,text,text,text,text,jsonb) from public;
revoke all on function public.v2_public_products(text) from public;
revoke all on function public.v2_public_order(text,text,text,text,jsonb,text) from public;
revoke all on function public.v2_public_programs(text,text) from public;
revoke all on function public.v2_public_program_enroll(text,text,text,text,text,text,date,jsonb) from public;

grant execute on function public.v2_public_register(text,text,text,date,text,text,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.v2_public_products(text) to anon, authenticated;
grant execute on function public.v2_public_order(text,text,text,text,jsonb,text) to anon, authenticated;
grant execute on function public.v2_public_programs(text,text) to anon, authenticated;
grant execute on function public.v2_public_program_enroll(text,text,text,text,text,text,date,jsonb) to anon, authenticated;;
