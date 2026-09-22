update public.payments
set period = to_char(date '1899-12-30' + floor(period::numeric)::int, 'YYYY-MM'),
    updated_at = now(),
    server_received_at = now()
where period ~ '^[0-9]{5}(\.[0-9]+)?$';;
