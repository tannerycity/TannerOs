-- Adds a folio (TC-2026-00001 style) to prospects, mirroring the existing order-folio pattern.
alter table app.prospects add column if not exists folio text;

create or replace function private.next_prospect_folio(p_org uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app'
as $function$
declare v_year smallint:=extract(year from current_date)::smallint; v_n integer;
begin
  insert into app.document_counters(organization_id,document_type,year,next_number)
  values(p_org,'prospect',v_year,2)
  on conflict(organization_id,document_type,year)
  do update set next_number=app.document_counters.next_number+1
  returning next_number-1 into v_n;
  return 'TC-'||v_year::text||'-'||lpad(v_n::text,5,'0');
end;
$function$;
;
