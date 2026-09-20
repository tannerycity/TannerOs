-- 24 entrenamientos importados quedaron sin category_id. Como el roster se arma
-- filtrando por la categoría de la sesión, al abrirlos la lista salía VACÍA.
-- El título de esas sesiones ya trae la categoría ("Entrenamiento · T10"), y las
-- cuatro que aparecen existen y están activas, así que el relleno es determinista.
-- No se infiere de las asistencias: los niños cambiaron de categoría desde entonces
-- y eso daría una categoría equivocada.
do $$
declare n int; v_faltan int;
begin
  select count(*) into v_faltan
  from app.sessions s
  where s.category_id is null and s.session_type in ('training','academy','evaluation')
    and not exists (
      select 1 from app.categories c
      where c.organization_id=s.organization_id and c.status='active'
        and lower(trim(c.name))=lower(trim(regexp_replace(s.title,'^Entrenamiento\s*·\s*','')))
    );
  if v_faltan>0 then
    raise exception '% sesión(es) sin categoría deducible del título; abortando', v_faltan;
  end if;

  update app.sessions s
     set category_id=c.id, updated_at=now()
    from app.categories c
   where s.category_id is null
     and s.session_type in ('training','academy','evaluation')
     and c.organization_id=s.organization_id and c.status='active'
     and lower(trim(c.name))=lower(trim(regexp_replace(s.title,'^Entrenamiento\s*·\s*','')));
  get diagnostics n = row_count;
  if n<>24 then raise exception 'Se esperaban 24 sesiones y se actualizaron %', n; end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  select distinct s.organization_id,'AttendanceSessionsBackfilled','organization',s.organization_id,
         jsonb_build_object('sessions',n,'source','title','reason','Entrenamientos importados sin categoría: el roster salía vacío'),
         'backfill_categorias'
  from app.sessions s limit 1;
end $$;

-- Candado: el único camino que crea entrenamientos ya exige categoría activa,
-- así que esto solo blinda contra futuras importaciones.
alter table app.sessions
  add constraint sessions_categoria_obligatoria_en_entrenamientos
  check (session_type not in ('training','academy','evaluation') or category_id is not null);;
