-- Ficha Tanner: familia completa y línea de tiempo
--
-- PEDIDO DE PRESIDENCIA (06/10/2026), rediseño de la ficha:
--   · "Familia completa": hermanos en el club (los que comparten tutor).
--   · "Línea de tiempo": su historia en el club.
--
-- QUÉ HACE: v2_player_story(organization_id, player_id) devuelve
--   siblings: Tanners que comparten al menos un tutor (nombre, categoría,
--             estado), sin el propio.
--   timeline: eventos del más nuevo al más viejo: ingreso al club, cambios
--             de categoría, evaluaciones, convocatorias, autorización de
--             imagen, baja; y becas/apoyos sólo para quien ve dinero
--             (Cobranza o Contabilidad).
-- Lo ve quien puede ver Jugadores. Sólo lectura.
--
-- REVERSIBLE: drop de la función.

create or replace function private.query_player_story(p_organization_id uuid, p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','public','private'
as $$
declare v_dinero boolean := private.has_any_module_access(p_organization_id, array['billing','accounting'], false);
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then raise exception 'Tanner no encontrado'; end if;
  return jsonb_build_object(
    'siblings', coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'name',trim(coalesce(s.first_name,'')||' '||coalesce(s.last_name,'')),
                                          'category',s.category,'status',s.status) order by s.birth_date nulls last, s.first_name)
        from app.players s
       where s.organization_id=p_organization_id and s.id<>p_player_id and s.archived_at is null
         and exists(select 1 from app.player_guardians a join app.player_guardians b on b.guardian_id=a.guardian_id
                     where a.player_id=p_player_id and b.player_id=s.id)), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(e.j order by e.d desc, e.o) from (
        select coalesce(p.joined_at, p.registered_at::date, p.created_at::date) d, 9 o,
               jsonb_build_object('kind','joined','date',coalesce(p.joined_at, p.registered_at::date, p.created_at::date),'title','Entró al club') j
          from app.players p where p.id=p_player_id
        union all
        select pe.starts_on, 5, jsonb_build_object('kind','category','date',pe.starts_on,'title','Categoría '||coalesce(c.name,'sin nombre'))
          from app.player_enrollments pe left join app.categories c on c.id=pe.category_id
         where pe.organization_id=p_organization_id and pe.player_id=p_player_id and pe.starts_on is not null
        union all
        select ev.evaluated_on, 4, jsonb_build_object('kind','evaluation','date',ev.evaluated_on,'title','Evaluación Perfil Tanner',
               'detail',nullif(trim(concat_ws(' · ',ev.period,ev.evaluator_label)),''))
          from app.player_evaluations ev
         where ev.organization_id=p_organization_id and ev.player_id=p_player_id and ev.archived_at is null and ev.evaluated_on is not null
        union all
        select m.match_date::date, 3, jsonb_build_object('kind','callup','date',m.match_date::date,
               'title','Convocado'||coalesce(' vs '||nullif(m.opponent,''),''),
               'detail',nullif(trim(concat_ws(' · ',m.tournament,m.result)),''))
          from app.match_callups mc join app.matches m on m.id=mc.match_id
         where mc.organization_id=p_organization_id and mc.player_id=p_player_id and mc.selected and m.archived_at is null and m.match_date is not null
        union all
        select p.image_consent_at::date, 6, jsonb_build_object('kind','consent','date',p.image_consent_at::date,'title','La familia autorizó su imagen')
          from app.players p where p.id=p_player_id and p.image_consent and p.image_consent_at is not null
        union all
        select p.withdrawn_at::date, 1, jsonb_build_object('kind','withdrawn','date',p.withdrawn_at::date,'title','Baja del club','detail',p.withdrawal_reason)
          from app.players p where p.id=p_player_id and p.withdrawn_at is not null
        union all
        select b.starts_on, 7, jsonb_build_object('kind','benefit','date',b.starts_on,
               'title',case when b.benefit_type ilike '%beca%' or b.benefit_type ilike '%scholar%' then 'Beca' else 'Apoyo' end
                       ||coalesce(' · '||nullif(b.funding_source_name,''),''))
          from app.player_benefits b
         where v_dinero and b.organization_id=p_organization_id and b.player_id=p_player_id and b.starts_on is not null
      ) e where e.d is not null), '[]'::jsonb)
  );
end $$;

create or replace function public.v2_player_story(organization_id uuid, player_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_player_story(organization_id, player_id) $$;
revoke all on function public.v2_player_story(uuid,uuid) from public, anon;
grant execute on function public.v2_player_story(uuid,uuid) to authenticated;
