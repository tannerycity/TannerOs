do $block$
declare v_player_id uuid;
begin
  select id into v_player_id from app.players where organization_id='3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8' and legacy_id='p_imp_1778606311078_vaw68' and status='active';
  if v_player_id is null then raise exception 'Expected active legacy player not found'; end if;
  perform app.withdraw_player(v_player_id,'2026-08-19','Baja confirmada por Presidencia; motivo no especificado','cutover_legacy_2026-08-20');
end
$block$;;
