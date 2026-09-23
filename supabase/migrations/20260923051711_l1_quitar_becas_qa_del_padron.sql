-- L1 · Quitar del padron las 7 becas de QA
--
-- QUE SE BORRA, EXACTAMENTE
-- Siete renglones de app.player_benefits, todos identicos: scholarship_full /
-- full_waiver, active, starts_on 2020-01-01, sin vencimiento, con la nota que
-- dejo el script de importacion. Los siete cuelgan de Tanners de prueba
-- llamados "QA Becado", que ya estan inactive y archived_at desde el
-- 2026-08-19: no aparecen en ninguna pantalla del club.
--
-- POR QUE ES SEGURO
-- Medido antes de aplicar: los siete tienen 0 ajustes de cargo, 0 cargos
-- ligados y 0 saldos ligados. No hay dinero colgando de ellos. Lo unico que
-- hacian era inflar el conteo de becas cuando alguien consulta
-- app.player_benefits sin filtrar Tanners archivados.
--
-- NO SE TOCAN los ~80 Tanners de QA ni sus pagos: varios tienen movimientos
-- y borrarlos si tocaria historia financiera. Quedan archivados como estaban.
--
-- PARA REVERTIR, si alguna vez hiciera falta:
--   insert into app.player_benefits
--     (id, organization_id, player_id, benefit_type, calculation_type,
--      active, priority, starts_on, notes)
--   values (<id>, '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8', <player_id>,
--      'scholarship_full', 'full_waiver', true, null, '2020-01-01',
--      'Imported as legacy context. Historical payable amount remains base_monthly_fee to avoid double-discounting.');
-- con los siete pares (id, player_id) que van listados abajo.

do $$
declare v_n int;
begin
  -- El blanco se cuenta ANTES de borrar. Si no son exactamente 7, o si
  -- alguno dejo de cumplir las condiciones, la migracion no continua.
  select count(*) into v_n
  from app.player_benefits b
  join app.players p on p.id = b.player_id
  where b.id in (
      'ab535486-257f-4b9f-a0cf-12c2dbcee1ad'::uuid,  -- player 29f5411a-c8e0-4ee2-80dc-c0a859c25131
      '724d2332-8077-4ab9-a19d-6a83d6b9f222'::uuid,  -- player 08e1f88e-df31-4b9f-a535-6c0fa430404f
      'd3f76cd7-1352-4649-b0ca-b420daa14a61'::uuid,  -- player c9bf4fad-23fc-429a-a79d-28fef96efe53
      '45ec7302-b90e-4a8e-bb79-8bfe12df6b94'::uuid,  -- player 082647ed-f47e-4f1b-a007-b4c510f58fd6
      '0d4777f4-57d1-41f9-ba98-a328afa71869'::uuid,  -- player fdd0f907-06c0-44de-9893-f1224abb9689
      'da420430-0b93-4ff1-8f3b-047bf03a24e4'::uuid,  -- player 78c1ae14-0470-4b59-ac62-1277582cf9ac
      '8942ae06-d6df-45d4-849b-bae39ad8243b'::uuid   -- player 2ca38af4-bc60-49fe-ad04-0b2d8fa2b84a
    )
    and p.first_name = 'QA' and p.last_name = 'Becado'
    and p.archived_at is not null
    and b.benefit_type = 'scholarship_full';
  if v_n <> 7 then
    raise exception 'Se esperaban 7 becas de QA y hay %. No se borro nada.', v_n;
  end if;

  -- Y que de verdad no cuelgue dinero de ninguna.
  select count(*) into v_n
  from app.player_benefits b
  where b.id in (
      'ab535486-257f-4b9f-a0cf-12c2dbcee1ad'::uuid,'724d2332-8077-4ab9-a19d-6a83d6b9f222'::uuid,
      'd3f76cd7-1352-4649-b0ca-b420daa14a61'::uuid,'45ec7302-b90e-4a8e-bb79-8bfe12df6b94'::uuid,
      '0d4777f4-57d1-41f9-ba98-a328afa71869'::uuid,'da420430-0b93-4ff1-8f3b-047bf03a24e4'::uuid,
      '8942ae06-d6df-45d4-849b-bae39ad8243b'::uuid)
    and (exists (select 1 from app.charges c where c.player_benefit_id = b.id)
      or exists (select 1 from app.charge_adjustments a where a.player_benefit_id = b.id));
  if v_n <> 0 then
    raise exception '% becas de QA tienen cargos o ajustes ligados. No se borro nada.', v_n;
  end if;

  delete from app.player_benefits
  where id in (
    'ab535486-257f-4b9f-a0cf-12c2dbcee1ad'::uuid,'724d2332-8077-4ab9-a19d-6a83d6b9f222'::uuid,
    'd3f76cd7-1352-4649-b0ca-b420daa14a61'::uuid,'45ec7302-b90e-4a8e-bb79-8bfe12df6b94'::uuid,
    '0d4777f4-57d1-41f9-ba98-a328afa71869'::uuid,'da420430-0b93-4ff1-8f3b-047bf03a24e4'::uuid,
    '8942ae06-d6df-45d4-849b-bae39ad8243b'::uuid);
  get diagnostics v_n = row_count;
  if v_n <> 7 then
    raise exception 'Se borraron % renglones en vez de 7', v_n;
  end if;

  -- Que no quede ninguna beca colgando de un Tanner archivado.
  select count(*) into v_n
  from app.player_benefits b
  join app.players p on p.id = b.player_id
  where p.archived_at is not null and b.active;
  if v_n <> 0 then
    raise exception 'Quedaron % becas activas sobre Tanners archivados', v_n;
  end if;
end $$;
