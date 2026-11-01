-- PROPUESTA (no aplicar sin autorización): conservar 25 meses de métricas del
-- tablero y 6 meses de bitácora de sincronizaciones. Corre el día 1 a las 4:10.
select cron.schedule('bi-purga', '10 4 1 * *', $$
  delete from app.bi_metricas_dia where dia < (now() - interval '25 months')::date;
  delete from app.bi_sincronizaciones where ocurrio_at < now() - interval '6 months';
$$);
