alter function app.prorated_monthly_fee(numeric,date,date,text) set search_path = pg_catalog,app;
alter function app.enforce_payment_capacity() set search_path = pg_catalog,app;
alter function app.enforce_refund_capacity() set search_path = pg_catalog,app;
alter function app.month_due_date(date,integer) set search_path = pg_catalog,app;
alter function app.touch_updated_at() set search_path = pg_catalog,app;;
