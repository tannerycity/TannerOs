create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at=now();
  return new;
end $$;

DO $$
declare r record;
begin
  for r in select unnest(array[
    'guardians','players','billing_profiles','charges','payments','expenses','player_benefits','charge_adjustments','refunds',
    'categories','player_enrollments','academies','academy_enrollments','programs','program_enrollments','sessions','attendance_records',
    'products','orders','prospects','scouting_reports','sponsors','sponsor_agreements','equipment_items','files'
  ]) tbl
  loop
    execute format('drop trigger if exists trg_touch_updated_at on app.%I',r.tbl);
    execute format('create trigger trg_touch_updated_at before update on app.%I for each row execute function app.touch_updated_at()',r.tbl);
  end loop;
end $$;

create unique index if not exists uq_app_categories_id_org on app.categories(id,organization_id);
create unique index if not exists uq_app_academies_id_org on app.academies(id,organization_id);
create unique index if not exists uq_app_programs_id_org on app.programs(id,organization_id);
create unique index if not exists uq_app_sessions_id_org on app.sessions(id,organization_id);
create unique index if not exists uq_app_products_id_org on app.products(id,organization_id);
create unique index if not exists uq_app_orders_id_org on app.orders(id,organization_id);
create unique index if not exists uq_app_prospects_id_org on app.prospects(id,organization_id);
create unique index if not exists uq_app_sponsors_id_org on app.sponsors(id,organization_id);
create unique index if not exists uq_app_equipment_id_org on app.equipment_items(id,organization_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_player_enrollments_player_org') THEN
    ALTER TABLE app.player_enrollments ADD CONSTRAINT fk_player_enrollments_player_org FOREIGN KEY(player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_player_enrollments_category_org') THEN
    ALTER TABLE app.player_enrollments ADD CONSTRAINT fk_player_enrollments_category_org FOREIGN KEY(category_id,organization_id) REFERENCES app.categories(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_academy_enrollments_academy_org') THEN
    ALTER TABLE app.academy_enrollments ADD CONSTRAINT fk_academy_enrollments_academy_org FOREIGN KEY(academy_id,organization_id) REFERENCES app.academies(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_academy_enrollments_player_org') THEN
    ALTER TABLE app.academy_enrollments ADD CONSTRAINT fk_academy_enrollments_player_org FOREIGN KEY(player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_program_enrollments_program_org') THEN
    ALTER TABLE app.program_enrollments ADD CONSTRAINT fk_program_enrollments_program_org FOREIGN KEY(program_id,organization_id) REFERENCES app.programs(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_program_enrollments_player_org') THEN
    ALTER TABLE app.program_enrollments ADD CONSTRAINT fk_program_enrollments_player_org FOREIGN KEY(player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_program_enrollments_guardian_org') THEN
    ALTER TABLE app.program_enrollments ADD CONSTRAINT fk_program_enrollments_guardian_org FOREIGN KEY(guardian_id,organization_id) REFERENCES app.guardians(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sessions_category_org') THEN
    ALTER TABLE app.sessions ADD CONSTRAINT fk_sessions_category_org FOREIGN KEY(category_id,organization_id) REFERENCES app.categories(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sessions_academy_org') THEN
    ALTER TABLE app.sessions ADD CONSTRAINT fk_sessions_academy_org FOREIGN KEY(academy_id,organization_id) REFERENCES app.academies(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sessions_program_org') THEN
    ALTER TABLE app.sessions ADD CONSTRAINT fk_sessions_program_org FOREIGN KEY(program_id,organization_id) REFERENCES app.programs(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_attendance_session_org') THEN
    ALTER TABLE app.attendance_records ADD CONSTRAINT fk_attendance_session_org FOREIGN KEY(session_id,organization_id) REFERENCES app.sessions(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_attendance_player_org') THEN
    ALTER TABLE app.attendance_records ADD CONSTRAINT fk_attendance_player_org FOREIGN KEY(player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_orders_player_org') THEN
    ALTER TABLE app.orders ADD CONSTRAINT fk_orders_player_org FOREIGN KEY(player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_orders_guardian_org') THEN
    ALTER TABLE app.orders ADD CONSTRAINT fk_orders_guardian_org FOREIGN KEY(guardian_id,organization_id) REFERENCES app.guardians(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_order_items_order_org') THEN
    ALTER TABLE app.order_items ADD CONSTRAINT fk_order_items_order_org FOREIGN KEY(order_id,organization_id) REFERENCES app.orders(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_order_items_product_org') THEN
    ALTER TABLE app.order_items ADD CONSTRAINT fk_order_items_product_org FOREIGN KEY(product_id,organization_id) REFERENCES app.products(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_prospects_converted_player_org') THEN
    ALTER TABLE app.prospects ADD CONSTRAINT fk_prospects_converted_player_org FOREIGN KEY(converted_player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_scouting_player_org') THEN
    ALTER TABLE app.scouting_reports ADD CONSTRAINT fk_scouting_player_org FOREIGN KEY(player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_scouting_prospect_org') THEN
    ALTER TABLE app.scouting_reports ADD CONSTRAINT fk_scouting_prospect_org FOREIGN KEY(prospect_id,organization_id) REFERENCES app.prospects(id,organization_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_sponsor_agreements_sponsor_org') THEN
    ALTER TABLE app.sponsor_agreements ADD CONSTRAINT fk_sponsor_agreements_sponsor_org FOREIGN KEY(sponsor_id,organization_id) REFERENCES app.sponsors(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_equipment_assignments_item_org') THEN
    ALTER TABLE app.equipment_assignments ADD CONSTRAINT fk_equipment_assignments_item_org FOREIGN KEY(equipment_item_id,organization_id) REFERENCES app.equipment_items(id,organization_id) ON DELETE CASCADE;
  END IF;
END $$;

revoke all on all functions in schema app from anon,authenticated;
grant execute on all functions in schema app to service_role;;
