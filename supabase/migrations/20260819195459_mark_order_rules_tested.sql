update app.business_rule_catalog
set test_status='tested',updated_at=now(),metadata=metadata||jsonb_build_object('blackbox_verified_on','2026-08-19','qa_cases',14,'qa_residual_rows',0)
where rule_key in ('ORDER-004','ORDER-005');;
