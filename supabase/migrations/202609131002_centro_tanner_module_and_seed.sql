-- Centro Tanner: alta del módulo (RBAC) y contenido inicial real.
-- No se inventa ninguna política: el Aviso de Privacidad se migra tal cual
-- vivía en /aviso-de-privacidad/index.html (misma razón social, domicilio y
-- correo ARCO ya publicados) y la única política nueva es la que Presidencia
-- entregó explícitamente («Pagos y servicios no acumulables»).

-- ---------------------------------------------------------------------------
-- Módulo + permisos (mismo patrón que 'admin'/'usuarios'): habilitado en el
-- plan activo, lectura para todo el staff, escritura solo para Presidencia.
-- ---------------------------------------------------------------------------
insert into public.modules (code, name, category, description, is_core, active, sort_order)
values ('centro_tanner','Centro Tanner','club','Reglamento, FAQ y políticas oficiales del club.',false,true,73)
on conflict (code) do nothing;

insert into public.plan_modules (plan_id, module_code, enabled)
select id, 'centro_tanner', true from public.plans where active
on conflict (plan_id, module_code) do nothing;

insert into public.role_module_permissions (organization_id, role, module_code, can_read, can_write)
select o.id, r.role, 'centro_tanner', true, (r.role='Presidencia')
from public.organizations o
cross join (values ('Presidencia'),('Academia'),('Contabilidad'),('Formadores'),
  ('Marketing'),('Operaciones'),('Scouting'),('Tanner'),('Taquilla')) as r(role)
on conflict (organization_id, role, module_code) do nothing;

-- ---------------------------------------------------------------------------
-- Aviso de Privacidad: se da de alta como documento versionado (ya existía
-- publicado como HTML estático desde el 19 de agosto de 2026; misma fecha,
-- mismo texto, ahora con una sola fuente de verdad).
-- ---------------------------------------------------------------------------
insert into app.consent_documents (organization_id, code, title, body, version, required, active, effective_date, published_at)
select o.id, 'privacidad', 'Aviso de privacidad',
$body$Este documento explica qué información pedimos cuando inscribes a un menor en Tannery City FC, para qué la usamos y qué puedes hacer si quieres consultarla, corregirla o pedir que la eliminemos.

1. Quién es responsable de tus datos
Tannery City FC, con domicilio en Españita #1305, Col. Bugambilias, C.P. 37270, León, Guanajuato, México, es responsable del tratamiento de los datos personales que nos proporcionas.
Para cualquier tema relacionado con este aviso puedes escribirnos a tannery.city.1850@gmail.com.

2. Qué datos recabamos
Del menor: nombre y apellidos, fecha de nacimiento, sexo, escuela, categoría de interés, pierna dominante, fotografía, y cuando aplica, alergias o condiciones médicas relevantes para su seguridad durante la actividad física.
Del padre, madre o tutor: nombre, teléfono de WhatsApp, correo electrónico y, cuando corresponde, datos de contacto de emergencia.
Administrativos: pagos, saldos, pedidos de uniforme y gafetes de estacionamiento asociados a la familia.
La información de salud y la fotografía de un menor son datos sensibles. Los pedimos únicamente porque son necesarios para cuidarlo durante la actividad y para identificarlo, y los tratamos con acceso restringido al personal del club que los necesita para su función.

3. Para qué los usamos
Finalidades necesarias (sin ellas no podemos prestar el servicio):
• Inscribir al menor y llevar su control deportivo: categoría, asistencia, convocatorias y seguimiento.
• Identificarlo el día del entrenamiento y confirmar quién está autorizado a recogerlo.
• Administrar la relación: cuotas, pagos, estado de cuenta, uniformes y accesos.
• Contactar al tutor por temas del club y en caso de emergencia.
• Cumplir con las obligaciones legales y fiscales que apliquen.
Finalidades opcionales (puedes negarte y seguir usando el servicio con normalidad):
• Publicar la imagen del menor en redes sociales, página web y material de difusión del club.
Negarte a la finalidad opcional no afecta en nada su inscripción ni su participación.

