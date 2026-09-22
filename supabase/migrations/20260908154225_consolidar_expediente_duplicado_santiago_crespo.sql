-- Santiago Alejandro Crespo Zambrano tenía dos expedientes: Tanner009 (importado,
-- archivado, con el tutor) y Tanner045 (vivo, con la cobranza). Se consolida en
-- Tanner045 por decisión de Presidencia.
-- NO se mueve el pago de $400 del 5 de julio que quedó en Tanner009: los dos
-- expedientes tienen un pago de "Mensualidad Julio" por el mismo monto y método
-- con dos días de diferencia, así que parece doble captura y no dos pagos. Esa
-- es una decisión contable, no una migración.
do $$
declare
  v009 uuid; v045 uuid; v_org uuid; n int;
begin
  select id,organization_id into v009,v_org from app.players where code='Tanner009';
  select id into v045 from app.players where code='Tanner045';
  if v009 is null or v045 is null then raise exception 'No se encontraron los dos expedientes'; end if;

  -- 1) El tutor vive solo en el expediente viejo.
  if (select count(*) from app.player_guardians where player_id=v045)<>0 then
    raise exception 'Tanner045 ya tiene tutores; revisar a mano antes de mover';
  end if;
  update app.player_guardians set player_id=v045 where player_id=v009;

  -- 2) Asistencias que ya existen idénticas en Tanner045: se descartan las del viejo
  --    en lugar de duplicarlas (mismo niño, misma sesión, misma marca).
  delete from app.attendance_records a009
   where a009.player_id=v009
     and exists (select 1 from app.attendance_records a045
                  where a045.player_id=v045 and a045.session_id=a009.session_id
                    and a045.status=a009.status);
  get diagnostics n = row_count;
  if n<>2 then raise exception 'Se esperaban 2 asistencias duplicadas y se borraron %', n; end if;

  -- 3) El resto del historial se pasa al expediente que se conserva.
  if exists (select 1 from app.attendance_records a009
              join app.attendance_records a045
                on a045.player_id=v045 and a045.session_id=a009.session_id
             where a009.player_id=v009) then
    raise exception 'Todavía hay sesiones con marca en ambos expedientes';
  end if;
  update app.attendance_records set player_id=v045 where player_id=v009;
  get diagnostics n = row_count;
  if n<>3 then raise exception 'Se esperaban 3 asistencias por mover y se movieron %', n; end if;

  -- 4) Cierre formal del expediente retirado, con motivo y bitácora.
  perform app.withdraw_player(v009, current_date,
    'Expediente duplicado; consolidado en Tanner045', 'consolidacion_duplicados');
end $$;

-- Estado final de los dos expedientes
select p.code,p.status,p.withdrawn_at,p.withdrawal_reason,
  (select count(*) from app.player_guardians g where g.player_id=p.id) as tutores,
  (select count(*) from app.attendance_records ar where ar.player_id=p.id) as asistencias,
  (select count(*) from app.charges ch where ch.player_id=p.id) as cargos,
  (select count(*) from app.payments pay where pay.player_id=p.id) as pagos
from app.players p where p.code in ('Tanner009','Tanner045') order by p.code;;
