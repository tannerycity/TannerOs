-- Portal de familias. Decisión de arquitectura: un tutor NO recibe
-- organization_membership. Todos los RPC de staff exigen membresía vía
-- private.has_module_access, así que un tutor no puede invocarlos aunque
-- adivine el nombre. Su acceso vive sólo en app.guardians.user_id y se
-- resuelve siempre desde auth.uid(), nunca desde un id que mande el cliente.
alter table app.guardians add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists guardians_user_id_key on app.guardians(user_id) where user_id is not null;

comment on column app.guardians.user_id is
  'Cuenta con la que este tutor entra al portal de familias. Sin membresía de organización: el portal es una superficie aparte del staff.';

-- El tutor de la sesión actual. Es la única puerta: si devuelve null, el
-- portal no muestra nada.
create or replace function private.portal_guardian()
returns app.guardians
language sql stable security definer
set search_path to 'pg_catalog','app'
as $$
  select g.* from app.guardians g
  where g.user_id = auth.uid() and coalesce(g.status,'active') <> 'inactive'
  limit 1
$$;

-- Los hijos de ese tutor. Cualquier player_id que llegue del cliente se
-- valida contra esta lista antes de devolver un solo dato.
create or replace function private.portal_player_ids()
returns table(player_id uuid)
language sql stable security definer
set search_path to 'pg_catalog','app'
as $$
  select pg.player_id
  from app.player_guardians pg
  join app.players pl on pl.id = pg.player_id
  where pg.guardian_id = (select id from private.portal_guardian())
    and pl.archived_at is null
$$;

create or replace function private.portal_owns_player(p_player_id uuid)
returns boolean
language sql stable security definer
set search_path to 'pg_catalog','private'
as $$ select exists(select 1 from private.portal_player_ids() where player_id = p_player_id) $$;

revoke all on function private.portal_guardian() from public, anon;
revoke all on function private.portal_player_ids() from public, anon;
revoke all on function private.portal_owns_player(uuid) from public, anon;;
