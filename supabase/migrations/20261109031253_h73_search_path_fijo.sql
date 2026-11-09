-- h73 · Ruta de búsqueda fija en 7 funciones (09/11/2026)
--
-- Revisión de seguridad (Presidencia: "buenas prácticas de ISTQB en
-- seguridad"). El asesor de Supabase marcó 7 funciones con search_path
-- mutable: quien pudiera crear objetos en otro esquema podría cambiarles a
-- qué apuntan. Se fija la ruta explícita, con los mismos esquemas que ya
-- usaban, sin cambiar lo que hacen.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('private', 'slugify'), ('app', 'policies_search_update'), ('app', 'faqs_search_update'),
                                     ('app', 'consent_documents_snapshot'), ('app', 'parking_pass_price'),
                                     ('private', 'scholarship_modality_meta'), ('private', 'estado_de_imagen'))
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = pg_catalog, public, app, private, extensions', r.fn);
  end loop;
end $$;
