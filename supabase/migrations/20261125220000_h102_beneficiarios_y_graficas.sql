-- h102 · Egresos: a quién se le paga, y las gráficas del dinero (25/11/2026).
-- Presidencia: "en los egresos... que podamos escoger a quién se le está
-- pagando... DT Brandon Andrade y lo escogemos... si se dio de alta un nuevo
-- profe, ahí lo podemos dar de alta... que diga otro... agregar nuevo y que
-- sea fácil". Y para las gráficas: a quién se le paga más, deudas e ingresos
-- por categoría (T6, Baby Tanner...) y por tipo (mensualidad, uniforme,
-- inscripción), uniformes y cuándo se le pagó a cada proveedor.
-- Decisiones de Presidencia:
--   - Los profes salen de Staff. Maxi Ponce e Ingrid ya no están: quedan dados
--     de baja (sus pagos se quedan en la historia).
--   - Proveedores: Tremor, Estudio Nueve Uno, Trofeos, TCP - Tannery City Park,
--     Publicidad en internet, Marketing, Activaciones, Impresiones, Balones,
--     Compras por internet y Call Center.
--   - Emmanuel: la renta y el locker son de TCP; las clases que dio van a él.
--   - Zul: un solo "Préstamo". Michel: Call Center con su apartado.
--   - Juan, Martín Velázquez, árbitros y lo demás: "Otro", con su texto.
--
-- Cómo funciona sin romper lo de hoy: el egreso sigue guardando el nombre en
-- supplier_name (Taquilla y Contabilidad no cambian de función). Un disparador
-- liga el nombre con su beneficiario por nombre o por alias ("DT Brandon",
-- "Profe Brandon"...). Si no coincide con nadie, queda como "Otro".

-- 1. Beneficiarios.
create table if not exists app.expense_payees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) between 2 and 120),
  kind text not null check (kind in ('staff', 'proveedor')),
  staff_member_id uuid references app.staff_members(id),
  aliases text[] not null default '{}',
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists expense_payees_nombre_uq on app.expense_payees (organization_id, lower(name));
create unique index if not exists expense_payees_staff_uq on app.expense_payees (organization_id, staff_member_id) where staff_member_id is not null;
alter table app.expense_payees enable row level security;
revoke all on app.expense_payees from anon, authenticated;

alter table app.expenses add column if not exists payee_id uuid references app.expense_payees(id);
create index if not exists expenses_payee_idx on app.expenses (organization_id, payee_id) where payee_id is not null;

-- 2. El egreso se liga solo con su beneficiario (por nombre o alias).
create or replace function private.expense_link_payee() returns trigger
language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
declare v_nombre text := lower(trim(coalesce(new.supplier_name, '')));
begin
  if tg_op = 'UPDATE' and new.supplier_name is distinct from old.supplier_name and new.payee_id is not distinct from old.payee_id then
    new.payee_id := null;
  end if;
  if new.payee_id is not null then
    if nullif(trim(coalesce(new.supplier_name, '')), '') is null then
      select name into new.supplier_name from app.expense_payees where id = new.payee_id and organization_id = new.organization_id;
    end if;
    return new;
  end if;
  if v_nombre = '' then return new; end if;
  select p.id into new.payee_id from app.expense_payees p
   where p.organization_id = new.organization_id
     and (lower(p.name) = v_nombre or v_nombre = any (select lower(a) from unnest(p.aliases) a))
   order by p.active desc, (lower(p.name) = v_nombre) desc limit 1;
  return new;
end $function$;
drop trigger if exists expenses_link_payee on app.expenses;
create trigger expenses_link_payee before insert or update of supplier_name, payee_id on app.expenses
  for each row execute function private.expense_link_payee();