4. Con quién los compartimos
No vendemos ni rentamos tus datos. Sólo los compartimos cuando es indispensable:
• Con proveedores de tecnología que alojan el sistema y procesan la información por cuenta del club, bajo obligación de confidencialidad.
• Con ligas, federaciones u organizadores de torneos cuando el menor participa en una competencia que exige el registro.
• Con autoridades, cuando exista un requerimiento fundado y motivado.

5. Tus derechos ARCO
Como titular (o como tutor del menor) tienes derecho a:
• Acceder a los datos que tenemos de ustedes.
• Rectificarlos si están incorrectos o desactualizados.
• Cancelarlos cuando consideres que no se necesitan.
• Oponerte a que se usen para una finalidad concreta.
Para ejercerlos, escribe a tannery.city.1850@gmail.com indicando el nombre del menor, tu nombre como tutor, qué derecho quieres ejercer y un medio para responderte. Te contestamos en un plazo máximo de 20 días hábiles.

6. Cómo revocar tu consentimiento
Puedes retirar tu consentimiento en cualquier momento por el mismo correo. Si retiras el consentimiento del uso de imagen, dejaremos de publicar material nuevo del menor; el material ya difundido se retira en la medida en que sea técnicamente posible.
Ten en cuenta que la revocación del tratamiento necesario puede impedir que continuemos prestando el servicio.

7. Cuánto tiempo los conservamos
Conservamos la información mientras el menor esté inscrito y, después de su baja, durante el plazo que exijan las obligaciones fiscales y administrativas aplicables. Cumplido ese plazo, se elimina o se anonimiza.

8. Seguridad
La información se guarda en sistemas con acceso restringido por perfiles: cada persona del club ve únicamente lo que necesita para su función. Las fotografías se almacenan en un espacio privado que no es accesible públicamente.

9. Cambios a este aviso
Si modificamos este aviso publicaremos la nueva versión en esta misma página, con su número y fecha. Te recomendamos revisarla de vez en cuando.$body$,
  1, true, true, date '2026-08-19', timestamptz '2026-08-19 00:00:00+00'
