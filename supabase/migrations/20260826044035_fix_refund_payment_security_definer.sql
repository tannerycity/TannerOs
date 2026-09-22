
-- El wrapper quedó sin SECURITY DEFINER en la migración original → no podía entrar a la función privada.
-- La función privada ya valida billing + motivo por dentro, así que esto es seguro y consistente con las demás v2_.
alter function public.v2_refund_payment(organization_id uuid, payment_id uuid, amount numeric, refund_date date, method text, reference text, reason text, idempotency_key text)
  security definer
  set search_path to 'pg_catalog','public','private';
;
