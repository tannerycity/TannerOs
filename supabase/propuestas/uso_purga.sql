-- PROPUESTA (no aplicar sin autorización): conservación del uso de TannerOS.
--
-- h55 guarda aperturas por módulo y actores seudónimos por día. Se conservan
-- 13 meses (comparativo año contra año) y después se purgan. Se deja aparte
-- porque borra renglones: Presidencia decide el plazo con su asesor legal
-- (docs/medicion/PRIVACIDAD.md).

create or replace function private.usage_purga()
returns void language sql security definer set search_path to '' as $$
  delete from app.usage_actors where day < (now() at time zone 'America/Mexico_City')::date - 395;
  delete from app.usage_daily where day < (now() at time zone 'America/Mexico_City')::date - 395;
$$;
revoke all on function private.usage_purga() from public, anon, authenticated;
select cron.schedule('tanneros-uso-purga', '20 9 * * *', $$select private.usage_purga()$$);
