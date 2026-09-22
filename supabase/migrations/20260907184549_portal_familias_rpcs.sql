-- Inicio del portal: quién soy y qué hijos tengo, con su saldo.
create or replace function private.portal_home()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians; v jsonb;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  select jsonb_build_object(
    'guardian', jsonb_build_object('name', g.first_name||' '||g.last_name, 'phone', g.phone, 'email', g.email),
    'organization', (select jsonb_build_object('name', o.name) from public.organizations o where o.id = g.organization_id),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pl.id, 'first_name', pl.first_name, 'last_name', pl.last_name,
        'category', pl.category, 'status', pl.status, 'jersey_number', pl.jersey_number,
        'photo_path', pl.photo_path, 'photo_thumb_path', pl.photo_thumb_path, 'photo_bucket', pl.photo_bucket,
        'balance', coalesce((select sum(cb.balance_due) from app.charge_balances cb
                             where cb.player_id = pl.id and cb.balance_due > 0), 0))
        order by pl.first_name)
      from app.players pl
      where pl.id in (select player_id from private.portal_player_ids())), '[]'::jsonb)
  ) into v;
  return v;
end $function$;

-- Estado de cuenta de UN hijo. Deliberadamente más pobre que el de staff: no
-- se expone crédito retenido, ni notas internas, ni nada de otras familias.
create or replace function private.portal_statement(p_player_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v jsonb;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  with movimientos as (
    select coalesce(cb.due_date, cb.billing_period, cb.created_at::date) as fecha, 1 as orden,
           'charge' as tipo, cb.charge_type as subtipo, cb.concept, cb.net_amount as monto,
           cb.balance_due as saldo_cargo, cb.computed_status as estado, cb.billing_period,
           null::text as metodo, cb.id as ref_id
    from app.charge_balances cb where cb.player_id = p_player_id
    union all
    select pm.payment_date, 2, 'payment', pm.payment_purpose, 'Pago recibido', -pm.amount,
           null, pm.status, null::date, pm.method, pm.id
    from app.payments pm
    where pm.player_id = p_player_id and pm.status = 'posted' and pm.payment_purpose = 'billing'
  ), con_saldo as (
    select m.*, sum(m.monto) over (order by m.fecha, m.orden, m.ref_id
                                   rows between unbounded preceding and current row) as saldo_corriente
    from movimientos m
  )
  select jsonb_build_object(
    'player', (select jsonb_build_object('id', pl.id, 'first_name', pl.first_name, 'last_name', pl.last_name,
                 'category', pl.category, 'status', pl.status, 'jersey_number', pl.jersey_number,
                 'photo_path', pl.photo_path, 'photo_thumb_path', pl.photo_thumb_path, 'photo_bucket', pl.photo_bucket,
                 'enrolled_on', (select min(pe.starts_on) from app.player_enrollments pe where pe.player_id = pl.id))
               from app.players pl where pl.id = p_player_id),
    'summary', jsonb_build_object(
      'balance', coalesce((select sum(cb.balance_due) from app.charge_balances cb
                           where cb.player_id = p_player_id and cb.balance_due > 0), 0),
      'credit_available', coalesce((select sum(pb.available_credit) from app.payment_balances pb
                           where pb.player_id = p_player_id), 0),
      'oldest_due', (select min(coalesce(cb.due_date, cb.billing_period)) from app.charge_balances cb
                     where cb.player_id = p_player_id and cb.balance_due > 0),
      'by_type', coalesce((select jsonb_agg(jsonb_build_object('type', t.charge_type, 'pending', t.pendiente)
                                            order by t.pendiente desc)
                   from (select cb.charge_type, sum(cb.balance_due) pendiente from app.charge_balances cb
                         where cb.player_id = p_player_id and cb.balance_due > 0 group by 1) t), '[]'::jsonb)),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object(
        'date', s.fecha, 'kind', s.tipo, 'subtype', s.subtipo, 'concept', s.concept,
        'amount', s.monto, 'charge_balance', s.saldo_cargo, 'status', s.estado,
        'period', s.billing_period, 'method', s.metodo, 'running_balance', s.saldo_corriente)
        order by s.fecha desc, s.orden desc, s.ref_id) from con_saldo s), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'type', d.document_type, 'received', d.received) order by d.document_type)
      from app.player_document_status d where d.player_id = p_player_id), '[]'::jsonb)
  ) into v;
  return v;
end $function$;

-- Calendario: sólo sesiones de las categorías donde están sus hijos.
create or replace function private.portal_calendar(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', coalesce(nullif(s.title,''), initcap(replace(s.session_type,'_',' '))),
      'starts_at', s.starts_at, 'ends_at', s.ends_at, 'location', s.location,
      'type', s.session_type, 'category', c.name)
      order by s.starts_at)
    from app.sessions s
    left join app.categories c on c.id = s.category_id
    where s.organization_id = g.organization_id
      and coalesce(s.status,'') <> 'cancelled'
      and s.starts_at >= p_from and s.starts_at <= p_to
      and (s.category_id is null or s.category_id in (
            select pe.category_id from app.player_enrollments pe
            where pe.player_id in (select player_id from private.portal_player_ids())))
  ), '[]'::jsonb);
end $function$;

-- Catálogo: precio de venta sí, costo del club JAMÁS. products.cost queda
-- fuera del select a propósito, no sólo oculto en la interfaz.
create or replace function private.portal_catalog()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'description', p.description,
      'price', p.price, 'type', p.product_type, 'category', p.category,
      'sizes', p.sizes, 'lead_days', p.lead_days)
      order by p.product_type, p.name)
    from app.products p
    where p.organization_id = g.organization_id and p.active and p.archived_at is null
  ), '[]'::jsonb);
end $function$;

create or replace function public.v2_portal_home()
returns jsonb language sql set search_path to 'pg_catalog','private'
as $$ select private.portal_home() $$;
create or replace function public.v2_portal_statement(player_id uuid)
returns jsonb language sql set search_path to 'pg_catalog','private'
as $$ select private.portal_statement(player_id) $$;
create or replace function public.v2_portal_calendar(from_at timestamptz, to_at timestamptz)
returns jsonb language sql set search_path to 'pg_catalog','private'
as $$ select private.portal_calendar(from_at, to_at) $$;
create or replace function public.v2_portal_catalog()
returns jsonb language sql set search_path to 'pg_catalog','private'
as $$ select private.portal_catalog() $$;

do $$
declare f text;
begin
  foreach f in array array['private.portal_home()','private.portal_statement(uuid)',
    'private.portal_calendar(timestamptz,timestamptz)','private.portal_catalog()',
    'public.v2_portal_home()','public.v2_portal_statement(uuid)',
    'public.v2_portal_calendar(timestamptz,timestamptz)','public.v2_portal_catalog()']
  loop execute format('revoke all on function %s from public, anon', f); end loop;
  foreach f in array array['public.v2_portal_home()','public.v2_portal_statement(uuid)',
    'public.v2_portal_calendar(timestamptz,timestamptz)','public.v2_portal_catalog()']
  loop execute format('grant execute on function %s to authenticated', f); end loop;
end $$;;
