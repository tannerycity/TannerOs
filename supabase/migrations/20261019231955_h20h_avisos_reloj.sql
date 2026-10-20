-- El reloj del club: cada 5 minutos manda el push de los avisos programados que ya salieron.
-- cron.schedule con el mismo nombre reemplaza el trabajo, no lo duplica.
select cron.schedule('tanneros-avisos-programados', '*/5 * * * *', 'select private.avisos_programados_push()');
