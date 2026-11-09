-- h75 · Centro Tanner: el 20% del kit llega como código (09/11/2026)
--
-- TC-146 decía "20% de descuento en el pedido del kit de agosto". Desde h74
-- llega como código personal: automático el 1 de junio, vigente hasta el 31
-- de agosto, un solo uso; si no se usa, se pierde (decisión de Presidencia).

update app.policies
   set official_content = replace(official_content,
         '• Enero a mayo a tiempo: 20% de descuento en el pedido del kit de agosto. No aplica para Tanners con beca.',
         '• Enero a mayo a tiempo: 20% de descuento en el kit. Te llega un código personal el 1 de junio (lo ves en tu Portal); vale del 1 de junio al 31 de agosto y es de un solo uso. Si no se usa en ese periodo, se pierde. No aplica para Tanners con beca.'),
       version = version + 1, updated_at = now()
 where policy_code = 'TC-146' and slug = 'premios-por-puntualidad'
   and position('código personal' in official_content) = 0;

update app.faqs f
   set answer = 'Sí. Si pagas la mensualidad completa a más tardar el día 5 de enero a noviembre, diciembre te sale a mitad de precio (50%), y se aplica solo. Si pagas a tiempo de enero a mayo, el 1 de junio te llega un código con 20% para el kit: vale hasta el 31 de agosto y es de un solo uso.',
       updated_at = now()
  from app.policies p
 where f.policy_id = p.id and p.policy_code = 'TC-146' and f.question = '¿Hay descuento por pagar a tiempo?';
