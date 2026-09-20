-- Commerce is command-driven. Browser table writes could bypass backend price/status/readiness rules.
revoke insert, update, delete on app.orders, app.order_items, app.products from authenticated;
grant select on app.orders, app.order_items, app.products to authenticated;

-- Canonical v2 rule catalogue: promote rules already proven by schema/commands and record legacy role-map supersession.
insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata)
values
('PLAYER-003','players','Tenant isolation','Every Tanner belongs to exactly one organization and cross-tenant relations are rejected.','platform_safety',100,'database','active','tested','app.players organization FKs / composite FKs','{}'),
('PLAYER-004','players','Jersey unique inside category','Active jersey numbers may repeat across categories but not inside the same category.','legacy',80,'database','active','tested','ux_players_active_category_jersey','{}'),
('PLAYER-005','players','Prospect conversion duplicate protection','A prospect conversion cannot create a second active Tanner for the same normalized child and a source prospect cannot back more than one active Tanner.','platform_safety',90,'command','active','tested','private.command_convert_prospect_to_player / ux_players_org_source_prospect','{}'),
('PLAYER-006','players','Sequential Tanner code','New canonical player codes continue TannerNNN without silently rewriting historical legacy codes.','legacy',80,'command','active','tested','private.next_player_code','{}'),
('PLAYER-007','players','Guardian reuse by canonical phone','Prospect conversion reuses an active guardian with the same canonical organization phone before creating another guardian.','platform_safety',90,'command','active','tested','private.command_convert_prospect_to_player','{}'),
('ATT-003','attendance','Canonical attendance states','Attendance accepts only present, absent, late or excused.','platform_safety',90,'database','active','tested','attendance_records_status_check','{}'),
('ATT-004','attendance','Authenticated recorder','Session responsible and attendance recorder derive from auth.uid(), never a free-form browser actor.','platform_safety',100,'command','active','tested','private.command_create_attendance_session / private.command_save_attendance','{}'),
('ATT-005','attendance','Session chronology','Session end cannot precede its start.','platform_safety',90,'database','active','tested','sessions_check','{}'),
('CAT-001','categories','Relational category membership','Canonical category membership is represented by player_enrollments; player.category is compatibility/display data.','approved_v2',100,'database','active','tested','app.player_enrollments','{}'),
('CAT-002','categories','One active club category','A Tanner can have at most one active canonical club category enrollment at a time.','approved_v2',100,'database','active','tested','ux_player_enrollments_active_player','{}'),
('ACA-004','academies','Enrollment chronology','Academy enrollment end date cannot precede start date.','platform_safety',90,'database','active','tested','academy_enrollments_check','{}'),
('ORDER-006','commerce','Positive item quantity','Every order item quantity must be greater than zero.','platform_safety',100,'database','active','tested','order_items_quantity_check','{}'),
('ORDER-007','commerce','Payment-derived order state','Pending/partial/paid state is derived from posted linked payment amount; normal payments cannot exceed order balance.','approved_v2',100,'command','active','tested','private.command_post_order_payment','{}'),
('ORDER-008','commerce','Commerce writes through commands','Authenticated browsers cannot insert/update/delete order headers, order items or product prices directly.','platform_safety',100,'database','active','tested','table grants + security-definer commands',jsonb_build_object('locked_on','2026-08-19')),
('GK-005','goalkeeper','Positive session duration','Goalkeeper session duration must be greater than zero and no more than 12 hours.','platform_safety',90,'database','active','tested','goalkeeper_sessions_hours_check','{}'),
('GK-006','goalkeeper','Package chronology and capacity','A goalkeeper package has positive capacity and cannot expire before purchase.','platform_safety',90,'database','active','tested','goalkeeper_packages constraints','{}'),
('PROS-005','prospects','Canonical funnel states','Prospect lifecycle is constrained to the canonical v2 funnel statuses.','approved_v2',100,'database','active','tested','prospects_status_check','{}'),
('PROS-006','prospects','Scouting references are tenant-safe','A scouting report may point to a prospect or Tanner only inside the same organization.','platform_safety',100,'database','active','tested','scouting composite FKs','{}'),
('PRIV-001','privacy','Controlled prospect photo path','Anonymous prospect photo upload is limited to organization/prospect profile image paths, allowed image extensions and a short post-registration window.','approved_v2',100,'workflow','active','tested','private.public_prospect_photo_upload_allowed / private.public_attach_prospect_photo','{}'),
('SEC-002','security','Explicit v2 role-module matrix','Authorization follows the SaaS Foundation role/module matrix rather than legacy static entity WRITE_ROLES.','approved_v2',100,'database','active','tested','20260819014403 saas_foundation_multi_tenant',jsonb_build_object('supersedes','SEC-LEGACY-001')),
('SEC-LEGACY-001','security','Legacy static WRITE_ROLES','Legacy entity-specific WRITE_ROLES are retained as audit evidence but are not authoritative when they differ from the explicit v2 SaaS role/module matrix.','legacy',80,'pending','superseded','not_applicable','Appscript TannerOS v1 WRITE_ROLES',jsonb_build_object('superseded_by','SEC-002'))
on conflict(rule_key) do update set
  domain=excluded.domain,title=excluded.title,description=excluded.description,source=excluded.source,
  precedence=excluded.precedence,enforcement=excluded.enforcement,status=excluded.status,test_status=excluded.test_status,
  source_ref=excluded.source_ref,metadata=app.business_rule_catalog.metadata||excluded.metadata,updated_at=now();;
