-- h30 · La relación del tutor, en español (21/10/2026).
-- Presidencia: "me caga cómo se ve eso de guardian… haz el cambio de todos
-- los datos para que quede bien". 61 tutores migrados del sistema anterior
-- (19/08–08/09/2026) traían "guardian"; uno traía "Madre". Ya no se generan
-- nuevos así; v2/contacto.js traduce en pantalla por si llega otro.
update app.player_guardians set relationship = 'Tutor' where relationship = 'guardian';
update app.player_guardians set relationship = 'Mamá' where relationship = 'Madre';
