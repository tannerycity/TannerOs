create unique index if not exists ux_player_enrollments_one_active_per_player
on app.player_enrollments(organization_id,player_id)
where status='active';

comment on index app.ux_player_enrollments_one_active_per_player is
'Canonical v2 rule: one current active club category enrollment per Tanner; historical completed/cancelled enrollments remain preserved.';;
