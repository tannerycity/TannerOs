-- i3 · Portal de becados y aviso mensual (09/10/2026).
--
-- Presidencia: "dónde puedo ver todos los que están becados... un portal de
-- becados para ver todo". Lo ven Presidencia y quien tenga Dirección; nadie
-- más. Y cada mes, un aviso con los becados debajo de 90% y las becas que
-- están por vencer.
--
-- Beca = scholarship_full, scholarship_partial o sponsor_funded (beca que
-- paga un patrocinador). El descuento por hermanos no es beca y no sale.

create or replace function private.puede_ver_becas(p_organization_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog', 'private'
as $$
  select private.is_presidency(p_organization_id)
      or private.has_module_access(p_organization_id, 'direccion', false)
$$;

create or replace function private.query_scholarship_portal(
  p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_corte date;
  v_out jsonb;
begin
  if not private.puede_ver_becas(p_organization_id) then
    raise exception 'Not authorized';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range';
  end if;
  v_corte := least(p_to, v_hoy);

  with becas as (
    select distinct on (b.player_id) b.*
    from app.player_benefits b
    join app.players p on p.id = b.player_id and p.organization_id = b.organization_id
     and p.status = 'active' and p.archived_at is null
    where b.organization_id = p_organization_id
      and b.active
      and (b.benefit_type like 'scholarship%' or b.benefit_type = 'sponsor_funded')
      and (b.ends_on is null or b.ends_on >= v_hoy)
    order by b.player_id, (b.benefit_type = 'scholarship_full') desc, b.starts_on desc
  ),
  insc as (
    select pe.player_id, pe.category_id
    from app.player_enrollments pe
    where pe.organization_id = p_organization_id and pe.status = 'active'
      and pe.player_id in (select player_id from becas)
  ),
  marcas as (
    select i.player_id, s.starts_at, s.starts_at::date as d, ar.status as st
    from insc i
    join app.sessions s on s.organization_id = p_organization_id and s.category_id = i.category_id
     and s.status <> 'cancelled' and s.academy_id is null
     and s.starts_at::date between least(p_from, v_corte - 60) and p_to
    left join app.attendance_records ar on ar.session_id = s.id and ar.player_id = i.player_id
  ),
  asis as (
    select m.player_id,
           count(*) filter (where m.d between p_from and p_to and m.st in ('present','late')) as asistio,
           count(*) filter (where m.d between p_from and p_to and m.st is not null) as marcadas
    from marcas m group by 1
  ),
  ult as (
    select m.player_id, m.starts_at, m.st,
           row_number() over (partition by m.player_id order by m.starts_at desc) as rn
    from marcas m where m.st is not null and m.d between v_corte - 60 and v_corte
  ),
  racha as (
    select u.player_id,
           coalesce(min(u.rn) filter (where u.st in ('present','late')), max(u.rn) + 1) - 1 as seguidas,
           max(u.starts_at) filter (where u.st in ('present','late')) as ultima_vez
    from ult u group by 1
  ),
  tutor as (
    select distinct on (pg.player_id) pg.player_id,
           nullif(trim(g.first_name), '') as nombre,
           nullif(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), '') as tel
    from app.player_guardians pg
    join app.guardians g on g.id = pg.guardian_id and g.organization_id = p_organization_id
    where pg.organization_id = p_organization_id
      and pg.player_id in (select player_id from becas)
      and nullif(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), '') is not null
    order by pg.player_id, pg.is_primary desc, pg.receives_billing desc, pg.created_at
  ),
  filas as (
    select b.player_id, b.id as benefit_id, b.benefit_type, b.calculation_type, b.percentage, b.fixed_amount,
           b.starts_on, b.ends_on, b.notes, b.legacy_label,
           coalesce(sp.name, b.funding_source_name) as fuente,
           pl.first_name, pl.last_name, pl.code, pl.photo_thumb_path, pl.photo_bucket,
           (select c.name from app.player_enrollments pe join app.categories c on c.id = pe.category_id
             where pe.organization_id = p_organization_id and pe.player_id = pl.id and pe.status = 'active'
             order by pe.starts_on desc nulls last limit 1) as categoria,
           bp.base_monthly_fee as cuota,
           a.asistio, a.marcadas, r.seguidas, r.ultima_vez, t.nombre as tutor, t.tel
    from becas b
    join app.players pl on pl.id = b.player_id
    left join app.sponsors sp on sp.id = b.sponsor_id
    left join app.billing_profiles bp on bp.player_id = b.player_id and bp.organization_id = b.organization_id
    left join asis a on a.player_id = b.player_id
    left join racha r on r.player_id = b.player_id
    left join tutor t on t.player_id = b.player_id
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'today', v_hoy, 'goal', 90,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'playerId', f.player_id, 'benefitId', f.benefit_id,
        'name', trim(concat_ws(' ', f.first_name, f.last_name)), 'code', f.code, 'categoryName', f.categoria,
        'thumb', f.photo_thumb_path, 'bucket', coalesce(f.photo_bucket, 'tanneros-private'),
        'type', f.benefit_type, 'calculation', f.calculation_type,
        'percentage', f.percentage, 'fixedAmount', f.fixed_amount, 'monthlyFee', f.cuota,
        'fundingSource', f.fuente, 'startsOn', f.starts_on, 'endsOn', f.ends_on,
        'daysLeft', case when f.ends_on is not null then f.ends_on - v_hoy end,
        'notes', case when f.notes like 'Imported as legacy context%' then null else nullif(trim(f.notes), '') end,
        'legacyLabel', f.legacy_label,
        'attended', coalesce(f.asistio, 0), 'marked', coalesce(f.marcadas, 0),
        'pct', case when coalesce(f.marcadas, 0) > 0 then round(100.0 * f.asistio / f.marcadas, 1) end,
        'streak', coalesce(f.seguidas, 0), 'lastSeen', f.ultima_vez,
        'guardianName', f.tutor, 'phone', f.tel
      ) order by f.categoria nulls last, f.first_name) from filas f), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object(
        'id', br.id, 'playerId', br.player_id,
        'name', trim(concat_ws(' ', pl.first_name, pl.last_name)), 'code', pl.code,
        'guardian', trim(concat_ws(' ', g.first_name, g.last_name)),
        'reason', br.reason, 'requestedAt', br.requested_at
      ) order by br.requested_at)
      from app.benefit_requests br
      join app.players pl on pl.id = br.player_id
      left join app.guardians g on g.id = br.guardian_id
      where br.organization_id = p_organization_id and br.status = 'pending'), '[]'::jsonb)
  ) into v_out;
  return v_out;
