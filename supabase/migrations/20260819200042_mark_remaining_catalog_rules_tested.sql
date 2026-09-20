update app.business_rule_catalog
set test_status='tested',updated_at=now(),metadata=metadata||jsonb_build_object('blackbox_verified_on','2026-08-19','rollback_verified',true)
where rule_key in ('ACA-002','ACA-003','EQUIP-002','PROG-003','PROS-004');;
