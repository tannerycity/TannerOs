-- La validación solo miraba hacia el futuro. Un dedazo hacia atrás (año 0202)
-- pasaba sin problema y rompía los rangos de edad del panel de demografía.
-- Se hace reemplazo dirigido sobre la definición existente para no reescribir a
-- mano una función larga.
do $$
declare r record; v_def text; v_new text; v_n int:=0;
  c_old constant text := 'if p_birth_date is null or p_birth_date>current_date then raise exception ''Valid birth date required''; end if;';
  c_new constant text := 'if p_birth_date is null or p_birth_date>current_date or p_birth_date<current_date-interval ''100 years'' then raise exception ''Valid birth date required''; end if;';
begin
  for r in
    select p.oid, n.nspname||'.'||p.proname as fn, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f' and n.nspname='private'
      and p.proname in ('command_update_player_profile','public_enroll_program','public_enroll_program_enhanced')
  loop
    v_def := r.def;
    if position(c_old in v_def)=0 then continue; end if;
    if position('100 years' in v_def)>0 then continue; end if;
    v_new := replace(v_def, c_old, c_new);
    execute v_new;
    v_n := v_n + 1;
    raise notice 'acotada: %', r.fn;
  end loop;
  if v_n=0 then raise exception 'No se actualizó ninguna función; revisar el patrón'; end if;
end $$;;
