
-- Mismo bug latente: wrapper sin SECURITY DEFINER. command_run_billing gatea por admin (es para Presidencia).
alter function public.v2_run_billing(organization_id uuid, billing_period date, as_of date)
  security definer
  set search_path to 'pg_catalog','public','private';
;
