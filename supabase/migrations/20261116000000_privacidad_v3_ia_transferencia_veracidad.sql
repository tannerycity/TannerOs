-- Aviso de privacidad v3 (16/11/2026). Mich pidió analizar el aviso de datos
-- de Atlético Nacional (Colombia) y agregar lo aprovechable. Se añaden:
--  1) finalidad opcional de IA para segmentar comunicaciones/promociones
--     (puedes negarte, igual que la de uso de imagen);
--  2) aviso de transferencia internacional (Supabase puede alojar fuera de
--     México — la LFPDPPP exige decirlo, hoy no lo decíamos);
--  3) declaración de veracidad/autorización al dar datos de un menor o de un
--     tercero referido;
--  4) WhatsApp del club como canal adicional para ejercer derechos ARCO.
-- Deliberadamente NO se copian del documento de Nacional: la cláusula de
-- lavado de activos/financiamiento al terrorismo (boilerplate de entidad
-- regulada, no aplica a una academia), la validación de datos biométricos
-- (no la usamos) ni el nombre de su regulador (es colombiano — la autoridad
-- mexicana vigente tras la reforma de 2024 se deja pendiente de confirmar
-- con asesoría legal antes de nombrarla).

do $$
declare v_org uuid; v_doc app.consent_documents;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  select * into v_doc from app.consent_documents where organization_id=v_org and code='privacidad';
  if v_doc.id is null then return; end if;

  update app.consent_documents set
    version = v_doc.version + 1,
    effective_date = current_date,
    published_at = now(),
    body = 'Este documento explica qué información pedimos cuando inscribes a un menor en Tannery City FC o cuando te postulas para trabajar con nosotros, para qué la usamos y qué puedes hacer si quieres consultarla, corregirla o pedir que la eliminemos.

1. Quién es responsable de tus datos
Tannery City FC, con domicilio en Españita #1305, Col. Bugambilias, C.P. 37270, León, Guanajuato, México, es responsable del tratamiento de los datos personales que nos proporcionas.
Para cualquier tema relacionado con este aviso puedes escribirnos a tannery.city.1850@gmail.com.

2. Qué datos recabamos
Del menor: nombre y apellidos, fecha de nacimiento, sexo, escuela, categoría de interés, pierna dominante, fotografía, y cuando aplica, alergias o condiciones médicas relevantes para su seguridad durante la actividad física.
Del padre, madre o tutor: nombre, teléfono de WhatsApp, correo electrónico y, cuando corresponde, datos de contacto de emergencia.
Administrativos: pagos, saldos, pedidos de uniforme y gafetes de estacionamiento asociados a la familia.
La información de salud y la fotografía de un menor son datos sensibles. Los pedimos únicamente porque son necesarios para cuidarlo durante la actividad y para identificarlo, y los tratamos con acceso restringido al personal del club que los necesita para su función.
Al inscribir al menor o referir a otra familia, declaras contar con la autorización necesaria para proporcionarnos esos datos, y que la información que nos entregas es veraz, completa y está actualizada. Cualquier error en los datos que tú nos proporciones es tu responsabilidad.

3. Para qué los usamos
Finalidades necesarias (sin ellas no podemos prestar el servicio):
• Inscribir al menor y llevar su control deportivo: categoría, asistencia, convocatorias y seguimiento.
• Identificarlo el día del entrenamiento y confirmar quién está autorizado a recogerlo.
• Administrar la relación: cuotas, pagos, estado de cuenta, uniformes y accesos.
• Contactar al tutor por temas del club y en caso de emergencia.
• Cumplir con las obligaciones legales y fiscales que apliquen.
Finalidades opcionales (puedes negarte y seguir usando el servicio con normalidad):
• Publicar la imagen del menor en redes sociales, página web y material de difusión del club.
• Usar herramientas de análisis e inteligencia artificial para segmentar comunicaciones y mostrarte contenido, avisos o promociones del club más relevantes para ti. Esto nunca se usa para tomar decisiones automatizadas que te afecten de forma importante (por ejemplo, negarte un servicio) — solo para decidir qué contenido o promoción mostrarte.
Negarte a cualquier finalidad opcional no afecta en nada su inscripción ni su participación.

4. Con quién los compartimos
No vendemos ni rentamos tus datos. Sólo los compartimos cuando es indispensable:
• Con proveedores de tecnología que alojan el sistema y procesan la información por cuenta del club, bajo obligación de confidencialidad. Estos proveedores pueden tener servidores fuera de México, lo que implica una transferencia internacional de tus datos; cuentan con medidas de seguridad conforme a estándares internacionales de protección de datos.
• Con ligas, federaciones u organizadores de torneos cuando el menor participa en una competencia que exige el registro.
• Con autoridades, cuando exista un requerimiento fundado y motivado.

