
-- Mismo bug que v2_refund_payment: el wrapper quedó sin SECURITY DEFINER en la migración original.
-- La función privada ya valida billing + motivo, así que esto es seguro y consistente con las demás v2_.
alter function public.v2_reverse_payment_allocations(organization_id uuid, payment_id uuid, reason text)
  security definer
  set search_path to 'pg_catalog','public','private';
;
