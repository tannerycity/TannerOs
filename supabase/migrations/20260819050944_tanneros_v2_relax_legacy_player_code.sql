alter table app.players drop constraint if exists players_organization_id_code_key;
alter table app.players add column if not exists needs_review boolean not null default false;
alter table app.players add column if not exists review_reason text;
create index if not exists idx_app_players_org_code on app.players(organization_id,code);;
