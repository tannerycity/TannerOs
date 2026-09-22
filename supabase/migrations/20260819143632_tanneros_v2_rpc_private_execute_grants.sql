grant execute on function private.query_my_modules(uuid) to authenticated;
grant execute on function private.query_players(uuid,text) to authenticated;
grant execute on function private.query_collection_snapshot(uuid,date) to authenticated;

comment on function private.query_my_modules(uuid) is 'Private domain query invoked only through authenticated TannerOS v2 RPC wrappers.';
comment on function private.query_players(uuid,text) is 'Private domain query invoked only through authenticated TannerOS v2 RPC wrappers.';
comment on function private.query_collection_snapshot(uuid,date) is 'Private domain query invoked only through authenticated TannerOS v2 RPC wrappers.';;
