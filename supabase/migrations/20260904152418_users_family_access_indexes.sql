create index if not exists user_player_access_user_fk_idx
  on app.user_player_access (user_id,organization_id);

create index if not exists user_player_access_player_fk_idx
  on app.user_player_access (player_id,organization_id);

create index if not exists user_player_access_created_by_fk_idx
  on app.user_player_access (created_by_user_id)
  where created_by_user_id is not null;
;
