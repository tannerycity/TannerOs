-- h40 · Editar un acuerdo ya no borra las fotos de evidencia (25/10/2026).
--
-- command_save_sponsor_agreement borraba TODOS los elementos del acuerdo y
-- los volvía a insertar. Las evidencias cuelgan de cada elemento con ON
-- DELETE CASCADE: cada "Guardar acuerdo" se llevaba las fotos que salen en el
-- reporte para la marca, y la fecha en que se entregó cada cosa.
--
-- Ahora cada elemento viaja con su id: si ya era de este acuerdo se actualiza
-- en su lugar (fotos y fecha de entrega intactas); sólo se borra lo que se
-- quitó a propósito en el formulario; lo nuevo se inserta.

create or replace function private.command_save_sponsor_agreement(p_organization_id uuid, p_agreement_id uuid, p_sponsor_id uuid, p_starts_on date, p_ends_on date, p_agreement_value numeric, p_status text, p_notes text, p_benefit text, p_discount_percent numeric, p_beneficiaries text[], p_redemption_instructions text, p_received_items jsonb, p_given_items jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_keep uuid[] := '{}';
  v_direction text;
  v_type text;
  v_description text;
  v_quantity numeric;
  v_unit text;
  v_value numeric;
  v_asset_id uuid;
  v_fulfilled boolean;
  v_sort integer:=0;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  if not exists(
    select 1 from app.sponsors
    where id=p_sponsor_id and organization_id=p_organization_id and archived_at is null
  ) then raise exception 'Sponsor not found'; end if;
  if p_status not in ('draft','active','completed','cancelled') then raise exception 'Invalid agreement status'; end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on<p_starts_on then
    raise exception 'Agreement end cannot precede start';
  end if;
  if p_agreement_value is not null and p_agreement_value<0 then raise exception 'Agreement value cannot be negative'; end if;
  if p_discount_percent is not null and (p_discount_percent<0 or p_discount_percent>100) then
    raise exception 'Discount must be between 0 and 100';
  end if;
  if jsonb_typeof(coalesce(p_received_items,'[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_given_items,'[]'::jsonb))<>'array' then
    raise exception 'Agreement items must be arrays';
  end if;
  if jsonb_array_length(coalesce(p_received_items,'[]'::jsonb))
     + jsonb_array_length(coalesce(p_given_items,'[]'::jsonb)) > 100 then
    raise exception 'Too many agreement items';
  end if;

  if p_agreement_id is null then
    insert into app.sponsor_agreements(
      organization_id,sponsor_id,starts_on,ends_on,monetary_value,status,notes,
      benefit,discount_percent,beneficiaries,redemption_instructions,
      benefits_received,deliverables,created_at,updated_at,metadata
    ) values (
      p_organization_id,p_sponsor_id,p_starts_on,p_ends_on,p_agreement_value,p_status,
      nullif(trim(p_notes),''),nullif(trim(p_benefit),''),p_discount_percent,coalesce(p_beneficiaries,'{}'::text[]),
      nullif(trim(p_redemption_instructions),''),'[]'::jsonb,'[]'::jsonb,now(),now(),'{}'::jsonb
    ) returning id into v_id;
  else
    update app.sponsor_agreements set
      sponsor_id=p_sponsor_id,starts_on=p_starts_on,ends_on=p_ends_on,monetary_value=p_agreement_value,
      status=p_status,notes=nullif(trim(p_notes),''),benefit=nullif(trim(p_benefit),''),
      discount_percent=p_discount_percent,beneficiaries=coalesce(p_beneficiaries,'{}'::text[]),
      redemption_instructions=nullif(trim(p_redemption_instructions),''),updated_at=now()
    where id=p_agreement_id and organization_id=p_organization_id
    returning id into v_id;
    if v_id is null then raise exception 'Agreement not found'; end if;
  end if;

  for v_item in
    select value || jsonb_build_object('_direction','receive') from jsonb_array_elements(coalesce(p_received_items,'[]'::jsonb))
    union all
    select value || jsonb_build_object('_direction','give') from jsonb_array_elements(coalesce(p_given_items,'[]'::jsonb))
  loop
    v_direction:=v_item->>'_direction';
    v_type:=nullif(trim(v_item->>'type'),'');
    v_description:=nullif(trim(v_item->>'description'),'');
    v_quantity:=nullif(trim(v_item->>'quantity'),'')::numeric;
    v_unit:=nullif(trim(v_item->>'unit'),'');
    v_value:=nullif(trim(v_item->>'estimatedValue'),'')::numeric;
    v_asset_id:=nullif(trim(v_item->>'assetId'),'')::uuid;
    v_fulfilled:=coalesce((v_item->>'fulfilled')::boolean,false);
    if v_description is null or length(v_description)<2 then raise exception 'Agreement item description required'; end if;
    if v_direction='receive' and v_type not in ('money','product','service','discount','benefit','other') then
      raise exception 'Invalid received item type';
    end if;
    if v_direction='give' and v_type not in ('advertising','banner','social','jersey','activation','tanner_asset','other') then
      raise exception 'Invalid given item type';
    end if;
    if v_quantity is not null and v_quantity<0 then raise exception 'Item quantity cannot be negative'; end if;
    if v_value is not null and v_value<0 then raise exception 'Item value cannot be negative'; end if;
    if v_asset_id is not null and not exists(
      select 1 from app.sponsor_assets
      where id=v_asset_id and organization_id=p_organization_id and archived_at is null
    ) then raise exception 'Tanner asset not found'; end if;
    if v_asset_id is not null and v_direction<>'give' then raise exception 'Tanner asset can only be given'; end if;
    v_sort:=v_sort+1;
    -- Un id que no es de este acuerdo se ignora: el elemento entra como nuevo.
    v_item_id:=null;
    if nullif(trim(v_item->>'id'),'') ~ '^[0-9a-fA-F-]{36}$' then
      select i.id into v_item_id from app.sponsor_agreement_items i
      where i.id=(v_item->>'id')::uuid and i.agreement_id=v_id and i.organization_id=p_organization_id;
    end if;
    if v_item_id is not null then
      update app.sponsor_agreement_items i set
        direction=v_direction,item_type=v_type,description=v_description,quantity=v_quantity,unit=v_unit,
        estimated_value=v_value,sponsor_asset_id=v_asset_id,
        fulfillment_status=case when v_fulfilled then 'fulfilled' else 'pending' end,
        fulfilled_at=case when not v_fulfilled then null else coalesce(i.fulfilled_at,now()) end,
        sort_order=v_sort,updated_at=now()
      where i.id=v_item_id;
    else
      insert into app.sponsor_agreement_items(
        organization_id,agreement_id,direction,item_type,description,quantity,unit,estimated_value,
        sponsor_asset_id,fulfillment_status,fulfilled_at,sort_order,created_at,updated_at
      ) values (
        p_organization_id,v_id,v_direction,v_type,v_description,v_quantity,v_unit,v_value,v_asset_id,
        case when v_fulfilled then 'fulfilled' else 'pending' end,case when v_fulfilled then now() else null end,
        v_sort,now(),now()
      ) returning id into v_item_id;
    end if;
    v_keep:=v_keep||v_item_id;
  end loop;

  -- Sólo lo que se quitó en el formulario (y con ello, sus fotos).
  delete from app.sponsor_agreement_items
  where organization_id=p_organization_id and agreement_id=v_id and not (id = any(v_keep));

  update app.sponsor_agreements a set
    benefits_received=coalesce((
      select jsonb_agg(i.description order by i.sort_order)
      from app.sponsor_agreement_items i where i.agreement_id=v_id and i.direction='receive'
    ),'[]'::jsonb),
    deliverables=coalesce((
      select jsonb_agg(i.description order by i.sort_order)
      from app.sponsor_agreement_items i where i.agreement_id=v_id and i.direction='give'
    ),'[]'::jsonb),
    updated_at=now()
  where a.id=v_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(
    p_organization_id,case when p_agreement_id is null then 'SponsorAgreementCreated' else 'SponsorAgreementUpdated' end,
    'sponsor_agreement',v_id,jsonb_build_object(
      'sponsorId',p_sponsor_id,'status',p_status,
      'receivedItems',jsonb_array_length(coalesce(p_received_items,'[]'::jsonb)),
      'givenItems',jsonb_array_length(coalesce(p_given_items,'[]'::jsonb))
    ),(select auth.uid()),coalesce((select auth.uid())::text,'system')
  );
  return v_id;
end
$function$;
revoke all on function private.command_save_sponsor_agreement(uuid,uuid,uuid,date,date,numeric,text,text,text,numeric,text[],text,jsonb,jsonb) from public,anon,authenticated;
