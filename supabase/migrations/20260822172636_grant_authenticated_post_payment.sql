revoke execute on function private.command_post_payment(uuid, uuid, numeric, date, text, text, text, text, text, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.command_post_payment(uuid, uuid, numeric, date, text, text, text, text, text, text) to authenticated;;
