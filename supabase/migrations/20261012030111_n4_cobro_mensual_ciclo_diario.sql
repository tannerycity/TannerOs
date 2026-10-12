-- Cobro de la suscripción a los clubes. 5/5: el ciclo corre todos los días a
-- las 9:03 de León (15:03 UTC). Es idempotente: emitir, avisar, recargo y
-- candado se hacen una sola vez aunque corra de más.
select cron.schedule('tanneros-cobro-clubes', '3 15 * * *', 'select private.run_club_billing();');