from public.organizations o where o.public_key='1850TC1850'
on conflict (organization_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Política nueva: Pagos y servicios no acumulables (contenido entregado por
-- Presidencia; no requiere nueva aceptación porque aclara una condición ya
-- vigente, no crea una obligación nueva).
-- ---------------------------------------------------------------------------
insert into app.policies (
  organization_id, policy_code, slug, title, category, scope, short_answer, official_content,
  keywords, status, requires_acceptance, effective_date, published_at
)
select o.id, 'PAG-001', 'pagos-y-servicios-no-acumulables', 'Pagos y servicios no acumulables', 'mensualidades',
  'tannery_city',
  'No. Un pago cubre el periodo, entrenamiento, partido o actividad para el que fue hecho; la falta de uso no genera saldo a favor ni se traslada a otro periodo.',
$content$Los pagos realizados por conceptos vinculados a un periodo, entrenamiento, partido o actividad determinada no son acumulables ni generan saldo a favor por falta de uso.

Incluye, entre otros:
• Mensualidades.
• Arbitrajes.
• Paquetes de arbitrajes.
• Entrenamientos.
• Cuotas deportivas periódicas.
• Servicios vinculados a un periodo específico.

El pago corresponde al derecho de participar o utilizar el servicio durante el periodo o actividad para el que fue cubierto.

La falta de asistencia, ausencia voluntaria o participación parcial no transfiere automáticamente ese pago a meses, partidos o actividades futuras.

Esta política no sustituye políticas específicas como:
• Congelamiento por lesión.
• Apoyo por Vacaciones.
• Cancelaciones atribuibles al club.
• Devoluciones autorizadas.
• Acuerdos extraordinarios autorizados.

No aplica automáticamente a productos físicos.$content$,
  array['pagos','mensualidad','mensualidades','arbitraje','arbitrajes','no acumulable','saldo a favor','falta','ausencia','entrenamientos no usados'],
  'published', false, current_date, now()
from public.organizations o where o.public_key='1850TC1850'
on conflict (organization_id, slug) do nothing;

insert into app.faqs (organization_id, policy_id, question, answer, category, keywords, sort_order, status)
select o.id, p.id, q.question, q.answer, 'mensualidades', q.keywords, q.sort_order, 'published'
from public.organizations o
join app.policies p on p.organization_id=o.id and p.slug='pagos-y-servicios-no-acumulables'
cross join (values
  ('¿Si mi hijo falta, los entrenamientos se acumulan?','No. La mensualidad corresponde al periodo contratado y los entrenamientos no son acumulables.',array['falta','entrenamientos','acumular'],1),
  ('¿Una mensualidad no utilizada pasa al siguiente mes?','No. Las mensualidades corresponden al periodo cubierto.',array['mensualidad','saldo a favor'],2),
  ('¿Un arbitraje pagado se queda para otro partido?','No automáticamente. Corresponde al partido o competencia para la que fue cobrado.',array['arbitraje','partido'],3)
) as q(question, answer, keywords, sort_order)
where o.public_key='1850TC1850'
  and not exists (select 1 from app.faqs where organization_id=o.id and question=q.question);

-- FAQ adicionales para poblar Inicio, basadas en documentos ya reales (sin
-- inventar contenido nuevo): resumen del Reglamento, Uso de imagen y Visoría.
insert into app.faqs (organization_id, question, answer, category, keywords, sort_order, status)
select o.id, q.question, q.answer, q.category, q.keywords, q.sort_order, 'published'
from public.organizations o
cross join (values
  ('¿Qué dice el Reglamento del club?','Como familia Tanner te comprometes a llevar a tu hijo puntual, respetar a profes y compañeros, cubrir la mensualidad en los primeros 5 días de cada mes y cuidar el uniforme y las instalaciones.','conducta',array['reglamento','conducta','compromiso'],1),
  ('¿Autorizan fotos y video de mi hijo?','Es una autorización opcional: el club puede usar fotos y video en redes y material de promoción del club, sin fines ajenos a su actividad deportiva, y puedes retirarla cuando quieras.','privacidad',array['fotos','video','imagen','consentimiento'],2),
  ('¿Qué es una visoría?','Es una evaluación deportiva que no garantiza selección; requiere autorización del tutor y confirma que el jugador está en condiciones físicas para participar.','jugadores',array['visoria','evaluacion','prueba'],3)
) as q(question, answer, category, keywords, sort_order)
where o.public_key='1850TC1850'
  and not exists (select 1 from app.faqs where organization_id=o.id and question=q.question);

-- ---------------------------------------------------------------------------
-- Changelog: v1.0 (lanzamiento del contenido base) y v1.1 (política nueva).
-- ---------------------------------------------------------------------------
insert into app.centro_tanner_changes (organization_id, version_label, title, description, effective_date, status, published_at, related_document_code)
select o.id, 'v1.0', 'Lanzamiento de Centro Tanner',
  'Primera versión pública del Reglamento Tannery City, el Aviso de Privacidad, Uso de imagen, Visoría y las preguntas frecuentes del club.',
  date '2026-09-09', 'published', timestamptz '2026-09-09 19:07:52+00', 'reglamento'
from public.organizations o
where o.public_key='1850TC1850'
  and not exists (select 1 from app.centro_tanner_changes where organization_id=o.id and version_label='v1.0');

insert into app.centro_tanner_changes (organization_id, version_label, title, description, effective_date, status, published_at, related_policy_id)
select o.id, 'v1.1', 'Pagos y servicios no acumulables',
  'Se incorporó una política que establece que pagos correspondientes a periodos o actividades específicas no generan automáticamente saldo para periodos posteriores.',
  current_date, 'published', now(), p.id
from public.organizations o
join app.policies p on p.organization_id=o.id and p.slug='pagos-y-servicios-no-acumulables'
where o.public_key='1850TC1850'
  and not exists (select 1 from app.centro_tanner_changes where organization_id=o.id and version_label='v1.1');
