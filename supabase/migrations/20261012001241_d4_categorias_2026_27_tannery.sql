-- Categorías 2026-27 de Tannery City FC (Presidencia, 11-12/10/2026).
--
-- "Los Mini Baby pasaron a ser Baby Tanner y los Baby Tanner pasaron a ser
-- T6." "T8 se junta con T10." Fecha del cambio: 12/10/2026.
--
-- La categoría es permanente; los niños suben. No se renombra nada: cada niño
-- activo cambia de categoría con command_change_player_category, que cierra su
-- inscripción anterior y abre la nueva (historial completo) y deja el evento
-- PlayerCategoryChanged. Lo autoriza el dueño del club, que queda como actor.
--
-- La mensualidad NO cambia: se cobra por niño (billing_profiles), no por
-- categoría. T6 nace con la cuota y el plan por omisión de Baby Tanner ($550)
-- sólo como referencia para altas nuevas; se ajusta en Club.
--
-- Orden obligatorio: primero Baby Tanner -> T6, después Mini Baby -> Baby
-- Tanner (al revés, los Mini Baby terminarían en T6).
-- Mini Baby y T8 quedan inactivas (no se borran: su historia sigue ahí).
-- Jugadores inactivos o dados de baja no se tocan: al reactivarlos se elige
-- su categoría.
do $$
declare
  v_org uuid;
  v_owner uuid;
  v_t6 uuid; v_baby uuid; v_mini uuid; v_t8 uuid; v_t10 uuid;
  v_hoy constant date := date '2026-10-12';
  r record;
  n_t6 int := 0; n_baby int := 0; n_t10 int := 0;
begin
  select id into v_org from public.organizations where slug = 'tannery-city-fc';
  select user_id into v_owner from public.organization_memberships
   where organization_id = v_org and is_owner and active and role = 'Presidencia';
  if v_org is null or v_owner is null then raise exception 'Club o dueño no encontrado'; end if;

  select id into v_baby from app.categories where organization_id = v_org and code = 'baby_tanner';
  select id into v_mini from app.categories where organization_id = v_org and code = 'mini_baby_tanner';
  select id into v_t8   from app.categories where organization_id = v_org and code = 't8';
  select id into v_t10  from app.categories where organization_id = v_org and code = 't10';
  if v_baby is null or v_mini is null or v_t8 is null or v_t10 is null then raise exception 'Faltan categorías'; end if;

  insert into app.categories(organization_id, code, name, status, sort_order, monthly_fee, monthly_fee_set_at, monthly_fee_set_by_user_id)
  select v_org, 't6', 'T6', 'active', 25, c.monthly_fee, now(), v_owner from app.categories c where c.id = v_baby
  returning id into v_t6;
  insert into app.category_plans(organization_id, category_id, name, monthly_fee, is_default, sort_order, active, created_by_user_id)
  select v_org, v_t6, p.name, p.monthly_fee, true, p.sort_order, true, v_owner
  from app.category_plans p where p.category_id = v_baby and p.is_default and p.active;

  -- El comando exige permiso de Jugadores: actúa el dueño.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  for r in select e.player_id from app.player_enrollments e join app.players p on p.id = e.player_id
           where e.organization_id = v_org and e.status = 'active' and e.category_id = v_baby
             and p.status = 'active' and p.archived_at is null loop
    perform private.command_change_player_category(v_org, r.player_id, v_t6, v_hoy, 'Categorías 2026-27: Baby Tanner pasa a T6');
    n_t6 := n_t6 + 1;
  end loop;
  for r in select e.player_id from app.player_enrollments e join app.players p on p.id = e.player_id
           where e.organization_id = v_org and e.status = 'active' and e.category_id = v_mini
             and p.status = 'active' and p.archived_at is null loop
    perform private.command_change_player_category(v_org, r.player_id, v_baby, v_hoy, 'Categorías 2026-27: Mini Baby pasa a Baby Tanner');
    n_baby := n_baby + 1;
  end loop;
  for r in select e.player_id from app.player_enrollments e join app.players p on p.id = e.player_id
           where e.organization_id = v_org and e.status = 'active' and e.category_id = v_t8
             and p.status = 'active' and p.archived_at is null loop
    perform private.command_change_player_category(v_org, r.player_id, v_t10, v_hoy, 'Categorías 2026-27: T8 se junta con T10');
    n_t10 := n_t10 + 1;
  end loop;

  perform set_config('request.jwt.claims', '', true);

  update app.categories set status = 'inactive', updated_at = now() where id in (v_mini, v_t8);
  update app.category_plans set active = false, updated_at = now() where category_id in (v_mini, v_t8);

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (v_org, 'CategoriesReorganized', 'organization', v_org,
          jsonb_build_object('effectiveDate', v_hoy, 'toT6', n_t6, 'toBabyTanner', n_baby, 'toT10', n_t10,
                             'inactivated', jsonb_build_array('mini_baby_tanner', 't8'),
                             'reason', 'Presidencia: Mini Baby pasa a Baby Tanner, Baby Tanner a T6, T8 se junta con T10'),
          v_owner);
  raise notice 'T6: %, Baby Tanner: %, T10: %', n_t6, n_baby, n_t10;
end $$;
