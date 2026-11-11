-- h83 (11/11/2026, Presidencia): "se le asignó número a Christian Yael y no se
-- actualiza en su pedido". El dorsal vive en la ficha (app.players.jersey_number)
-- y el número de cada playera en la pieza (order_items.attributes.numero). Nada
-- los unía: Christian tiene el #24 y sus 4 jerseys seguían sin número, así que
-- el pedido no salía de Revisar ("Falta el número"). Igual Gonzalo (#18) y
-- Santiago (#21).
--
-- Regla: en un pedido ligado a un Tanner con dorsal, que todavía no se manda al
-- proveedor, cada playera personalizada (con nombre) que no trae número toma
-- el dorsal. Nunca se pisa un número que ya se escribió.
--
-- El dorsal es el número oficial del club, así que también cuenta como número
-- confirmado (metadata.numeroConfirmado), que es lo que pide order_readiness.
--
-- La confirmación con la familia se guarda con una huella de las piezas
-- (private.order_huella), que incluye el número. Si el pedido ya estaba
-- confirmado, llenar el dorsal no debe tumbarla: se recalcula la huella y queda
-- registrado en el evento.

create or replace function private.llena_numero_dorsal(p_order_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_o app.orders%rowtype; v_dorsal text; v_conf boolean; v_n int;
begin
  select * into v_o from app.orders where id = p_order_id;
  if v_o.id is null or v_o.player_id is null or v_o.archived_at is not null
     or v_o.status not in ('pending_payment', 'partial_payment', 'paid') then return 0; end if;
  select nullif(btrim(p.jersey_number), '') into v_dorsal from app.players p where p.id = v_o.player_id;
  if v_dorsal is null then return 0; end if;
  v_conf := private.order_confirmada(v_o.organization_id, v_o.id);
  update app.order_items i
     set attributes = coalesce(i.attributes, '{}'::jsonb) || jsonb_build_object('numero', v_dorsal, 'numeroDeDorsal', true)
   where i.order_id = v_o.id
     and nullif(btrim(coalesce(i.attributes->>'numero', i.attributes->>'number', '')), '') is null
     and nullif(btrim(coalesce(i.attributes->>'nombrePers', i.attributes->>'personalizationName', '')), '') is not null;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    -- El dorsal es el número oficial del club: cuenta como número confirmado
    -- (si no, el pedido se queda en Revisar por "número sin confirmar").
    update app.orders set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('numeroConfirmado',
        coalesce(metadata->'numeroConfirmado', '{}'::jsonb) || jsonb_build_object(
          'numeros', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
                        select jsonb_array_elements_text(coalesce(metadata->'numeroConfirmado'->'numeros', '[]'::jsonb)) x
                        union select v_dorsal) z),
          'at', coalesce(metadata->'numeroConfirmado'->>'at', now()::text), 'deDorsal', true))
     where id = v_o.id;
    if v_conf then
      update app.orders set metadata = jsonb_set(metadata, '{confirmado,huella}', to_jsonb(private.order_huella(v_o.organization_id, v_o.id)))
       where id = v_o.id;
    end if;
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (v_o.organization_id, 'OrderNumberFromJersey', 'order', v_o.id,
            jsonb_build_object('numero', v_dorsal, 'piezas', v_n, 'confirmacionConservada', v_conf), (select auth.uid()));
  end if;
  return v_n;
end $$;
revoke all on function private.llena_numero_dorsal(uuid) from public, anon, authenticated;

-- Cuando se le asigna (o cambia) el dorsal al Tanner.
create or replace function private.trg_dorsal_a_pedidos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if nullif(btrim(new.jersey_number), '') is not null and new.jersey_number is distinct from old.jersey_number then
    for r in select o.id from app.orders o where o.player_id = new.id and o.archived_at is null
               and o.status in ('pending_payment', 'partial_payment', 'paid') loop
      perform private.llena_numero_dorsal(r.id);
    end loop;
  end if;
  return new;
end $$;
revoke all on function private.trg_dorsal_a_pedidos() from public, anon, authenticated;
drop trigger if exists trg_dorsal_a_pedidos on app.players;
create trigger trg_dorsal_a_pedidos after update of jersey_number on app.players
  for each row execute function private.trg_dorsal_a_pedidos();

-- Cuando el pedido se liga a un Tanner (ya con piezas).
create or replace function private.trg_pedido_ligado_dorsal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.player_id is not null and new.player_id is distinct from old.player_id then
    perform private.llena_numero_dorsal(new.id);
  end if;
  return new;
end $$;
revoke all on function private.trg_pedido_ligado_dorsal() from public, anon, authenticated;
drop trigger if exists trg_pedido_ligado_dorsal on app.orders;
create trigger trg_pedido_ligado_dorsal after update of player_id on app.orders
  for each row execute function private.trg_pedido_ligado_dorsal();

-- Una pieza nueva en un pedido que ya es de un Tanner con dorsal.
create or replace function private.trg_pieza_con_dorsal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_dorsal text;
begin
  if nullif(btrim(coalesce(new.attributes->>'numero', new.attributes->>'number', '')), '') is null
     and nullif(btrim(coalesce(new.attributes->>'nombrePers', new.attributes->>'personalizationName', '')), '') is not null then
    select nullif(btrim(p.jersey_number), '') into v_dorsal
      from app.orders o join app.players p on p.id = o.player_id
     where o.id = new.order_id and o.archived_at is null and o.status in ('pending_payment', 'partial_payment', 'paid');
    if v_dorsal is not null then
      new.attributes := coalesce(new.attributes, '{}'::jsonb) || jsonb_build_object('numero', v_dorsal, 'numeroDeDorsal', true);
    end if;
  end if;
  return new;
end $$;
revoke all on function private.trg_pieza_con_dorsal() from public, anon, authenticated;
drop trigger if exists trg_pieza_con_dorsal on app.order_items;
create trigger trg_pieza_con_dorsal before insert on app.order_items
  for each row execute function private.trg_pieza_con_dorsal();

-- Los pedidos abiertos de hoy (Gonzalo #18, Santiago #21, Christian #24).
do $$
declare r record;
begin
  for r in select distinct o.id from app.orders o join app.players p on p.id = o.player_id
            where o.archived_at is null and o.status in ('pending_payment', 'partial_payment', 'paid')
              and nullif(btrim(p.jersey_number), '') is not null loop
    perform private.llena_numero_dorsal(r.id);
  end loop;
end $$;
