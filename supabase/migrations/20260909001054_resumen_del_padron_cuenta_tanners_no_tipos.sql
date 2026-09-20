-- El resumen agrupaba por tipo y luego sumaba los grupos, así que "sin documentar"
-- contaba tipos en lugar de Tanners. Ahora cada conteo sale de las filas.
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
      -- La nota que dejó la importación no cuenta como motivo: la escribió el script.
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
    'sinDocumentar',count(*) filter (where not (r->>'documented')::boolean),
    'bloqueanCobro',count(*) filter (where (r->>'blocksBilling')::boolean),
    'sinMonto',count(*) filter (where r->>'fixedAmount' is null and r->>'percentage' is null),
    'porTipo',(select coalesce(jsonb_object_agg(tipo,n),'{}'::jsonb)
               from (select r2->>'type' tipo, count(*) n
                     from jsonb_array_elements(v_rows) r2 group by 1) g)
  ) into v_resumen
  from jsonb_array_elements(v_rows) r;

  return jsonb_build_object('rows',v_rows,'summary',coalesce(v_resumen,'{}'::jsonb));
end $function$;
revoke all on function private.query_scholarships(uuid) from public, anon, authenticated;;
