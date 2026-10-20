create policy tanneros_chat_file_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tanneros-private' and private.chat_storage_can_upload(name));
create policy tanneros_chat_file_read on storage.objects for select to authenticated
  using (bucket_id = 'tanneros-private' and private.chat_storage_can_read(name, owner));
