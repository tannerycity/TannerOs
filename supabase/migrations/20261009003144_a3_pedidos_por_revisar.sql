-- a3 · Pedidos que avisan, se revisan y dicen cómo pagar
--
-- Pedido de Presidencia y Operaciones (08/10/2026): el pedido por link entraba
-- en silencio. Nadie se enteraba hasta abrir Pedidos, no había forma de
-- distinguir lo ya confirmado de lo que nadie había visto, y la familia no
-- sabía a qué cuenta pagar.
--
-- 1. Aviso: cada pedido que llega por el link público o el portal de familias
--    deja un aviso en la campana (y un push) a cada rol que puede abrir Tienda.
--    Los perfiles deportivos no tienen Tienda, así que no les llega.
--    Es un trigger diferido: corre al confirmar la transacción, cuando el
--    pedido ya tiene sus piezas y su total. No toca las funciones que cobran.
-- 2. Por revisar: el pedido queda "por revisar" hasta que alguien lo confirma
--    (metadata.reviewedAt). Confirmarlo archiva su aviso de la campana.
-- 3. Cómo pagar: los datos de depósito del club viven en
--    organizations.settings.paymentInstructions (por club, listo para SaaS) y
--    el link público los lee con v2_public_payment_info.

create or replace function private.avisa_pedido_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o app.orders%rowtype;
  v_piezas bigint;
  v_titulo text;
  v_cuerpo text;
  v_rol text;
begin
  select * into v_o from app.orders where id = new.id;
  if not found or v_o.archived_at is not null then return null; end if;
  if v_o.source not in ('public_form', 'public_form_bundle', 'portal_familias') then return null; end if;
  if not private.module_enabled(v_o.organization_id, 'commerce') then return null; end if;

  select count(*) into v_piezas from app.order_items i where i.order_id = v_o.id;
  v_titulo := 'Pedido nuevo ' || coalesce(v_o.folio, '');
  v_cuerpo := concat_ws(' · ',
    nullif(trim(coalesce(v_o.customer_name, '')), ''),
    '$' || to_char(coalesce(v_o.total, 0), 'FM999,999,990.00'),
    v_piezas || case when v_piezas = 1 then ' pieza' else ' piezas' end,
    case when v_o.source = 'portal_familias' then 'portal de familias' else 'link de la tienda' end);

  for v_rol in
    select distinct rp.role
    from public.role_module_permissions rp
    where rp.organization_id = v_o.organization_id
      and rp.module_code = private.legacy_module_code('commerce')
      and rp.can_read = true
  loop
    insert into app.announcements(organization_id, title, body, source, source_id, audience_type, audience_value, expires_at)
    values (v_o.organization_id, v_titulo, v_cuerpo, 'order', v_o.id, 'role', v_rol, now() + interval '14 days');
    perform private.notify_push(v_o.organization_id, v_titulo, v_cuerpo, 'role', v_rol, '/pedidos/?pedido=' || v_o.id);
  end loop;
  return null;
exception when others then
  -- El aviso nunca debe tumbar un pedido.
  return null;
end
$$;

create constraint trigger trg_avisa_pedido_nuevo
  after insert on app.orders
  deferrable initially deferred
  for each row execute function private.avisa_pedido_nuevo();

create or replace function private.query_orders_to_review(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_module_access(p_organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(o.id order by o.created_at)
    from app.orders o
    where o.organization_id = p_organization_id
      and o.archived_at is null
      and o.source in ('public_form', 'public_form_bundle', 'portal_familias')
      and o.status not in ('cancelled', 'refunded', 'delivered')
      and o.metadata->>'reviewedAt' is null
  ), '[]'::jsonb);
end
$$;

create or replace function private.command_mark_order_reviewed(p_organization_id uuid, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_at timestamptz := now();
begin
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  update app.orders
     set metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('reviewedAt', v_at, 'reviewedBy', auth.uid()),
         updated_at = now()
   where id = p_order_id and organization_id = p_organization_id
     and metadata->>'reviewedAt' is null;
  if not found and not exists (select 1 from app.orders where id = p_order_id and organization_id = p_organization_id) then
    raise exception 'Order not found';
  end if;
  update app.announcements set archived_at = v_at
   where organization_id = p_organization_id and source = 'order' and source_id = p_order_id and archived_at is null;
  return jsonb_build_object('orderId', p_order_id, 'reviewedAt', v_at);
end
$$;

create or replace function public.v2_orders_to_review(organization_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select private.query_orders_to_review(organization_id) $$;

create or replace function public.v2_mark_order_reviewed(organization_id uuid, order_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select private.command_mark_order_reviewed(organization_id, order_id) $$;

revoke all on function public.v2_orders_to_review(uuid) from public, anon;
grant execute on function public.v2_orders_to_review(uuid) to authenticated;
revoke all on function public.v2_mark_order_reviewed(uuid, uuid) from public, anon;
grant execute on function public.v2_mark_order_reviewed(uuid, uuid) to authenticated;
revoke all on function private.query_orders_to_review(uuid) from public, anon;
revoke all on function private.command_mark_order_reviewed(uuid, uuid) from public, anon;
revoke all on function private.avisa_pedido_nuevo() from public, anon;

-- Datos para pagar: sólo lo que el club decide publicar. Nada de saldos ni
-- pedidos: quien abre el link no tiene sesión.
create or replace function public.v2_public_payment_info(club_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid; v_s jsonb;
begin
  v_org := private.public_organization(club_key);
  if v_org is null then raise exception 'Club not found'; end if;
  select settings into v_s from public.organizations where id = v_org;
  return jsonb_build_object(
    'transfer', v_s->'paymentInstructions'->'transfer',
    'methods', coalesce(v_s->'paymentInstructions'->'methods', '[]'::jsonb),
    'whatsapp', nullif(regexp_replace(coalesce(v_s->>'whatsappNumber', ''), '\D', '', 'g'), ''));
end
$$;
revoke all on function public.v2_public_payment_info(text) from public;
grant execute on function public.v2_public_payment_info(text) to anon, authenticated;

-- Los datos de Tannery City (los dio Presidencia el 08/10/2026).
update public.organizations
   set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('paymentInstructions', jsonb_build_object(
         'transfer', jsonb_build_object('bank', 'Banregio / Hey Banco', 'clabe', '167210000079567650', 'holder', 'Proyecto Leyenda SA de CV'),
         'methods', jsonb_build_array('Transferencia', 'Efectivo', 'Tarjeta'))),
       updated_at = now()
 where id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
