alter table app.player_guardians add column if not exists organization_id uuid;
update app.player_guardians pg set organization_id=p.organization_id from app.players p where pg.player_id=p.id and pg.organization_id is null;
alter table app.player_guardians alter column organization_id set not null;

create unique index if not exists uq_app_players_id_org on app.players(id,organization_id);
create unique index if not exists uq_app_guardians_id_org on app.guardians(id,organization_id);
create unique index if not exists uq_app_billing_profiles_id_org on app.billing_profiles(id,organization_id);
create unique index if not exists uq_app_charges_id_org on app.charges(id,organization_id);
create unique index if not exists uq_app_payments_id_org on app.payments(id,organization_id);
create unique index if not exists uq_app_benefits_id_org on app.player_benefits(id,organization_id);

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_player_guardians_player_org') THEN ALTER TABLE app.player_guardians ADD CONSTRAINT fk_player_guardians_player_org FOREIGN KEY (player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE CASCADE; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_player_guardians_guardian_org') THEN ALTER TABLE app.player_guardians ADD CONSTRAINT fk_player_guardians_guardian_org FOREIGN KEY (guardian_id,organization_id) REFERENCES app.guardians(id,organization_id) ON DELETE CASCADE; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_billing_profiles_player_org') THEN ALTER TABLE app.billing_profiles ADD CONSTRAINT fk_billing_profiles_player_org FOREIGN KEY (player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE CASCADE; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_charges_player_org') THEN ALTER TABLE app.charges ADD CONSTRAINT fk_charges_player_org FOREIGN KEY (player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE SET NULL; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_charges_profile_org') THEN ALTER TABLE app.charges ADD CONSTRAINT fk_charges_profile_org FOREIGN KEY (billing_profile_id,organization_id) REFERENCES app.billing_profiles(id,organization_id) ON DELETE SET NULL; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_payments_player_org') THEN ALTER TABLE app.payments ADD CONSTRAINT fk_payments_player_org FOREIGN KEY (player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE SET NULL; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_payments_guardian_org') THEN ALTER TABLE app.payments ADD CONSTRAINT fk_payments_guardian_org FOREIGN KEY (payer_guardian_id,organization_id) REFERENCES app.guardians(id,organization_id) ON DELETE SET NULL; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_allocations_payment_org') THEN ALTER TABLE app.payment_allocations ADD CONSTRAINT fk_allocations_payment_org FOREIGN KEY (payment_id,organization_id) REFERENCES app.payments(id,organization_id) ON DELETE CASCADE; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_allocations_charge_org') THEN ALTER TABLE app.payment_allocations ADD CONSTRAINT fk_allocations_charge_org FOREIGN KEY (charge_id,organization_id) REFERENCES app.charges(id,organization_id) ON DELETE CASCADE; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_benefits_player_org') THEN ALTER TABLE app.player_benefits ADD CONSTRAINT fk_benefits_player_org FOREIGN KEY (player_id,organization_id) REFERENCES app.players(id,organization_id) ON DELETE CASCADE; END IF;
END $$;;
