-- Aviso de privacidad de Tannery City, versión 2 (Presidencia, 12/10/2026):
-- "hay que agregar en el aviso de privacidad que se le piden estos datos a
-- los profes". /unete pide nombre, WhatsApp, foto, CV, etc. El trigger
-- consent_documents_snapshot guarda la versión 1 tal cual, así que las
-- aceptaciones de las familias siguen apuntando a lo que aceptaron.
update app.consent_documents
   set body = replace(body,
         'Este documento explica qué información pedimos cuando inscribes a un menor en Tannery City FC, para qué la usamos',
         'Este documento explica qué información pedimos cuando inscribes a un menor en Tannery City FC o cuando te postulas para trabajar con nosotros, para qué la usamos')
       || E'\n\n10. Si te postulas para trabajar con nosotros\n'
       || E'Cuando te postulas como formador o parte del staff (en app.tannerycity.com/unete) recabamos: nombre, WhatsApp, correo electrónico, edad, colonia o ciudad, puesto que te interesa, experiencia, estudios o licencias, disponibilidad, lo que nos cuentes de ti, tu fotografía y tu currículum (CV).\n'
       || E'Los usamos únicamente para:\n'
       || E'• Evaluar tu perfil para el puesto.\n'
       || E'• Contactarte por WhatsApp y agendar tu entrevista y tu prueba en cancha.\n'
       || E'• Si no quedas en esta ocasión, considerarte para vacantes futuras.\n'
       || E'Tu fotografía sirve para identificarte en la entrevista; no la publicamos.\n'
       || E'Los ven sólo Presidencia y Dirección deportiva del club. Tu fotografía y tu CV se guardan en un espacio privado que no es accesible públicamente. No los compartimos con nadie más, salvo los proveedores de tecnología que alojan el sistema.\n'
       || E'Conservamos tu postulación hasta 2 años desde que la enviaste. Si te contratamos, pasa a tu expediente como colaborador del club. Puedes pedir antes que la eliminemos, o ejercer tus derechos ARCO, escribiendo a tannery.city.1850@gmail.com con tu nombre y tu folio de postulación.',
       version = version + 1,
       effective_date = current_date,
       updated_at = now()
 where organization_id = (select id from public.organizations where slug = 'tannery-city-fc')
   and code = 'privacidad' and active
   and body not like '%10. Si te postulas para trabajar con nosotros%';
