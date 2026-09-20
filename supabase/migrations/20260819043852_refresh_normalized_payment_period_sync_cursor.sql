update public.payments
set legacy_updated_at = now(),
    updated_at = now(),
    server_received_at = now()
where period in ('2026-07','2026-08')
  and deleted = false;;
