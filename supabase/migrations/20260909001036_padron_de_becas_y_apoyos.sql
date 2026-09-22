-- Hoy la beca vive escondida en la cuota base: el registro de player_benefits es
-- solo una etiqueta y nadie puede responder "¿de cuánto es y por qué?".
-- Esto expone el apoyo con nombre, monto, fuente, vigencia y motivo.
--
-- Ojo con sponsor_funded: es el ÚNICO tipo que el motor de cobro mira, y mientras
-- no tenga funding_configured_at bloquea la generación del cargo del Tanner. Por eso
-- ese tipo no se crea ni se cambia desde aquí: su alta pasa por Contabilidad, que es
-- donde vive esa autorización.
create or replace function private.query_player_benefits(p_organization_id uuid, p_player_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'type',b.benefit_type,'calculation',b.calculation_type,
    'fixedAmount',b.fixed_amount,'percentage',b.percentage,
    'fundingSource',b.funding_source_name,'sponsorId',b.sponsor_id,'sponsorName',s.name,
    'startsOn',b.starts_on,'endsOn',b.ends_on,'active',b.active,
    'notes',b.notes,'legacyLabel',b.legacy_label,
    'movesMoney',(b.benefit_type='sponsor_funded' and b.funding_configured_at is not null
                  and b.calculation_type in ('fixed_amount','percentage')),
    'blocksBilling',(b.benefit_type='sponsor_funded' and b.active and b.funding_configured_at is null),
    'createdAt',b.created_at
  ) order by b.active desc, b.starts_on desc),'[]'::jsonb) into v
  from app.player_benefits b
  left join app.sponsors s on s.id=b.sponsor_id
  where b.organization_id=p_organization_id and b.player_id=p_player_id;
  return v;
end $function$;
revoke all on function private.query_player_benefits(uuid,uuid) from public, anon, authenticated;

create or replace function public.v2_player_benefits(organization_id uuid, player_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_player_benefits(organization_id,player_id) $function$;
revoke all on function public.v2_player_benefits(uuid,uuid) from public, anon;
grant execute on function public.v2_player_benefits(uuid,uuid) to authenticated;


-- Padrón: todas las becas vivas del club, con la cuota que el Tanner paga hoy.
-- No se calcula "cuánto regala el club" porque no existe una tarifa de lista por
-- categoría contra la cual comparar; inventarla daría un número que nadie podría
-- defender. Se muestra la cuota real y el monto que se haya registrado a mano.
create or replace function private.query_scholarships(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_rows jsonb; v_resumen jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(x order by x->>'category', x->>'player'),'[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'benefitId',b.id,'playerId',p.id,
      'player',trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),
      'code',p.code,'category',p.category,
      'type',b.benefit_type,'calculation',b.calculation_type,
      'fixedAmount',b.fixed_amount,'percentage',b.percentage,
      'monthlyFee',bp.base_monthly_fee,
      'fundingSource',coalesce(s.name,b.funding_source_name),
      'sponsorId',b.sponsor_id,
      'startsOn',b.starts_on,'endsOn',b.ends_on,
      'notes',b.notes,'legacyLabel',b.legacy_label,
      'documented',(nullif(trim(coalesce(b.notes,'')),'') is not null
                    and b.notes not like 'Imported as legacy context%'),
      'blocksBilling',(b.benefit_type='sponsor_funded' and b.funding_configured_at is null)
    ) x
    from app.player_benefits b
    join app.players p on p.id=b.player_id and p.status='active' and p.archived_at is null
    left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=b.organization_id
    left join app.sponsors s on s.id=b.sponsor_id
    where b.organization_id=p_organization_id and b.active
      and (b.ends_on is null or b.ends_on>=current_date)
  ) t;

  select jsonb_build_object(
    'total',count(*),
    'porTipo',coalesce(jsonb_object_agg(tipo,n) filter (where tipo is not null),'{}'::jsonb),
    'sinDocumentar',sum(case when documentado then 0 else 1 end),
    'bloqueanCobro',sum(case when bloquea then 1 else 0 end)
  ) into v_resumen
  from (
    select r->>'type' tipo, count(*) n,
      bool_and((r->>'documented')::boolean) documentado,
      bool_or((r->>'blocksBilling')::boolean) bloquea
    from jsonb_array_elements(v_rows) r group by 1
  ) g;

  return jsonb_build_object('rows',v_rows,'summary',coalesce(v_resumen,'{}'::jsonb));
end $function$;
revoke all on function private.query_scholarships(uuid) from public, anon, authenticated;

create or replace function public.v2_scholarships(organization_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_scholarships(organization_id) $function$;
revoke all on function public.v2_scholarships(uuid) from public, anon;
grant execute on function public.v2_scholarships(uuid) to authenticated;;
