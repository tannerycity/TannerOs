-- h96 · La lista de Jugadores trae el adeudo y el teléfono del tutor
-- (PROPUESTA, sin correr) · 19/11/2026
--
-- Presidencia: lista estilo Contactos con punto rojo "si debe o le falta
-- algo" y deslizar para Cobrar o WhatsApp. Hoy v2_players no trae el saldo
-- ni el teléfono: el punto rojo no puede decir "Debe $1,600" y WhatsApp tiene
-- que pedir la ficha completa antes de abrir el chat.
--
-- Qué agrega (al final, para no mover las columnas de siempre):
--   · balance_due  numeric  lo que debe (suma de charge_balances.balance_due > 0,
--                           la misma cuenta que el estado de cuenta).
--   · oldest_due   date     el cargo sin pagar más viejo (para Atrasado / Por vencer).
--   · guardian_phone text   el teléfono del tutor principal.
--
-- Quién ve qué (las mismas reglas de hoy):
--   · balance_due y oldest_due: sólo quien ve el dinero (can_see_player_money).
--     A los demás les llegan vacíos, como los seis campos de dinero de siempre.
--   · guardian_phone: quien administra Tanners o tiene Familia
--     (is_player_admin o jugadores_familia). Al profe le llega vacío y su
--     WhatsApp sigue pidiendo la ficha, como hoy.
--
-- Por qué DROP + CREATE: Postgres no deja cambiar las columnas de un RETURNS
-- TABLE con CREATE OR REPLACE. Se recrean las dos con sus mismos permisos.
-- La app de hoy ignora columnas extra: publicar esto no rompe nada.

begin;

drop function if exists public.v2_players(uuid, text);
drop function if exists private.query_players(uuid, text);

create function private.query_players(p_organization_id uuid, p_status text default null::text)
returns table(id uuid, code text, first_name text, last_name text, birth_date date, status text, status_value text,
  category text, player_position text, jersey_number text, photo_path text, photo_thumb_path text, photo_bucket text,
  base_monthly_fee numeric, billing_status text, needs_review boolean, review_reason text, sex text, school text,
  has_guardian_email boolean, benefit_active boolean, benefit_source text, docs_missing integer, data_consent boolean,
  image_consent boolean, benefit_type text, image_consent_status text,
  balance_due numeric, oldest_due date, guardian_phone text)
language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
declare v_docs_requeridos integer; v_dinero boolean; v_admin boolean; v_tel boolean;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  v_dinero := private.can_see_player_money(p_organization_id);
  v_admin  := private.is_player_admin(p_organization_id);
  v_tel    := v_admin or private.has_module_access(p_organization_id,'jugadores_familia',false);
  select count(distinct document_type) into v_docs_requeridos
  from app.player_document_status where organization_id=p_organization_id;
  v_docs_requeridos := coalesce(v_docs_requeridos,0);

  return query
  select p.id,p.code,p.first_name,p.last_name,p.birth_date,
         p.status,p.status,p.category,p.position,p.jersey_number,
         p.photo_path,p.photo_thumb_path,p.photo_bucket,
         case when v_dinero then bp.base_monthly_fee end,
         case when v_dinero then bp.status end,
         case when v_dinero then bp.needs_review else false end,
         case when v_dinero then bp.review_reason end,
         p.sex,p.school,
         exists(select 1 from app.player_guardians pg
                join app.guardians g on g.id=pg.guardian_id
                where pg.player_id=p.id and nullif(trim(g.email),'') is not null),
         case when v_dinero then exists(select 1 from app.player_benefits b
                where b.player_id=p.id and b.organization_id=p.organization_id and b.active
                  and (b.ends_on is null or b.ends_on>=current_date)) else false end,
         case when v_dinero then
           (select nullif(trim(b.funding_source_name),'') from app.player_benefits b
             where b.player_id=p.id and b.organization_id=p.organization_id and b.active
               and (b.ends_on is null or b.ends_on>=current_date)
             order by b.priority nulls last, b.starts_on desc limit 1) end,
         greatest(0, v_docs_requeridos - (
           select count(*)::int from app.player_document_status d
           where d.player_id=p.id and d.organization_id=p.organization_id and d.received)),
         coalesce(p.data_consent,false),
         coalesce(p.image_consent,false),
         case when v_dinero then
           (select b.benefit_type from app.player_benefits b
             where b.player_id=p.id and b.organization_id=p.organization_id and b.active
               and (b.ends_on is null or b.ends_on>=current_date)
             order by b.priority nulls last, b.starts_on desc limit 1) end,
         private.estado_de_imagen(p.image_consent, p.data_consent, p.privacy_notice_version),
         -- h96: lo que debe y desde cuándo (misma cuenta que el estado de cuenta).
         case when v_dinero then coalesce((select sum(cb.balance_due) from app.charge_balances cb
                where cb.player_id=p.id and cb.organization_id=p.organization_id and cb.balance_due>0),0) end,
         case when v_dinero then (select min(coalesce(cb.due_date,cb.billing_period)) from app.charge_balances cb
                where cb.player_id=p.id and cb.organization_id=p.organization_id and cb.balance_due>0) end,
         -- h96: teléfono del tutor principal (o el primero), para WhatsApp en un toque.
         case when v_tel then (select nullif(trim(g.phone),'') from app.player_guardians pg
                join app.guardians g on g.id=pg.guardian_id
                where pg.player_id=p.id
                order by pg.is_primary desc nulls last, pg.created_at limit 1) end
  from app.players p
  left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.organization_id=p_organization_id and p.archived_at is null
    and (p_status is null or p.status=p_status)
    and (v_admin or exists(
          select 1 from app.player_enrollments pe
          where pe.organization_id=p.organization_id and pe.player_id=p.id
            and pe.status='active'
            and pe.category_id in (select private.my_category_ids(p_organization_id))))
  order by p.first_name,p.last_name,p.id;
end $function$;
revoke all on function private.query_players(uuid, text) from public, anon, authenticated;

create function public.v2_players(organization_id uuid, status_filter text default null::text)
returns table(id uuid, code text, first_name text, last_name text, birth_date date, status text, status_value text,
  category text, player_position text, jersey_number text, photo_path text, photo_thumb_path text, photo_bucket text,
  base_monthly_fee numeric, billing_status text, needs_review boolean, review_reason text, sex text, school text,
  has_guardian_email boolean, benefit_active boolean, benefit_source text, docs_missing integer, data_consent boolean,
  image_consent boolean, benefit_type text, image_consent_status text,
  balance_due numeric, oldest_due date, guardian_phone text)
language sql security definer set search_path to 'pg_catalog', 'private'
as $function$ select * from private.query_players(organization_id,status_filter) $function$;
revoke all on function public.v2_players(uuid, text) from public, anon;
grant execute on function public.v2_players(uuid, text) to authenticated;

commit;
