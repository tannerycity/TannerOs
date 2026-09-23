-- Los nombres con los que el club habla de cada condicion. La base guarda
-- 'scholarship_partial'; en Taquilla se lee "Beca parcial". Los tipos que el
-- club usa y que hoy viven en legacy_label (Curtibrother, Hermanos Tanners,
-- Convenio) siguen saliendo de ahi: esta funcion es el respaldo para cuando
-- no hay etiqueta escrita.
create or replace function private.etiqueta_de_beneficio(p_tipo text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case p_tipo
    when 'scholarship_full'    then 'Beca total'
    when 'scholarship_partial' then 'Beca parcial'
    when 'sibling_discount'    then 'Hermanos Tanners'
    when 'sponsor_funded'      then 'Patrocinado'
    when 'agreement'           then 'Convenio'
    when 'special_rate'        then 'Tarifa especial autorizada'
    when 'proration'           then 'Prorrateo'
    when 'vacation_support'    then 'Apoyo de vacaciones'
    else coalesce(nullif(trim(p_tipo),''), 'Beneficio')
  end
$function$;

revoke all on function private.etiqueta_de_beneficio(text) from public, anon, authenticated;