-- 3. La lista para escoger, con lo pagado a cada quien.
create or replace function private.query_expense_payees(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
begin
  if not (private.has_module_access(p_organization_id, 'accounting', false) or private.has_module_access(p_organization_id, 'taquilla', false)) then
    raise exception 'Not authorized';
  end if;
  return jsonb_build_object(
    'payees', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'kind', p.kind, 'active', p.active,
        'staffMemberId', p.staff_member_id, 'aliases', to_jsonb(p.aliases),
        'total', coalesce((select sum(e.amount) from app.expenses e where e.payee_id = p.id and e.voided_at is null and e.status = 'posted'), 0),
        'lastPaidOn', (select max(e.expense_date) from app.expenses e where e.payee_id = p.id and e.voided_at is null and e.status = 'posted'))
      order by p.kind desc, p.active desc, p.name)
      from app.expense_payees p where p.organization_id = p_organization_id), '[]'::jsonb),
    -- Staff activo que todavía no está en la lista: se agrega con un toque.
    'staffSinAlta', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name, 'title', s.title) order by s.full_name)
      from app.staff_members s
      where s.organization_id = p_organization_id and s.active
        and coalesce(s.title, '') in ('Formador', 'Formadores', 'Academia', 'Operaciones', 'Scouting', 'Contabilidad')
        and not exists (select 1 from app.expense_payees p where p.organization_id = p_organization_id and p.staff_member_id = s.id)), '[]'::jsonb));
end $function$;

create or replace function private.command_save_expense_payee(p_organization_id uuid, p_payee_id uuid, p_name text, p_kind text,
  p_staff_member_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
declare v_id uuid := p_payee_id; v_nombre text := trim(coalesce(p_name, '')); v_actor uuid := (select auth.uid());
begin
  if not (private.has_module_access(p_organization_id, 'accounting', true) or private.has_module_access(p_organization_id, 'taquilla', true)) then
    raise exception 'Not authorized';
  end if;
  if p_staff_member_id is not null then
    select full_name into v_nombre from app.staff_members where id = p_staff_member_id and organization_id = p_organization_id;
    if v_nombre is null then raise exception 'Staff member not found'; end if;
  end if;
  if length(v_nombre) < 2 then raise exception 'Payee needs a name'; end if;
  if coalesce(p_kind, '') not in ('staff', 'proveedor') then raise exception 'Invalid payee kind'; end if;
  if exists (select 1 from app.expense_payees where organization_id = p_organization_id and lower(name) = lower(v_nombre) and id is distinct from v_id) then
    raise exception 'Payee already exists';
  end if;
  if v_id is null then
    insert into app.expense_payees (organization_id, name, kind, staff_member_id, active, created_by)
    values (p_organization_id, v_nombre, p_kind, p_staff_member_id, coalesce(p_active, true), v_actor) returning id into v_id;
  else
    update app.expense_payees set name = v_nombre, kind = p_kind, staff_member_id = coalesce(p_staff_member_id, staff_member_id),
      active = coalesce(p_active, active), updated_at = now()
     where id = v_id and organization_id = p_organization_id;
    if not found then raise exception 'Payee not found'; end if;
  end if;
  -- Los egresos que ya traían ese nombre escrito tal cual se ligan solos.
  update app.expenses set payee_id = v_id
   where organization_id = p_organization_id and payee_id is null and lower(trim(supplier_name)) = lower(v_nombre);
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, actor)
  values (p_organization_id, case when p_payee_id is null then 'ExpensePayeeCreated' else 'ExpensePayeeUpdated' end, 'expense_payee', v_id,
    jsonb_build_object('name', v_nombre, 'kind', p_kind, 'active', p_active), v_actor, coalesce(v_actor::text, 'system'));
  return jsonb_build_object('id', v_id, 'name', v_nombre, 'kind', p_kind);
end $function$;

