create or replace function private.block_legacy_business_write()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public','private'
as $function$
begin
  if current_setting('app.allow_legacy_write',true)='on' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  raise exception 'Legacy data is read-only after TannerOS 2.0 cutover';
end
$function$;

do $block$
declare
  t text;
  tables text[]:=array[
    'players','prospects','scouting','academias','academia_inscripciones','attendance',
    'equipment','evaluations','events','match_stats','matches','orders','packages','payments',
    'player_notes','products','sponsors','assets','summer_courses','summer_enrollments','summer_attendance',
    'gk_packages','gk_sessions','cortes','garantias','qa_results','audit_log'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists legacy_read_only_cutover on public.%I',t);
    execute format('create trigger legacy_read_only_cutover before insert or update or delete on public.%I for each row execute function private.block_legacy_business_write()',t);
  end loop;
end
$block$;

update app.legacy_source_configs
set status='retired',last_checked_at=now(),updated_at=now()
where organization_id='3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8' and source_type='apps_script';

insert into app.business_rule_catalog(rule_key,domain,title,description,source,enforcement,status,test_status,precedence)
select 'CUTOVER-LEGACY-READONLY-001','platform','Legacy operativo queda solo lectura','Después del cutover TannerOS 2.0, las tablas operativas Legacy no aceptan INSERT, UPDATE ni DELETE salvo override administrativo explícito para recuperación controlada.','approved_v2','database','active','tested',100
where not exists(select 1 from app.business_rule_catalog where rule_key='CUTOVER-LEGACY-READONLY-001');;
