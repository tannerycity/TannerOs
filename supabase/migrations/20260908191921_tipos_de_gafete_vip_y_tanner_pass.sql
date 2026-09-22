-- El club maneja dos pases: VIP y Tanner Pass. Antes solo existía uno implícito.
-- La tabla está vacía en producción, así que el default no reescribe nada.
alter table app.parking_passes
  add column if not exists pass_type text not null default 'tanner';

do $$
begin
  if not exists(select 1 from pg_constraint where conname='parking_passes_pass_type_check') then
    alter table app.parking_passes
      add constraint parking_passes_pass_type_check check (pass_type in ('tanner','vip'));
  end if;
end $$;

create index if not exists ix_parking_passes_tipo
  on app.parking_passes(organization_id, season, pass_type, status);

-- El precio pasa a depender del tipo. La versión sin argumentos se elimina para
-- que las llamadas existentes resuelvan al parámetro con default y no queden
-- ambiguas.
-- PENDIENTE: el precio del VIP lo tiene que definir Presidencia; hoy va igual
-- que el Tanner Pass. Es un solo número en este CASE.
drop function if exists app.parking_pass_price();
create or replace function app.parking_pass_price(p_type text default 'tanner')
returns numeric
language sql immutable
set search_path to 'pg_catalog'
as $function$
  select case lower(coalesce(nullif(btrim(p_type),''),'tanner'))
    when 'vip' then 200::numeric
    else 200::numeric
  end
$function$;;