-- 4. Las gráficas del dinero en un periodo.
create or replace function private.query_finance_analytics(p_organization_id uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
declare v_desde date := coalesce(p_desde, '2000-01-01'); v_hasta date := coalesce(p_hasta, current_date);
begin
  if not private.has_module_access(p_organization_id, 'accounting', false) then raise exception 'Not authorized'; end if;
  return (
    with eg as (
      select e.*, p.name payee_name, p.kind payee_kind from app.expenses e left join app.expense_payees p on p.id = e.payee_id
       where e.organization_id = p_organization_id and e.voided_at is null and e.status = 'posted' and e.expense_date between v_desde and v_hasta
    ), pa as (
      select py.*, pl.category player_category,
        case when py.payment_purpose = 'commerce' or py.category in ('Uniforme', 'Pedido Tienda', 'Tienda') then 'Uniformes y tienda'
             when py.payment_purpose = 'program' then 'Cursos y programas'
             when py.payment_purpose = 'registration' or py.category ilike 'inscrip%' then 'Inscripción'
             when py.category ilike 'mensualidad%' then 'Mensualidad'
             when py.category ilike 'academia%' then 'Academias'
             when py.category ilike 'patrocin%' then 'Patrocinio'
             else 'Otros ingresos' end tipo
        from app.payments py left join app.players pl on pl.id = py.player_id
       where py.organization_id = p_organization_id and py.voided_at is null and py.status = 'posted' and py.amount > 0
         and py.payment_date between v_desde and v_hasta
    ), deuda as (
      select cb.balance_due, coalesce(pl.category, 'Sin categoría') player_category,
        case cb.charge_type when 'monthly_fee' then 'Mensualidad' when 'late_fee' then 'Recargos' when 'registration' then 'Inscripción'
             when 'academy_fee' then 'Academias' when 'parking_pass' then 'Estacionamiento' else 'Otro' end tipo
        from app.charge_balances cb left join app.players pl on pl.id = cb.player_id
       where cb.organization_id = p_organization_id and cb.computed_status in ('pending', 'partial') and cb.balance_due > 0
    )
    select jsonb_build_object(
      'desde', v_desde, 'hasta', v_hasta,
      'ingresos', coalesce((select sum(amount) from pa), 0),
      'egresos', coalesce((select sum(amount) from eg), 0),
      'adeudo', coalesce((select sum(balance_due) from deuda), 0),
      'porBeneficiario', coalesce((select jsonb_agg(x order by (x->>'total')::numeric desc) from (
          select jsonb_build_object('id', payee_id, 'name', coalesce(payee_name, 'Otros (sin asignar)'), 'kind', coalesce(payee_kind, 'otro'),
            'total', sum(amount), 'count', count(*), 'last', max(expense_date)) x
            from eg group by payee_id, payee_name, payee_kind) t), '[]'::jsonb),
      'nominaPorMes', coalesce((select jsonb_agg(jsonb_build_object('name', payee_name, 'mes', mes, 'total', total) order by payee_name, mes) from (
          select payee_name, to_char(date_trunc('month', expense_date), 'YYYY-MM') mes, sum(amount) total from eg where payee_kind = 'staff' group by 1, 2) t), '[]'::jsonb),
      'proveedores', coalesce((select jsonb_agg(jsonb_build_object('name', t.n, 'total', t.total,
            'pagos', (select jsonb_agg(jsonb_build_object('fecha', u.expense_date, 'monto', u.amount, 'concepto', u.concept) order by u.expense_date desc)
                        from (select * from eg e2 where e2.payee_name = t.n order by e2.expense_date desc limit 5) u)) order by t.total desc) from (
          select payee_name n, sum(amount) total from eg where payee_kind = 'proveedor' group by 1) t), '[]'::jsonb),
      'egresosPorCategoria', coalesce((select jsonb_agg(jsonb_build_object('name', category, 'total', total) order by total desc) from (
          select coalesce(category, 'Sin categoría') category, sum(amount) total from eg group by 1) t), '[]'::jsonb),
      'ingresosPorTipo', coalesce((select jsonb_agg(jsonb_build_object('name', tipo, 'total', total) order by total desc) from (
          select tipo, sum(amount) total from pa group by 1) t), '[]'::jsonb),
      'ingresosPorCategoria', coalesce((select jsonb_agg(jsonb_build_object('name', c, 'total', total) order by total desc) from (
          select coalesce(player_category, 'Sin jugador') c, sum(amount) total from pa group by 1) t), '[]'::jsonb),
      'adeudoPorCategoria', coalesce((select jsonb_agg(jsonb_build_object('name', player_category, 'total', total, 'cargos', n) order by total desc) from (
          select player_category, sum(balance_due) total, count(*) n from deuda group by 1) t), '[]'::jsonb),
      'adeudoPorTipo', coalesce((select jsonb_agg(jsonb_build_object('name', tipo, 'total', total, 'cargos', n) order by total desc) from (
          select tipo, sum(balance_due) total, count(*) n from deuda group by 1) t), '[]'::jsonb),
      'uniformes', jsonb_build_object(
        'entro', coalesce((select sum(amount) from pa where tipo = 'Uniformes y tienda'), 0),
        'pagadoProveedor', coalesce((select sum(amount) from eg where payee_name = 'Tremor'), 0))
    ));
end $function$;

create or replace function public.v2_expense_payees(organization_id uuid) returns jsonb
language sql stable security definer set search_path to 'pg_catalog', 'private' as $function$ select private.query_expense_payees(organization_id) $function$;
create or replace function public.v2_save_expense_payee(organization_id uuid, payee_id uuid, name text, kind text, staff_member_id uuid, active boolean) returns jsonb
language sql security definer set search_path to 'pg_catalog', 'private' as $function$
  select private.command_save_expense_payee(organization_id, payee_id, name, kind, staff_member_id, active) $function$;
create or replace function public.v2_finance_analytics(organization_id uuid, desde date, hasta date) returns jsonb
language sql stable security definer set search_path to 'pg_catalog', 'private' as $function$ select private.query_finance_analytics(organization_id, desde, hasta) $function$;
revoke all on function private.expense_link_payee() from public, anon, authenticated;
revoke all on function private.query_expense_payees(uuid) from public, anon, authenticated;
revoke all on function private.command_save_expense_payee(uuid, uuid, text, text, uuid, boolean) from public, anon, authenticated;
revoke all on function private.query_finance_analytics(uuid, date, date) from public, anon, authenticated;
revoke all on function public.v2_expense_payees(uuid) from public, anon;
revoke all on function public.v2_save_expense_payee(uuid, uuid, text, text, uuid, boolean) from public, anon;
revoke all on function public.v2_finance_analytics(uuid, date, date) from public, anon;
grant execute on function public.v2_expense_payees(uuid) to authenticated;
grant execute on function public.v2_save_expense_payee(uuid, uuid, text, text, uuid, boolean) to authenticated;
grant execute on function public.v2_finance_analytics(uuid, date, date) to authenticated;

-- 5. Tannery: la lista y los egresos de antes ligados.
do $$
declare v_org uuid := (select id from public.organizations where slug = 'tannery-city-fc'); v_tcp uuid; v_brandon uuid; r record;
begin
  if v_org is null then return; end if;

  -- Los que ya no están, en Staff pero dados de baja.
  insert into app.staff_members (organization_id, full_name, title, active, show_to_families)
  select v_org, x.n, 'Formador', false, false from (values ('Maxi Ponce'), ('Ingrid')) x(n)
   where not exists (select 1 from app.staff_members s where s.organization_id = v_org and lower(s.full_name) = lower(x.n));

  -- Staff: nombre de Staff y cómo aparece escrito en los egresos.
  for r in select * from (values
      ('Brandon Andrade', array['Brandon', 'DT Brandon', 'Profe Brandon', 'DT Brandon Andrade']),
      ('Checo Martínez', array['DT Checo', 'Profe Checo', 'DT Checo Martinez', 'DT Checo Martínez']),
      ('Christian Villalobos', array['DT Christian', 'DT Cristian', 'Cristian', 'Nómina Christian', 'DT Christian Villalobos', 'DT Christian + 100 extras (para la otra semana)']),
      ('Alexis Campuzano', array['EP Alexis', 'EP Alexis Campuzano', 'Alexis Campuzano', 'EP. Porteros']),
      ('Mafer Terrones', array['DT Mafer']),
      ('Braulio Martínez', array['DT Braulio Martínez']),
      ('Luis Felipe Becerra Matehuela', array[]::text[]),
      ('Maxi Ponce', array['DT Maxi Ponce', 'DT Max Ponce']),
      ('Ingrid', array['DT Ingrid']),
      ('Emmanuel', array['DT Emmanuel', 'Nómina Emmanuel', 'Emmanuel Andrade']),
      ('Zul', array['Zul Navarro'])) t(nombre, alias)
  loop
    insert into app.expense_payees (organization_id, name, kind, staff_member_id, aliases, active)
    select v_org, s.full_name, 'staff', s.id, r.alias, s.active from app.staff_members s
     where s.organization_id = v_org and s.full_name = r.nombre
       and not exists (select 1 from app.expense_payees p where p.organization_id = v_org and p.staff_member_id = s.id)
     order by s.active desc limit 1;
  end loop;

  -- Proveedores.
  insert into app.expense_payees (organization_id, name, kind, aliases)
  select v_org, x.n, 'proveedor', x.a from (values
      ('Tremor', array[]::text[]),
      ('Estudio Nueve Uno', array['Estudio Nueve']),
      ('Trofeos', array['Pizanum Trofeos']),
      ('TCP - Tannery City Park', array['TCP', 'Tienda TCP', 'Emmanuel - TCP']),
      ('Publicidad en internet', array['Meta']),
      ('Marketing', array[]::text[]),
      ('Activaciones', array[]::text[]),
      ('Impresiones', array['Erick Marin', 'Erick Marín']),
      ('Balones', array['Hospital de balones - Gaby']),
      ('Compras por internet', array['Mercadolibre', 'Mercado liBRE', 'Mercado Libre', 'Amazon']),
      ('Call Center', array['Michel'])) x(n, a)
   where not exists (select 1 from app.expense_payees p where p.organization_id = v_org and lower(p.name) = lower(x.n));

  -- Emmanuel de la renta es TCP (las clases sí van a él).
  select id into v_tcp from app.expense_payees where organization_id = v_org and name = 'TCP - Tannery City Park';
  update app.expenses set payee_id = v_tcp
   where organization_id = v_org and payee_id is null and supplier_name = 'Emmanuel' and category in ('Renta cancha', 'Mobiliario');
  -- El pago sin nombre que en el concepto dice "DT Brandon Andrade".
  select id into v_brandon from app.expense_payees where organization_id = v_org and name = 'Brandon Andrade';
  update app.expenses set payee_id = v_brandon, supplier_name = 'DT Brandon Andrade'
   where organization_id = v_org and payee_id is null and supplier_name is null and concept = 'DT Brandon Andrade';

  -- Lo demás por nombre o alias (el disparador hace la cuenta).
  update app.expenses e set payee_id = p.id
    from app.expense_payees p
   where e.organization_id = v_org and e.payee_id is null and p.organization_id = v_org
     and (lower(p.name) = lower(trim(e.supplier_name)) or lower(trim(e.supplier_name)) = any (select lower(a) from unnest(p.aliases) a));

  -- Un solo "Préstamo" y el Call Center con su apartado.
  update app.expenses set category = 'Préstamo', updated_at = now()
   where organization_id = v_org and category in ('Prestamo', 'Préstamo Zul');
  update app.expenses set category = 'Call Center', updated_at = now()
   where organization_id = v_org and payee_id = (select id from app.expense_payees where organization_id = v_org and name = 'Call Center');
end $$;
