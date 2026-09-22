insert into app.legacy_migration_conflicts(organization_id,domain,legacy_table,legacy_id,conflict_type,payload)
select e.organization_id,'programs','public.summer_enrollments',e.id,'missing_program_reference',
  jsonb_strip_nulls(jsonb_build_object('legacy_course_id',nullif(trim(e.course_id),''),'legacy_course_name',nullif(trim(e.course_name),''),'legacy_status',nullif(trim(e.status),''),'converted_id',nullif(trim(e.converted_id),''),'reason','Enrollment references a legacy course that does not exist; no deterministic name match'))
from public.summer_enrollments e
left join public.summer_courses c on c.organization_id=e.organization_id and c.id=e.course_id
where c.id is null
on conflict (organization_id,legacy_table,legacy_id,conflict_type) where legacy_id is not null do nothing;;
