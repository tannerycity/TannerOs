-- "Curtibrother" no existe.
--
-- Erick García Medina y Oscar André Ortega Montoya llevaban desde el 1 de
-- julio sin cobrarse. El motivo que traía su perfil de cobro era "Patrocinio
-- activo pendiente de configurar": los dos tenían un beneficio sponsor_funded
-- a nombre de "Curtibrother", con calculation_type 'informational' y
-- funding_configured_at en nulo, y la nota "Imported as legacy context".
--
-- app.generate_monthly_charges excluye a propósito a quien tenga un patrocinio
-- activo sin configurar: no sabe cuánto va a la familia y cuánto al
-- patrocinador, así que prefiere no cobrar antes que cobrar mal. La regla es
-- correcta. Lo que nadie vio en tres meses es que la bandera estaba encendida.
--
-- Curtibrother no está dado de alta como patrocinador (app.sponsors no tiene
-- ninguna marca que se le parezca). El nombre es texto suelto que quedó de la
-- migración. Presidencia confirmó que no aporta dinero.
--
-- Cómo queda, confirmado por Presidencia el 24 de septiembre de 2026:
--   Erick García Medina        la familia paga $500 completos
--   Oscar André Ortega Montoya beca total del club, no paga
--
-- El beneficio de Curtibrother NO se borra: se configura en $0. Así queda la
-- huella de que alguien lo revisó y determinó que no aporta, en vez de que el
-- dato simplemente desaparezca. Con aporte cero, generate_monthly_charges no
-- crea ningún cargo a un patrocinador que no existe.
--
-- Se hace por los comandos del sistema, no con UPDATE a mano. Vale la pena
-- decir por qué: command_end_player_benefit y command_save_player_benefit
-- rechazan explícitamente tocar un sponsor_funded ("Los apoyos que paga un
-- patrocinador se cierran en Contabilidad: ahí es donde se autoriza el
-- dinero"). Esa barrera es deliberada, así que el único camino legítimo es
-- command_configure_sponsor_funding, que además limpia la bandera y deja el
-- evento SponsorFundingConfigured.
--
-- Firma con la cuenta de Presidencia de Michel Enríquez, que es quien lo
-- confirmó.
--
-- Medido antes de aplicar, en un bloque revertido:
--   Erick   tarifa=500.00 review=f  -> en octubre: monthly_fee $500 (guardian)
--   Oscar   tarifa=0.00   review=f  -> en octubre: sin cargo (beca total)
--   octubre pasa de 57 a 58 mensualidades
--   ninguno genera cargo a patrocinador
do $do$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
  v_uid uuid := 'cb3b6ae5-6608-465a-a3a6-70b19bdb6918';
  v_erick uuid; v_oscar uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  select id into v_erick from app.players
   where organization_id = v_org and first_name = 'Erick' and last_name = 'García Medina';
  select id into v_oscar from app.players
   where organization_id = v_org and first_name = 'Oscar André' and last_name = 'Ortega Montoya';

  -- Erick: mensualidad de $500 que paga la familia. Curtibrother aporta $0.
  if v_erick is not null
     and exists (select 1 from app.player_benefits
                 where id = '0cf6158f-46f2-4cfe-adce-8574675dcc75'
                   and player_id = v_erick and funding_configured_at is null) then
    perform private.command_configure_sponsor_funding(
      v_org, v_erick, '0cf6158f-46f2-4cfe-adce-8574675dcc75'::uuid, 'Curtibrother',
      500, 'fixed_amount', 0, '2026-07-01'::date, null,
      'Curtibrother no aporta dinero: el nombre venia de la migracion y la marca no existe como patrocinador. La familia paga la mensualidad completa.',
      null);
  end if;

  -- Oscar: beca total del club. Curtibrother tampoco aporta.
  if v_oscar is not null
     and exists (select 1 from app.player_benefits
                 where id = '950b2e51-a25e-4d17-bf1e-3964e1974165'
                   and player_id = v_oscar and funding_configured_at is null) then
    perform private.command_configure_sponsor_funding(
      v_org, v_oscar, '950b2e51-a25e-4d17-bf1e-3964e1974165'::uuid, 'Curtibrother',
      0, 'fixed_amount', 0, '2026-07-01'::date, null,
      'Curtibrother no aporta dinero: el nombre venia de la migracion. Oscar es beca total del club.',
      null);
  end if;

  -- Y que su beca quede registrada como tal, igual que la de sus compañeros
  -- becados: un cero suelto dice "nadie capturo la tarifa", no dice "becado".
  if v_oscar is not null
     and not exists (select 1 from app.player_benefits
                     where player_id = v_oscar and benefit_type = 'scholarship_full' and active) then
    perform private.command_save_player_benefit(
      v_org, v_oscar, null, 'scholarship_full', null, null, null, '2026-07-01'::date, null,
      'Beca total del club. Confirmado por Presidencia el 24 de septiembre de 2026.');
  end if;
end $do$;
