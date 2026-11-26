-- Contador simple de firmas para el Código del Jugador Tanner y el Código de
-- las Familias Tanner (26/11/2026). Mich: "solamente lo quiero ver yo" —
-- gated en SQL a is_presidency (no a convivencia_seguimiento, que también
-- incluye Dirección Deportiva). "Hagámoslo simple, no pantallas y pantallas":
-- es un objeto más dentro de v2_convivencia, una sola línea en la pantalla
-- que ya existe. Los papás siguen firmando donde ya firmaban: su Portal de
-- familia (sin cambios ahí, ya los lista solo — ver migración anterior).

create or replace function private.query_convivencia(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_seg boolean; v_code app.staff_code_versions%rowtype; v_doc app.consent_documents%rowtype;
begin
  if not private.convivencia_staff(p_organization_id) then raise exception 'Not authorized'; end if;
  v_seg := private.convivencia_seguimiento(p_organization_id);
  select * into v_code from app.staff_code_versions where organization_id = p_organization_id and code = 'codigo_formador' order by version desc limit 1;
  select * into v_doc from app.consent_documents where organization_id = p_organization_id and code = 'codigo_convivencia' and active;
  return jsonb_build_object(
    'canFollow', v_seg, 'isPresidency', private.is_presidency(p_organization_id),
    'myCode', case when v_code.id is null then null else jsonb_build_object('code', v_code.code, 'version', v_code.version, 'title', v_code.title, 'body', v_code.body,
      'acceptedAt', (select a.accepted_at from app.staff_code_acceptances a where a.organization_id = p_organization_id and a.user_id = v_uid and a.code = v_code.code and a.version = v_code.version)) end,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'stage', c.stage,
        'lastExplained', (select max(e.explained_on) from app.code_explanations e where e.category_id = c.id),
        'families', case when v_seg and v_doc.id is not null then jsonb_build_object(
            'total', (select count(distinct p.id) from app.players p join app.player_enrollments en on en.player_id = p.id and en.category_id = c.id and en.status = 'active'
                       where p.organization_id = p_organization_id and coalesce(p.status, 'active') = 'active'),
            'accepted', (select count(distinct p.id) from app.players p join app.player_enrollments en on en.player_id = p.id and en.category_id = c.id and en.status = 'active'
                          join app.consent_acceptances ca on ca.player_id = p.id and ca.document_id = v_doc.id and ca.document_version = v_doc.version
                          where p.organization_id = p_organization_id and coalesce(p.status, 'active') = 'active')) else null end)
        order by c.sort_order, c.name)
      from app.categories c where c.organization_id = p_organization_id and coalesce(c.status, 'active') = 'active'), '[]'::jsonb),
    'staff', case when v_seg and v_code.id is not null then coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', coalesce(pr.display_name, 'Staff'), 'role', m.role,
        'acceptedAt', (select a.accepted_at from app.staff_code_acceptances a where a.organization_id = p_organization_id and a.user_id = m.user_id and a.code = v_code.code and a.version = v_code.version)) order by pr.display_name)
      from public.organization_memberships m left join public.profiles pr on pr.user_id = m.user_id
      where m.organization_id = p_organization_id and m.active
        and (m.role in ('Formadores', 'Presidencia') or m.user_id in (select private.formation_directors(p_organization_id)))), '[]'::jsonb) else null end,
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'occurredOn', i.occurred_on, 'level', i.level, 'status', i.status, 'escalatedTo', i.escalated_to,
        'category', (select c.name from app.categories c where c.id = i.category_id), 'involvesStaff', i.involves_staff,
        'players', (select coalesce(jsonb_agg(btrim(concat_ws(' ', pl.first_name, pl.last_name))), '[]'::jsonb) from app.players pl where pl.id = any(i.player_ids)),
        'whatHappened', i.what_happened, 'protectiveAction', i.protective_action, 'resolution', i.resolution,
        'reportedBy', (select pr.display_name from public.profiles pr where pr.user_id = i.reported_by), 'mine', i.reported_by = v_uid, 'createdAt', i.created_at,
        'entries', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'at', e.created_at,
            'by', (select pr.display_name from public.profiles pr where pr.user_id = e.author_user_id)) order by e.created_at)
          from app.conduct_incident_entries e where e.incident_id = i.id), '[]'::jsonb))
        order by (i.status = 'resuelto'), case i.level when 'urgente' then 0 when 'grave' then 1 when 'reincidencia' then 2 else 3 end, i.created_at desc)
      from app.conduct_incidents i where i.organization_id = p_organization_id and (v_seg or i.reported_by = v_uid)), '[]'::jsonb),
    'codesAcceptance', case when private.is_presidency(p_organization_id) then jsonb_build_object(
        'total', (select count(distinct p.id) from app.players p where p.organization_id = p_organization_id and coalesce(p.status, 'active') = 'active'),
        'jugador', (select count(distinct ca.player_id) from app.consent_acceptances ca
                     join app.consent_documents d on d.id = ca.document_id and d.organization_id = p_organization_id and d.code = 'codigo_jugador' and d.active and ca.document_version = d.version),
        'familias', (select count(distinct ca.player_id) from app.consent_acceptances ca
                      join app.consent_documents d on d.id = ca.document_id and d.organization_id = p_organization_id and d.code = 'codigo_familias' and d.active and ca.document_version = d.version))
      else null end);
end $$;
