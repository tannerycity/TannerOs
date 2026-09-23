-- M1 · El plan del club: un precio con nombre, en lugar de una beca inventada
--
-- LO QUE MIDIO LA BASE (23 sep 2026, 63 Tanners activos)
--   Baby Tanner       550 x7    500 x1    400 x10   0 x1
--   Mini Baby Tanner  550 x14   400 x1    0 x1
--   T10               800 x3    550 x1    500 x5    0 x3
--   T12               800 x5    750 x1    500 x3    0 x1
--   T8                800 x1    750 x3    500 x2
--
-- De los 33 que pagan menos que la tarifa de su categoria, 13 no tienen
-- ningun beneficio que lo explique. Los 10 de Baby Tanner que pagan 400 son
-- el caso claro: no son diez becas, es UN plan del club que se cobra diez
-- veces. Hasta hoy el sistema los presentaba como "beneficio de $150", que es
-- una resta que nadie autorizo y que ademas descuadra el reporte de becas.
--
-- LA IDEA, EN UNA LINEA
-- Lo que paga un Tanner sale de una de tres cosas, y el sistema siempre dice
-- de cual: un PLAN del club (precio de lista, con nombre), una BECA
-- autorizada, o un ACUERDO con esa familia. Si no sale de ninguna, lo dice
-- tambien: "sin motivo registrado". Eso es lo que se arregla aqui.
--
-- NO TOCA EL MOTOR DE COBRANZA
-- billing_profiles.base_monthly_fee sigue siendo la unica cifra que cobra.
-- plan_id no la reemplaza: la explica. Por eso se puede revertir poniendo
-- plan_id y fee_note en null sin que cambie un solo peso cobrado.

create table if not exists app.category_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  category_id uuid not null references app.categories(id) on delete cascade,
  name text not null,
  monthly_fee numeric not null,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid,
  constraint category_plans_fee_no_negativa check (monthly_fee >= 0),
  constraint category_plans_nombre_no_vacio check (length(trim(name)) > 0)
);

comment on table app.category_plans is
  'Precios de lista del club por categoria. "Baby Tanner · Un dia · $400" es un plan, no una beca. Explica el monto de billing_profiles; no lo sustituye.';

-- Dos planes con el mismo nombre en la misma categoria serian dos precios
-- para lo mismo, que es justo el descuadre que esto viene a cerrar.
create unique index if not exists category_plans_nombre_unico
  on app.category_plans (category_id, lower(trim(name))) where active;

create unique index if not exists category_plans_un_solo_default
  on app.category_plans (category_id) where is_default and active;

create index if not exists category_plans_por_categoria
  on app.category_plans (organization_id, category_id) where active;

alter table app.category_plans enable row level security;

drop policy if exists v2_category_plans_read on app.category_plans;
create policy v2_category_plans_read on app.category_plans
  for select to authenticated
  using ((select private.has_module_access(organization_id,'players',false))
      or (select private.has_module_access(organization_id,'taquilla',false))
      or (select private.has_module_access(organization_id,'accounting',false)));

drop policy if exists v2_category_plans_insert on app.category_plans;
create policy v2_category_plans_insert on app.category_plans
  for insert to authenticated
  with check ((select private.has_module_access(organization_id,'players',true)));

drop policy if exists v2_category_plans_update on app.category_plans;
create policy v2_category_plans_update on app.category_plans
  for update to authenticated
  using ((select private.has_module_access(organization_id,'players',true)))
  with check ((select private.has_module_access(organization_id,'players',true)));

drop policy if exists v2_category_plans_delete on app.category_plans;
create policy v2_category_plans_delete on app.category_plans
  for delete to authenticated
  using ((select private.has_module_access(organization_id,'players',true)));

grant select on app.category_plans to authenticated;

-- plan_id: de que plan del club sale lo que paga.
-- fee_note: si NO sale de un plan ni de una beca, aqui va lo que se acordo
-- con la familia. Es lo unico de este renglon que ve Taquilla, igual que
-- collection_note en los beneficios: el motivo economico nunca baja a caja.
alter table app.billing_profiles
  add column if not exists plan_id uuid references app.category_plans(id) on delete set null,
  add column if not exists fee_note text;

comment on column app.billing_profiles.plan_id is
  'Plan del club del que sale base_monthly_fee. Nulo = no viene de un plan (beca, acuerdo con la familia, o sin registrar).';
comment on column app.billing_profiles.fee_note is
  'Lo que se acordo con esta familia, en una linea. Visible para Taquilla. El motivo economico va en el beneficio y se queda en Presidencia.';

create index if not exists billing_profiles_por_plan
  on app.billing_profiles (plan_id) where plan_id is not null;

-- SIEMBRA 1 · la tarifa que Presidencia ya capturo en J1 se vuelve el plan
-- base de su categoria. No se inventa ningun precio nuevo.
insert into app.category_plans (organization_id, category_id, name, monthly_fee, is_default, sort_order)
select c.organization_id, c.id, 'Completo', c.monthly_fee, true, 0
from app.categories c
where c.status = 'active' and c.monthly_fee is not null
  and not exists (select 1 from app.category_plans p where p.category_id = c.id and p.active)
on conflict do nothing;

-- SIEMBRA 2 · quien hoy paga exactamente la tarifa de su categoria queda
-- ligado al plan base. Es el unico caso donde el motivo se puede deducir sin
-- preguntarle a nadie: paga la lista completa.
--
-- A proposito NO se les inventa plan a los demas. Los 33 que pagan menos se
-- quedan sin plan y la pantalla los va a marcar, que es el punto: que se vean
-- para poder nombrarlos, no que se escondan detras de una resta.
update app.billing_profiles bp
   set plan_id = p.id, updated_at = now()
  from app.players pl
  join app.player_enrollments pe
    on pe.player_id = pl.id and pe.organization_id = pl.organization_id and pe.status = 'active'
  join app.category_plans p
    on p.category_id = pe.category_id and p.is_default and p.active
 where bp.player_id = pl.id
   and bp.organization_id = pl.organization_id
   and bp.plan_id is null
   and coalesce(bp.is_exempt,false) = false
   and bp.base_monthly_fee = p.monthly_fee
   and pl.status = 'active' and pl.archived_at is null;

do $$
declare v_planes int; v_ligados int; v_sin int;
begin
  select count(*) into v_planes from app.category_plans where active;
  select count(*) into v_ligados from app.billing_profiles where plan_id is not null;
  select count(*) into v_sin
    from app.players pl
    join app.player_enrollments pe on pe.player_id=pl.id and pe.status='active'
    join app.billing_profiles bp on bp.player_id=pl.id and bp.organization_id=pl.organization_id
   where pl.status='active' and pl.archived_at is null and bp.plan_id is null;
  raise notice 'M1 · % planes, % Tanners ligados al plan base, % por clasificar', v_planes, v_ligados, v_sin;
  if v_planes = 0 then raise exception 'M1 no sembro ningun plan'; end if;
end $$;
