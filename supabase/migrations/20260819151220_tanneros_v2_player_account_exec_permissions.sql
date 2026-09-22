grant execute on function private.query_player_account(uuid,uuid) to authenticated, service_role;
grant execute on function private.command_withdraw_player(uuid,uuid,date,text) to authenticated, service_role;
grant execute on function private.command_reactivate_player(uuid,uuid,date) to authenticated, service_role;;