end
$$;

create or replace function public.v2_scholarship_portal(organization_id uuid, from_date date, to_date date)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select private.query_scholarship_portal(organization_id, from_date, to_date) $$;

-- Para que la pantalla sepa si mostrarse sin pedir todo el portal.
create or replace function public.v2_can_see_scholarships(organization_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$ select private.puede_ver_becas(organization_id) $$;

revoke all on function public.v2_scholarship_portal(uuid, date, date) from public, anon;
grant execute on function public.v2_scholarship_portal(uuid, date, date) to authenticated;
revoke all on function public.v2_can_see_scholarships(uuid) from public, anon;
grant execute on function public.v2_can_see_scholarships(uuid) to authenticated;
revoke all on function private.query_scholarship_portal(uuid, date, date) from public, anon;
revoke all on function private.puede_ver_becas(uuid) from public, anon;

-- === Aviso mensual ===
-- El día 1 de cada mes: los becados que cerraron el mes anterior debajo de
-- 90% y las becas que vencen en los próximos 30 días. Va a Presidencia y a
-- los roles con Dirección, a la campana y al celular. Si no hay nada que
-- decir, no se manda nada.
create or replace function private.avisa_becas_del_mes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org record;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_ini date := (date_trunc('month', (now() at time zone 'America/Mexico_City')) - interval '1 month')::date;
  v_fin date := (date_trunc('month', (now() at time zone 'America/Mexico_City')) - interval '1 day')::date;
  v_bajos int;
  v_vencen int;
  v_nombres text;
  v_titulo text;
  v_cuerpo text;
  v_rol text;
begin
  for v_org in select distinct b.organization_id as id from app.player_benefits b where b.active loop
    begin
      with becas as (
        select distinct b.player_id from app.player_benefits b
        join app.players p on p.id = b.player_id and p.status = 'active' and p.archived_at is null
        where b.organization_id = v_org.id and b.active
          and (b.benefit_type like 'scholarship%' or b.benefit_type = 'sponsor_funded')
          and (b.ends_on is null or b.ends_on >= v_ini)
      ),
      asis as (
        select pe.player_id,
               count(*) filter (where ar.status in ('present','late')) as asistio,
               count(ar.status) as marcadas
        from becas bc
        join app.player_enrollments pe on pe.player_id = bc.player_id and pe.organization_id = v_org.id and pe.status = 'active'
        join app.sessions s on s.organization_id = v_org.id and s.category_id = pe.category_id
         and s.status <> 'cancelled' and s.academy_id is null and s.starts_at::date between v_ini and v_fin
        left join app.attendance_records ar on ar.session_id = s.id and ar.player_id = pe.player_id
        group by pe.player_id
      ),
      bajos as (
        select a.player_id from asis a where a.marcadas > 0 and 100.0 * a.asistio / a.marcadas < 90
      )
      select (select count(*) from bajos),
             (select string_agg(pl.first_name, ', ' order by pl.first_name) from (select * from bajos limit 4) x
                join app.players pl on pl.id = x.player_id)
        into v_bajos, v_nombres;

      select count(distinct b.player_id) into v_vencen from app.player_benefits b
      join app.players p on p.id = b.player_id and p.status = 'active' and p.archived_at is null
      where b.organization_id = v_org.id and b.active
        and (b.benefit_type like 'scholarship%' or b.benefit_type = 'sponsor_funded')
        and b.ends_on between v_hoy and v_hoy + 30;

      if coalesce(v_bajos, 0) = 0 and coalesce(v_vencen, 0) = 0 then continue; end if;

      v_titulo := 'Becas de ' || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
        'septiembre','octubre','noviembre','diciembre'])[extract(month from v_ini)::int];
      v_cuerpo := concat_ws(' · ',
        case when v_bajos > 0 then v_bajos || case when v_bajos = 1 then ' becado' else ' becados' end
          || ' debajo de 90%' || coalesce(' (' || v_nombres || case when v_bajos > 4 then '…' else '' end || ')', '') end,
        case when v_vencen > 0 then v_vencen || case when v_vencen = 1 then ' beca vence' else ' becas vencen' end
          || ' en 30 días' end);

      for v_rol in
        select 'Presidencia'
        union
        select rp.role from public.role_module_permissions rp
        where rp.organization_id = v_org.id and rp.module_code = 'direccion' and rp.can_read
      loop
        insert into app.announcements(organization_id, title, body, source, source_id, audience_type, audience_value, expires_at)
        values (v_org.id, v_titulo, v_cuerpo, 'scholarship', null, 'role', v_rol, now() + interval '30 days');
        perform private.notify_push(v_org.id, v_titulo, v_cuerpo, 'role', v_rol, '/becas/');
      end loop;
    exception when others then
      -- Un club con datos raros no detiene el aviso de los demás.
      raise warning 'avisa_becas_del_mes %: %', v_org.id, sqlerrm;
    end;
  end loop;
end
$$;

revoke all on function private.avisa_becas_del_mes() from public, anon, authenticated;

-- Día 1 de cada mes, 9:07 de la mañana en CDMX (15:07 UTC).
select cron.schedule('tanneros-becas-mensual', '7 15 1 * *', 'select private.avisa_becas_del_mes();');