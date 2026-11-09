-- PROPUESTA · PROP-FC-002 decisión 5 · Parches Tanner (09/11/2026)
--
-- NO APLICADA. Requiere autorización de Presidencia para correr en producción.
--
-- Presidencia (09/11/2026): "Los parches que se dan son los de Campeones y la
-- Iniciación; hasta ahorita es lo único." Capitanía e Iniciación v1.1 §9 y §12:
-- el Parche de Iniciación es el primer parche físico oficial; Tanner OS guarda
-- iniciación realizada, fecha, categoría, versión Baby/Tanner, evidencia
-- opcional, parche entregado y fecha de entrega. Un parche dice que el Tanner
-- VIVIÓ una experiencia relevante; no certifica dominio ni es un premio por
-- repetir ejercicios.
--
-- Reglas:
--   · Sin puntos, niveles, rankings ni otorgamiento automático: cada parche lo
--     registra una persona (Dirección Deportiva o Presidencia).
--   · No se compra: no hay relación con la tienda.
--   · Iniciación: una por versión (Baby / Tanner). Campeones: pide el motivo
--     ("Campeones Copa León 2026") y puede repetirse con otro motivo.
--   · Entregado (físico) se marca aparte: se puede registrar hoy y entregar
--     en la ceremonia.
--   · Revocar sólo Presidencia, con motivo; nada se borra.
--   · Familia: ve los parches vigentes de SUS hijos (nombre, fecha, motivo).
--   · Catálogo cerrado: un parche nuevo entra con su propia migración
--     aprobada por Presidencia, no desde la pantalla.

create table if not exists app.patch_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]+$'),
  name text not null check (btrim(name) <> ''),
  description text,
  physical boolean not null default true,
  requires_reason boolean not null default false,
  requires_variant boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists app.patch_awards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  patch_type_id uuid not null references app.patch_types(id) on delete restrict,
  variant text check (variant in ('baby', 'tanner')),
  reason text check (reason is null or (btrim(reason) <> '' and char_length(reason) <= 140)),
  awarded_on date not null,
  category_id uuid references app.categories(id) on delete set null,
  evidence_note text check (evidence_note is null or char_length(evidence_note) <= 300),
  awarded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivered_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  check (revoked_at is null or nullif(btrim(revoke_reason), '') is not null)
);
-- El mismo parche, con la misma versión y el mismo motivo, una sola vez.
create unique index if not exists patch_awards_uno on app.patch_awards(player_id, patch_type_id, coalesce(variant, ''), coalesce(lower(btrim(reason)), ''))
  where revoked_at is null;
create index if not exists patch_awards_por_jugador on app.patch_awards(organization_id, player_id) where revoked_at is null;
alter table app.patch_types enable row level security;
alter table app.patch_awards enable row level security;

insert into app.patch_types(organization_id, code, name, description, physical, requires_reason, requires_variant)
select o.id, x.code, x.name, x.description, true, x.requires_reason, x.requires_variant
  from public.organizations o,
       (values ('iniciacion', 'Parche de Iniciación Tanner', 'Primer símbolo físico de pertenencia: se recibe al vivir la ceremonia de iniciación.', false, true),
               ('campeones', 'Parche de Campeones', 'Se recibe al ser campeón con el equipo del club.', true, false)) as x(code, name, description, requires_reason, requires_variant)
 where o.slug = 'tannery-city-fc'
on conflict (organization_id, code) do nothing;

create or replace function private.can_award_patches(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id, 'formacion_direccion', true)
$$;
revoke all on function private.can_award_patches(uuid) from public, anon, authenticated;

