-- Aviso de privacidad y documentos al dar de alta un club.
-- provision_club ahora siembra los cuatro documentos del club (t3 tiene las
-- plantillas). Se hace aquí y no con un trigger sobre organizations: crear el
-- trigger necesita un candado sobre una tabla que la app usa todo el tiempo y
-- la migración no terminaba.
-- El aviso de privacidad sigue el de Tannery con el nombre del club; el
-- domicilio y el correo de contacto quedan [PENDIENTE: ...] para que el club
-- los complete en Centro Tanner.

create or replace function private.plantilla_aviso_de_privacidad(p_club text, p_ciudad text, p_whatsapp text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  with d(club, ciudad, contacto) as (
    select coalesce(nullif(trim(p_club), ''), 'El club'),
           coalesce(nullif(trim(p_ciudad), ''), '[PENDIENTE: ciudad y estado]'),
           '[PENDIENTE: correo de contacto del club]'
             || case when nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '') is not null
                     then ' o por WhatsApp al ' || regexp_replace(p_whatsapp, '\D', '', 'g') else '' end
  )
  select replace(replace(replace($t$Este documento explica qué información pedimos cuando inscribes a un menor en {club}, para qué la usamos y qué puedes hacer si quieres consultarla, corregirla o pedir que la eliminemos.

1. Quién es responsable de tus datos
{club}, con domicilio en [PENDIENTE: calle, número, colonia y código postal], {ciudad}, México, es responsable del tratamiento de los datos personales que nos proporcionas.
Para cualquier tema relacionado con este aviso puedes escribirnos a {contacto}.

2. Qué datos recabamos
Del menor: nombre y apellidos, fecha de nacimiento, sexo, escuela, categoría de interés, pierna dominante, fotografía, y cuando aplica, alergias o condiciones médicas relevantes para su seguridad durante la actividad física.
Del padre, madre o tutor: nombre, teléfono de WhatsApp, correo electrónico y, cuando corresponde, datos de contacto de emergencia.
Administrativos: pagos, saldos, pedidos de uniforme y otros servicios del club asociados a la familia.
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
Para ejercerlos, escríbenos a {contacto} indicando el nombre del menor, tu nombre como tutor, qué derecho quieres ejercer y un medio para responderte. Te contestamos en un plazo máximo de 20 días hábiles.

6. Cómo revocar tu consentimiento
Puedes retirar tu consentimiento en cualquier momento por el mismo medio. Si retiras el consentimiento del uso de imagen, dejaremos de publicar material nuevo del menor; el material ya difundido se retira en la medida en que sea técnicamente posible.
Ten en cuenta que la revocación del tratamiento necesario puede impedir que continuemos prestando el servicio.

7. Cuánto tiempo los conservamos
Conservamos la información mientras el menor esté inscrito y, después de su baja, durante el plazo que exijan las obligaciones fiscales y administrativas aplicables. Cumplido ese plazo, se elimina o se anonimiza.

8. Seguridad
La información se guarda en sistemas con acceso restringido por perfiles: cada persona del club ve únicamente lo que necesita para su función. Las fotografías se almacenan en un espacio privado que no es accesible públicamente.

9. Cambios a este aviso
Si modificamos este aviso publicaremos la nueva versión en esta misma página, con su número y fecha. Te recomendamos revisarla de vez en cuando.$t$, '{club}', d.club), '{ciudad}', d.ciudad), '{contacto}', d.contacto)
  from d
$function$;

