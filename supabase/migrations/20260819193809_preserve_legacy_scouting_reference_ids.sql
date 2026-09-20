update app.scouting_reports sr
set metadata = sr.metadata || jsonb_strip_nulls(jsonb_build_object(
  'legacy_source_prospect_id', nullif(trim(ls.source_prospect_id),''),
  'legacy_player_id', nullif(trim(ls.player_id),''),
  'legacy_source_prospect_missing', case when nullif(trim(ls.source_prospect_id),'') is not null and lp.id is null then true else null end
)), updated_at=greatest(sr.updated_at,coalesce(ls.updated_at,sr.updated_at))
from public.scouting ls
left join public.prospects lp on lp.organization_id=ls.organization_id and lp.id=ls.source_prospect_id
where sr.organization_id=ls.organization_id and sr.legacy_id=ls.id;;
