-- c3 · El número del pedido se revisa antes de confirmarlo
--
-- Pedido de Presidencia (09/10/2026, punto D): en el link público el papá
-- escribe el número que quiere y nadie lo valida. Si ese número ya lo trae
-- otro niño de su categoría, se mandaba a producir un jersey repetido.
--
-- Para cada pieza con número, se busca al Tanner del pedido: el que trae el
-- pedido (portal de familias) o, si vino por el link, los Tanners activos del
-- tutor con ese mismo teléfono (últimos 10 dígitos). Con eso se dice:
--   · "es su número en el club"                         (ok)
--   · "su número en el club es otro"                     (atención)
--   · "ese número ya es de otro niño en su categoría"    (mal)
--   · "está libre: se le puede asignar"                  (ok, con Tanner sin número)
--   · "no encontramos al Tanner por el teléfono"         (atención)
-- Sólo lectura: asignar sigue siendo v2_assign_jersey, con su propia validación.
create or replace function private.query_order_number_check(p_organization_id uuid, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o app.orders%rowtype;
  v_tel text;
  v_tanners jsonb;
  v_n int;
  v_avisos jsonb := '[]'::jsonb;
  r record;
  v_num text;
  v_t jsonb;
  v_quien text;
begin
  if not private.has_module_access(p_organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id;
  if not found then raise exception 'Order not found'; end if;

  v_tel := right(regexp_replace(coalesce(v_o.customer_phone, ''), '\D', '', 'g'), 10);
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
           'firstName', split_part(trim(coalesce(p.first_name, '')), ' ', 1),
           'category', p.category, 'jersey', nullif(trim(coalesce(p.jersey_number, '')), ''))
           order by p.first_name), '[]'::jsonb)
    into v_tanners
    from app.players p
   where p.organization_id = p_organization_id and p.archived_at is null and p.status = 'active'
     and (
       (v_o.player_id is not null and p.id = v_o.player_id)
       or (v_o.player_id is null and length(v_tel) = 10 and exists (
             select 1 from app.player_guardians pg join app.guardians g on g.id = pg.guardian_id
              where pg.player_id = p.id and g.organization_id = p_organization_id
                and right(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), 10) = v_tel))
     );
  v_n := jsonb_array_length(v_tanners);

  for r in
    select i.id, nullif(regexp_replace(trim(coalesce(i.attributes->>'numero', i.attributes->>'number', '')), '^0+', ''), '') as num
      from app.order_items i where i.order_id = v_o.id
  loop
    v_num := r.num;
    continue when v_num is null or v_num !~ '^[0-9]{1,3}$';
    if v_n = 1 then
      v_t := v_tanners->0;
      if v_t->>'jersey' = v_num then
        v_avisos := v_avisos || jsonb_build_object('itemId', r.id, 'numero', v_num, 'nivel', 'ok', 'playerId', v_t->>'id',
          'texto', format('#%s es el número de %s en el club.', v_num, v_t->>'firstName'));
      elsif v_t->>'jersey' is not null then
        v_avisos := v_avisos || jsonb_build_object('itemId', r.id, 'numero', v_num, 'nivel', 'atencion', 'playerId', v_t->>'id',
          'texto', format('Pidió el #%s, pero el número de %s en el club es el #%s.', v_num, v_t->>'firstName', v_t->>'jersey'));
      else
        select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) into v_quien
          from app.players p
         where p.organization_id = p_organization_id and p.archived_at is null and p.status = 'active'
           and p.id <> (v_t->>'id')::uuid
           and lower(trim(p.category)) = lower(trim(coalesce(v_t->>'category', '')))
           and trim(p.jersey_number) = v_num
         limit 1;
        if v_quien is not null then
          v_avisos := v_avisos || jsonb_build_object('itemId', r.id, 'numero', v_num, 'nivel', 'mal', 'playerId', v_t->>'id',
            'texto', format('El #%s ya es de %s en %s. Pídele a la familia otro número.', v_num, v_quien, v_t->>'category'));
        else
          v_avisos := v_avisos || jsonb_build_object('itemId', r.id, 'numero', v_num, 'nivel', 'ok', 'playerId', v_t->>'id',
            'asignable', (v_t->>'category') is not null,
            'texto', format('El #%s está libre en %s y %s aún no tiene número.', v_num, coalesce(v_t->>'category', 'su categoría'), v_t->>'firstName'));
        end if;
      end if;
    elsif v_n > 1 then
      select e into v_t from jsonb_array_elements(v_tanners) as x(e) where e->>'jersey' = v_num limit 1;
      if v_t is not null then
        v_avisos := v_avisos || jsonb_build_object('itemId', r.id, 'numero', v_num, 'nivel', 'ok', 'playerId', v_t->>'id',
          'texto', format('#%s es el número de %s en el club.', v_num, v_t->>'firstName'));
      else
        v_avisos := v_avisos || jsonb_build_object('itemId', r.id, 'numero', v_num, 'nivel', 'atencion',
          'texto', format('Esta familia tiene %s Tanners y ninguno trae el #%s: confirma para quién es.', v_n, v_num));
      end if;
      v_t := null;
    else
      v_avisos := v_avisos || jsonb_build_object('itemId', r.id, 'numero', v_num, 'nivel', 'atencion',
        'texto', format('No encontramos al Tanner por el teléfono: revisa que el #%s esté libre en su categoría.', v_num));
    end if;
  end loop;

  return jsonb_build_object('tanners', v_tanners, 'avisos', v_avisos);
end
$$;

create or replace function public.v2_order_number_check(organization_id uuid, order_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select private.query_order_number_check(organization_id, order_id) $$;

revoke all on function public.v2_order_number_check(uuid, uuid) from public, anon;
grant execute on function public.v2_order_number_check(uuid, uuid) to authenticated;
revoke all on function private.query_order_number_check(uuid, uuid) from public, anon;