5. Tus derechos ARCO
Como titular (o como tutor del menor) tienes derecho a:
• Acceder a los datos que tenemos de ustedes.
• Rectificarlos si están incorrectos o desactualizados.
• Cancelarlos cuando consideres que no se necesitan.
• Oponerte a que se usen para una finalidad concreta.
Para ejercerlos, escribe a tannery.city.1850@gmail.com o por WhatsApp al 479 265 1338, indicando el nombre del menor, tu nombre como tutor, qué derecho quieres ejercer y un medio para responderte. Te contestamos en un plazo máximo de 20 días hábiles.

6. Cómo revocar tu consentimiento
Puedes retirar tu consentimiento en cualquier momento por el mismo correo o WhatsApp. Si retiras el consentimiento del uso de imagen, dejaremos de publicar material nuevo del menor; el material ya difundido se retira en la medida en que sea técnicamente posible.
Ten en cuenta que la revocación del tratamiento necesario puede impedir que continuemos prestando el servicio.

7. Cuánto tiempo los conservamos
Conservamos la información mientras el menor esté inscrito y, después de su baja, durante el plazo que exijan las obligaciones fiscales y administrativas aplicables. Cumplido ese plazo, se elimina o se anonimiza.

8. Seguridad
La información se guarda en sistemas con acceso restringido por perfiles: cada persona del club ve únicamente lo que necesita para su función. Las fotografías se almacenan en un espacio privado que no es accesible públicamente.

9. Cambios a este aviso
Si modificamos este aviso publicaremos la nueva versión en esta misma página, con su número y fecha. Te recomendamos revisarla de vez en cuando.

10. Si te postulas para trabajar con nosotros
Cuando te postulas como formador o parte del staff (en app.tannerycity.com/unete) recabamos: nombre, WhatsApp, correo electrónico, edad, colonia o ciudad, puesto que te interesa, experiencia, estudios o licencias, disponibilidad, lo que nos cuentes de ti, tu fotografía y tu currículum (CV).
Los usamos únicamente para:
• Evaluar tu perfil para el puesto.
• Contactarte por WhatsApp y agendar tu entrevista y tu prueba en cancha.
• Si no quedas en esta ocasión, considerarte para vacantes futuras.
Tu fotografía sirve para identificarte en la entrevista; no la publicamos.
Los ven sólo Presidencia y Dirección deportiva del club. Tu fotografía y tu CV se guardan en un espacio privado que no es accesible públicamente. No los compartimos con nadie más, salvo los proveedores de tecnología que alojan el sistema.
Conservamos tu postulación hasta 2 años desde que la enviaste. Si te contratamos, pasa a tu expediente como colaborador del club. Puedes pedir antes que la eliminemos, o ejercer tus derechos ARCO, escribiendo a tannery.city.1850@gmail.com con tu nombre y tu folio de postulación.

11. Tienda en línea: cookies y medición de campañas
En la tienda en línea guardamos en tu propio dispositivo tu carrito y tus productos guardados, para que no se pierdan si cierras la página. Eso no sale de tu teléfono y no necesita tu permiso.
Si nos das tu permiso con el botón «Aceptar», usamos el Pixel de Meta (Facebook e Instagram) y la etiqueta de Google (Google Analytics y Google Ads) para medir nuestras campañas y mostrarte anuncios del club. Estas herramientas reciben datos de tu navegación en la tienda (páginas que ves, productos que agregas y compras, sin tu nombre ni tu teléfono) y usan sus propias cookies, conforme a sus avisos de privacidad.
Si eliges «Solo lo necesario», no cargamos ninguna de ellas y la tienda funciona igual. Puedes cambiar tu decisión cuando quieras desde «Cookies», al pie de la tienda.
No vendemos tus datos.'
  where id = v_doc.id;

  insert into app.centro_tanner_changes(organization_id,version_label,title,description,effective_date,status,related_document_code,published_at)
  values (v_org, 'v' || (v_doc.version + 1) || ' · 22 nov 2026', 'IA para segmentar, transferencia internacional y veracidad de datos',
    'Aviso de privacidad: agregamos una finalidad opcional de análisis/IA para segmentar comunicaciones (puedes negarte igual que con el uso de imagen, y aclaramos que nunca se usa para decisiones automatizadas que te afecten de forma importante), avisamos que nuestros proveedores de tecnología pueden alojar datos fuera de México (transferencia internacional), agregamos la declaración de veracidad/autorización al dar datos de un menor o de un tercero referido, y sumamos WhatsApp como canal para ejercer tus derechos ARCO.',
    current_date, 'published', 'privacidad', now());
end $$;
