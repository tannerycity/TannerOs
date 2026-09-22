drop policy if exists tanneros_public_prospect_photo_insert on storage.objects;
create policy tanneros_public_prospect_photo_insert on storage.objects
for insert to anon
with check (
  bucket_id='tanneros-prospect-photos'
  and private.public_prospect_photo_upload_allowed(name)
);;
