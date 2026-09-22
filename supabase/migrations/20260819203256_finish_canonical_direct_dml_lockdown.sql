revoke insert,update,delete on app.business_rule_catalog,app.charges from authenticated;
grant select on app.business_rule_catalog,app.charges to authenticated;
revoke all on app.legacy_migration_conflicts from authenticated;
grant all on app.legacy_migration_conflicts to service_role;

update app.business_rule_catalog
set metadata=metadata||jsonb_build_object('direct_dml_tables_remaining',0),updated_at=now()
where rule_key='SEC-003';;
