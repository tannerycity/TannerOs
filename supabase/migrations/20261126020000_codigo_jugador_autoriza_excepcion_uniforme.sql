-- Aclara quién autoriza una excepción de uniforme en el Código del Jugador
-- Tanner (26/11/2026). La v1 decía "salvo una excepción expresamente
-- autorizada" sin decir quién. Asumí Dirección Deportiva, por ser quien ya
-- resuelve logística y uniformes día a día — Presidencia puede corregirlo
-- si no es el cargo correcto.

do $$
declare v_org uuid; v_doc app.consent_documents;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  select * into v_doc from app.consent_documents where organization_id=v_org and code='codigo_jugador';
  if v_doc.id is null or v_doc.body like '%autorizada por Dirección Deportiva%' then return; end if;

  update app.consent_documents set
    version = v_doc.version + 1,
    published_at = now(),
    body = replace(v_doc.body,
      '• No se sustituye por uniformes de otros equipos, salvo una excepción expresamente autorizada.',
      '• No se sustituye por uniformes de otros equipos, salvo una excepción autorizada por Dirección Deportiva.')
  where id = v_doc.id;

  insert into app.consent_document_versions(document_id, version, title, body, required, effective_date, published_at)
  select id, version, title, body, required, effective_date, published_at from app.consent_documents where id = v_doc.id
  on conflict (document_id, version) do nothing;

  insert into app.centro_tanner_changes(organization_id,version_label,title,description,effective_date,status,related_document_code,published_at)
  select v_org, 'v' || version || ' · 26 nov 2026', 'Quién autoriza una excepción de uniforme',
    'Código del Jugador Tanner: se aclara que las excepciones al uniforme oficial las autoriza Dirección Deportiva.',
    current_date, 'published', 'codigo_jugador', now()
  from app.consent_documents where id = v_doc.id;
end $$;