create or replace function private.command_award_patch(p_organization_id uuid, p_player_id uuid, p_code text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_t app.patch_types%rowtype; v_id uuid;
  v_variant text := nullif(p->>'variant', ''); v_reason text := nullif(btrim(p->>'reason'), '');
  v_on date := coalesce(nullif(p->>'awardedOn', '')::date, private.hoy_mx());
  v_cat uuid := nullif(p->>'categoryId', '')::uuid;
begin
  if not private.can_award_patches(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into v_t from app.patch_types where organization_id = p_organization_id and code = p_code and active;
  if v_t.id is null then raise exception 'Ese parche no está en el catálogo oficial'; end if;
  if not exists (select 1 from app.players where id = p_player_id and organization_id = p_organization_id) then raise exception 'Player not found'; end if;
  if v_t.requires_variant and v_variant is null then raise exception 'Di si es la iniciación Baby o Tanner'; end if;
  if not v_t.requires_variant then v_variant := null; end if;
  if v_t.requires_reason and v_reason is null then raise exception 'Di de qué es (por ejemplo: Campeones Copa León 2026)'; end if;
  if v_on > private.hoy_mx() then raise exception 'La fecha no puede ser futura'; end if;
  if v_cat is not null and not exists (select 1 from app.categories where id = v_cat and organization_id = p_organization_id) then raise exception 'Category not found'; end if;
  insert into app.patch_awards(organization_id, player_id, patch_type_id, variant, reason, awarded_on, category_id, evidence_note, awarded_by)
  values (p_organization_id, p_player_id, v_t.id, v_variant, v_reason, v_on, v_cat, nullif(btrim(p->>'note'), ''), v_uid)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then  -- doble toque o ya lo tenía: no se duplica
    select a.id into v_id from app.patch_awards a where a.player_id = p_player_id and a.patch_type_id = v_t.id and a.revoked_at is null
       and coalesce(a.variant, '') = coalesce(v_variant, '') and coalesce(lower(btrim(a.reason)), '') = coalesce(lower(v_reason), '');
    return jsonb_build_object('id', v_id, 'already', true);
  end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PatchAwarded', 'player', p_player_id, jsonb_build_object('awardId', v_id, 'patch', p_code, 'variant', v_variant, 'reason', v_reason), v_uid);
  return jsonb_build_object('id', v_id, 'already', false);
end $$;

create or replace function private.command_mark_patch_delivered(p_organization_id uuid, p_award_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_a app.patch_awards%rowtype;
begin
  if not private.can_award_patches(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into v_a from app.patch_awards where id = p_award_id and organization_id = p_organization_id for update;
  if v_a.id is null then raise exception 'Award not found'; end if;
  if v_a.revoked_at is not null then raise exception 'Ese parche fue revocado'; end if;
  if v_a.delivered_at is null then
    update app.patch_awards set delivered_at = now(), delivered_by = v_uid where id = v_a.id;
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (p_organization_id, 'PatchDelivered', 'player', v_a.player_id, jsonb_build_object('awardId', v_a.id), v_uid);
  end if;
  return jsonb_build_object('id', v_a.id, 'delivered', true);
end $$;

create or replace function private.command_revoke_patch(p_organization_id uuid, p_award_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_a app.patch_awards%rowtype;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia revoca un parche'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Di por qué se revoca'; end if;
  select * into v_a from app.patch_awards where id = p_award_id and organization_id = p_organization_id for update;
  if v_a.id is null then raise exception 'Award not found'; end if;
  if v_a.revoked_at is null then
    update app.patch_awards set revoked_at = now(), revoked_by = v_uid, revoke_reason = btrim(p_reason) where id = v_a.id;
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (p_organization_id, 'PatchRevoked', 'player', v_a.player_id, jsonb_build_object('awardId', v_a.id, 'reason', btrim(p_reason)), v_uid);
  end if;
  return jsonb_build_object('id', v_a.id, 'revoked', true);
end $$;

-- Staff: catálogo + los parches de un jugador (incluye revocados, para la historia).
create or replace function private.query_player_patches(p_organization_id uuid, p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.can_award_patches(p_organization_id) or private.has_module_access(p_organization_id, 'formacion', false)) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'types', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'description', t.description, 'physical', t.physical,
        'requiresReason', t.requires_reason, 'requiresVariant', t.requires_variant) order by t.created_at, t.code)
      from app.patch_types t where t.organization_id = p_organization_id and t.active), '[]'::jsonb),
    'canAward', private.can_award_patches(p_organization_id),
    'canRevoke', private.is_presidency(p_organization_id),
    'awards', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'code', t.code, 'name', t.name, 'variant', a.variant, 'reason', a.reason,
        'awardedOn', a.awarded_on, 'deliveredAt', a.delivered_at, 'revokedAt', a.revoked_at, 'revokeReason', a.revoke_reason,
        'by', (select pr.display_name from public.profiles pr where pr.user_id = a.awarded_by)) order by a.awarded_on, a.created_at)
      from app.patch_awards a join app.patch_types t on t.id = a.patch_type_id
      where a.organization_id = p_organization_id and a.player_id = p_player_id), '[]'::jsonb));
end $$;

revoke all on function private.command_award_patch(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.command_mark_patch_delivered(uuid, uuid) from public, anon, authenticated;
revoke all on function private.command_revoke_patch(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.query_player_patches(uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_award_patch(organization_id uuid, player_id uuid, code text, award jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_award_patch(organization_id, player_id, code, award) $$;
create or replace function public.v2_mark_patch_delivered(organization_id uuid, award_id uuid)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_mark_patch_delivered(organization_id, award_id) $$;
create or replace function public.v2_revoke_patch(organization_id uuid, award_id uuid, reason text)
returns jsonb language sql security definer set search_path = '' as $$ select private.command_revoke_patch(organization_id, award_id, reason) $$;
create or replace function public.v2_player_patches(organization_id uuid, player_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.query_player_patches(organization_id, player_id) $$;

-- Familia: sólo los vigentes de SUS hijos, sin quién lo registró ni revocados.
create or replace function public.v2_portal_patches(player_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.portal_owns_player(v2_portal_patches.player_id) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'variant', a.variant, 'reason', a.reason, 'awardedOn', a.awarded_on) order by a.awarded_on)
    from app.patch_awards a join app.patch_types t on t.id = a.patch_type_id
    where a.player_id = v2_portal_patches.player_id and a.revoked_at is null), '[]'::jsonb);
end $$;

revoke all on function public.v2_award_patch(uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.v2_mark_patch_delivered(uuid, uuid) from public, anon;
revoke all on function public.v2_revoke_patch(uuid, uuid, text) from public, anon;
revoke all on function public.v2_player_patches(uuid, uuid) from public, anon;
revoke all on function public.v2_portal_patches(uuid) from public, anon;
grant execute on function public.v2_award_patch(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.v2_mark_patch_delivered(uuid, uuid) to authenticated;
grant execute on function public.v2_revoke_patch(uuid, uuid, text) to authenticated;
grant execute on function public.v2_player_patches(uuid, uuid) to authenticated;
grant execute on function public.v2_portal_patches(uuid) to authenticated;