create or replace function private.provision_club(p jsonb)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'app', 'private', 'extensions'
as $$
declare
  v_org uuid; v_plan uuid; v_plan_code text := coalesce(nullif(p->>'planCode', ''), 'cantera');
  v_slug text := lower(trim(coalesce(p->>'slug', '')));
  v_name text := trim(coalesce(p->>'name', ''));
  v_email text := lower(trim(coalesce(p->'owner'->>'email', '')));
  v_charge int := coalesce(nullif(p->>'chargeDay', '')::int, 1);
  v_due int := coalesce(nullif(p->>'dueDay', '')::int, 5);
  v_late numeric := coalesce(nullif(p->>'lateFee', '')::numeric, 0);
  v_plantilla uuid; v_inv uuid; v_n int := 0; r record; v_colors jsonb;
  v_hex text := '^#[0-9A-Fa-f]{6}$';
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if length(v_name) < 2 then raise exception 'El club necesita un nombre'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' then
    raise exception 'El identificador lleva entre 3 y 50 caracteres: minúsculas, números y guiones';
  end if;
  if exists (select 1 from public.organizations where lower(slug) = v_slug) then
    raise exception 'Ya hay un club con el identificador %', v_slug;
  end if;
  if v_charge not between 1 and 28 or v_due not between 1 and 28 then raise exception 'El día de cobro y el de vencimiento van entre 1 y 28'; end if;
  if v_late < 0 then raise exception 'El recargo no puede ser negativo'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Escribe el correo del dueño del club'; end if;
  select id into v_plan from public.plans where code = v_plan_code and active;
  if v_plan is null then raise exception 'No existe el plan %', v_plan_code; end if;

  v_colors := jsonb_build_object(
    'primary',    case when p->'colors'->>'primary'   ~ v_hex then p->'colors'->>'primary'   else '#012A3A' end,
    'secondary',  case when p->'colors'->>'secondary' ~ v_hex then p->'colors'->>'secondary' else '#087D8E' end,
    'accent',     case when p->'colors'->>'accent'    ~ v_hex then p->'colors'->>'accent'    else '#C6AC5C' end,
    'background', '#F5F3EB');

  insert into public.organizations (slug, name, legal_name, status, public_key, timezone, locale, currency, branding, settings)
  values (v_slug, v_name, nullif(trim(coalesce(p->>'legalName', '')), ''), 'active', encode(gen_random_bytes(16), 'hex'),
          'America/Mexico_City', 'es-MX', 'MXN',
          jsonb_build_object('brand', v_name, 'colors', v_colors, 'assets', '{}'::jsonb),
          jsonb_build_object('city', nullif(trim(coalesce(p->>'city', '')), ''), 'founder', coalesce((p->>'founder')::boolean, false),
                             'whatsappNumber', nullif(regexp_replace(coalesce(p->'owner'->>'phone', ''), '\D', '', 'g'), ''),
                             'provisionedAt', now(), 'provisionedBy', (select auth.uid())))
  returning id into v_org;

  -- Sus documentos: reglamento, uso de imagen, visoría y aviso de privacidad,
  -- con su nombre. Lo que sólo el club sabe queda [PENDIENTE: ...].
  insert into app.consent_documents (organization_id, code, title, body, version, required, active, effective_date)
  select v_org, t.code, t.title, t.body, 1, t.required, true, current_date
  from private.plantillas_de_documentos(v_name, p->>'city', p->'owner'->>'phone') t
  on conflict (organization_id, code) do nothing;

  insert into public.subscriptions (organization_id, plan_id, status, starts_at, metadata)
  values (v_org, v_plan, 'active', now(), jsonb_build_object('founder', coalesce((p->>'founder')::boolean, false)));

  insert into app.billing_policies (organization_id, charge_day, due_day, late_fee_amount, currency)
  values (v_org, v_charge, v_due, v_late, 'MXN');

  -- Permisos por rol: la matriz del primer club (Tannery City), que es la
  -- probada. Sin esto el dueño entra y no ve ni un módulo.
  select id into v_plantilla from public.organizations where id <> v_org order by created_at limit 1;
  insert into public.role_module_permissions (organization_id, role, module_code, can_read, can_write)
  select v_org, rmp.role, rmp.module_code, rmp.can_read, rmp.can_write
  from public.role_module_permissions rmp where rmp.organization_id = v_plantilla;

  for r in select c from jsonb_array_elements(coalesce(p->'categories', '[]'::jsonb)) c loop
    if length(trim(coalesce(r.c->>'name', ''))) > 0 then
      v_n := v_n + 1;
      insert into app.categories (organization_id, code, name, sort_order, status, monthly_fee, monthly_fee_set_at)
      values (v_org, regexp_replace(lower(trim(r.c->>'name')), '[^a-z0-9]+', '_', 'g'), trim(r.c->>'name'), v_n * 10, 'active',
              nullif(r.c->>'monthlyFee', '')::numeric, case when nullif(r.c->>'monthlyFee', '') is not null then now() end)
      on conflict (organization_id, name) do nothing;
    end if;
  end loop;

  -- El dueño entra con este correo: al crear su cuenta, la invitación lo
  -- vuelve Presidencia y dueño del club.
  insert into app.organization_invitations (organization_id, email, role_code, invited_by, token_hash, status, expires_at)
  values (v_org, v_email, 'owner', (select auth.uid()), encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'), 'pending', now() + interval '30 days')
  returning id into v_inv;

  insert into app.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (v_org, 'OrganizationProvisioned', 'organization', v_org,
          jsonb_build_object('slug', v_slug, 'plan', v_plan_code, 'categories', v_n, 'ownerEmail', v_email,
                             'founder', coalesce((p->>'founder')::boolean, false)),
          (select auth.uid()));

  return jsonb_build_object('organizationId', v_org, 'slug', v_slug, 'name', v_name, 'plan', v_plan_code,
    'categories', v_n, 'ownerEmail', v_email, 'ownerName', nullif(trim(coalesce(p->'owner'->>'name', '')), ''),
    'ownerPhone', nullif(regexp_replace(coalesce(p->'owner'->>'phone', ''), '\D', '', 'g'), ''));
end $$;