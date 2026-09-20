update public.organization_memberships set role='Marketing',updated_at=now() where role='La Quinta Fuerza';
update public.role_module_permissions set role='Marketing',updated_at=now() where role='La Quinta Fuerza';
update migration.legacy_users set role='Marketing',updated_at=now() where role='La Quinta Fuerza';

create or replace function private.legacy_role_to_code(p_role text)
returns text
language sql
immutable
set search_path=''
as $function$
  select case p_role
    when 'Presidencia' then 'president'
    when 'Operaciones' then 'operations'
    when 'Formadores' then 'coach'
    when 'Academia' then 'academy'
    when 'Taquilla' then 'cashier'
    when 'Contabilidad' then 'accounting'
    when 'Marketing' then 'commercial'
    when 'La Quinta Fuerza' then 'commercial'
    when 'Scouting' then 'scouting'
    when 'Tanner' then 'player'
    else null end
$function$;

create or replace function private.role_code_to_legacy(p_role_code text)
returns text
language sql
immutable
set search_path=''
as $function$
  select case p_role_code
    when 'president' then 'Presidencia'
    when 'operations' then 'Operaciones'
    when 'coach' then 'Formadores'
    when 'academy' then 'Academia'
    when 'cashier' then 'Taquilla'
    when 'accounting' then 'Contabilidad'
    when 'commercial' then 'Marketing'
    when 'scouting' then 'Scouting'
    when 'player' then 'Tanner'
    else null end
$function$;;
