create unique index if not exists ux_players_active_category_jersey
on app.players(organization_id, lower(trim(category)), trim(jersey_number))
where archived_at is null
  and status='active'
  and nullif(trim(category),'') is not null
  and nullif(trim(jersey_number),'') is not null;

comment on index app.ux_players_active_category_jersey is
'Legacy TannerOS rule: active jersey number may repeat across categories, but not within the same category.';;
