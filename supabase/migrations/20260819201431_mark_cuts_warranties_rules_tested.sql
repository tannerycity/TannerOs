update app.business_rule_catalog
set test_status='tested',updated_at=now(),metadata=metadata||jsonb_build_object('blackbox_verified_on','2026-08-19','rollback_verified',true)
where rule_key in ('CUT-001','CUT-002','CUT-003','CUT-004','GAR-001','GAR-002','GAR-003','GAR-004');;
