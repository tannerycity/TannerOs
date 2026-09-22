
do $$
declare v_sponsors integer;v_assets integer;
begin
  select count(*) into v_sponsors from app.sponsors
  where (id,legacy_id) in (
    ('322c1fb4-1b32-41b4-ad7f-06831b5dcb1d'::uuid,'qa_sp_a'),
    ('cd80f26c-3237-4808-8c1d-f749184a52b6'::uuid,'qa_sp_b'),
    ('0d6e98f6-c83c-4d49-8f4a-d614209bbf32'::uuid,'qa_sp_c'),
    ('e5a3d3de-9751-4a1e-837e-9eeb482c975b'::uuid,'qa_acq'),
    ('cc186ea4-a472-4c97-a039-7d3afcb0a41e'::uuid,'qa_fi'),
    ('6495dc2f-dfb5-44dc-a008-ac8a2ed27fa8'::uuid,'qa_seg'),
    ('20df7c8b-087f-472e-8eec-82cd0351a0e2'::uuid,'qa_seg2'),
    ('9db1a6b8-0658-42b0-85ac-f1f843c72697'::uuid,'qa_ux2'),
    ('dd2d3fd7-02e9-4561-ab5e-250f7df8c7d7'::uuid,'qa_ux3'),
    ('915f7c7c-ad94-443a-af48-de4de625897d'::uuid,'qa_col'),
    ('1e624ca5-f80c-4cee-8c7b-c6b935eb9cac'::uuid,'qa_col2')
  );
  if v_sponsors<>11 then raise exception 'QA sponsor target mismatch: %',v_sponsors;end if;

  select count(*) into v_assets from app.sponsor_assets
  where id in (
    '26d0ba3e-5936-4e94-bea3-00fb9ae51009'::uuid,
    '09c10885-21e2-4cf3-bd3d-646cea49e0f9'::uuid
  );
  if v_assets<>2 then raise exception 'QA asset target mismatch: %',v_assets;end if;

  delete from app.sponsor_assets
  where id in (
    '26d0ba3e-5936-4e94-bea3-00fb9ae51009'::uuid,
    '09c10885-21e2-4cf3-bd3d-646cea49e0f9'::uuid
  );

  delete from app.sponsors
  where (id,legacy_id) in (
    ('322c1fb4-1b32-41b4-ad7f-06831b5dcb1d'::uuid,'qa_sp_a'),
    ('cd80f26c-3237-4808-8c1d-f749184a52b6'::uuid,'qa_sp_b'),
    ('0d6e98f6-c83c-4d49-8f4a-d614209bbf32'::uuid,'qa_sp_c'),
    ('e5a3d3de-9751-4a1e-837e-9eeb482c975b'::uuid,'qa_acq'),
    ('cc186ea4-a472-4c97-a039-7d3afcb0a41e'::uuid,'qa_fi'),
    ('6495dc2f-dfb5-44dc-a008-ac8a2ed27fa8'::uuid,'qa_seg'),
    ('20df7c8b-087f-472e-8eec-82cd0351a0e2'::uuid,'qa_seg2'),
    ('9db1a6b8-0658-42b0-85ac-f1f843c72697'::uuid,'qa_ux2'),
    ('dd2d3fd7-02e9-4561-ab5e-250f7df8c7d7'::uuid,'qa_ux3'),
    ('915f7c7c-ad94-443a-af48-de4de625897d'::uuid,'qa_col'),
    ('1e624ca5-f80c-4cee-8c7b-c6b935eb9cac'::uuid,'qa_col2')
  );
end $$;;
