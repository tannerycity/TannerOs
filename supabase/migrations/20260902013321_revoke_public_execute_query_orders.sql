-- The DROP+CREATE of private.query_orders reset its ACL to the schema default,
-- which granted EXECUTE to PUBLIC (including anon). The original function had
-- PUBLIC execute explicitly revoked, matching every other private.* function.
-- Restore that: only postgres/authenticated/service_role may call it.
revoke execute on function private.query_orders(uuid, text) from public;
grant execute on function private.query_orders(uuid, text) to postgres, authenticated, service_role;;
