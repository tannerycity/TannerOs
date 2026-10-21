-- h27 · El acuerdo de pago llega a la familia y a Cobranza (21/10/2026).
-- Presidencia: "que lo puedan ver (las familias) y haya registro".
--   · La familia ve su acuerdo en el portal (pagos, cuánto lleva, el que
--     sigue) y toca "Enterado": queda la fecha y quién, una sola vez, y se
--     anota en el seguimiento del club.
--   · Cobranza ve qué Tanners tienen acuerdo y cuáles lo incumplieron.

create or replace function private.portal_agreement(p_player_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_org uuid; v_id uuid; v jsonb;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  select organization_id into v_org from app.players where id = p_player_id;
  select a.id into v_id from app.payment_agreements a
   where a.player_id = p_player_id and a.organization_id = v_org and a.cancelled_at is null
     and (private.agreement_status(a.id, private.hoy_club(v_org))->>'state' in ('active','broken') or a.created_at > now() - interval '30 days')
   order by a.created_at desc limit 1;
  if v_id is null then return null; end if;
  v := private.agreement_status(v_id, private.hoy_club(v_org));
  -- A la familia no le hace falta saber quién del club lo capturó.
  return v - 'createdBy' - 'cancelledAt' - 'cancelReason';
end $$;
revoke all on function private.portal_agreement(uuid) from public, anon, authenticated;

create or replace function private.portal_acknowledge_agreement(p_agreement_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare a app.payment_agreements%rowtype; v_actor uuid := (select auth.uid()); v_quien text; v_cuando timestamptz;
begin
  select * into a from app.payment_agreements where id = p_agreement_id for update;
  if not found or not private.portal_owns_player(a.player_id) then raise exception 'Not authorized'; end if;
  if a.acknowledged_at is not null then return jsonb_build_object('ok', true, 'acknowledgedAt', a.acknowledged_at); end if;
  if a.cancelled_at is not null then raise exception 'Ese acuerdo ya no está vigente'; end if;
  update app.payment_agreements set acknowledged_at = now(), acknowledged_by_user_id = v_actor where id = a.id
  returning acknowledged_at into v_cuando;
  v_quien := coalesce(private.nombre_actor(), 'La familia');
  insert into app.collection_notes(organization_id, player_id, kind, body, created_by_user_id, created_by_name)
  values (a.organization_id, a.player_id, 'agreement', 'La familia vio el acuerdo en su portal y tocó "Enterado"', v_actor, v_quien);
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (a.organization_id, 'PaymentAgreementAcknowledged', 'player', a.player_id, jsonb_build_object('agreementId', a.id), v_actor);
  return jsonb_build_object('ok', true, 'acknowledgedAt', v_cuando);
end $$;
revoke all on function private.portal_acknowledge_agreement(uuid) from public, anon, authenticated;

create or replace function public.v2_portal_agreement(player_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private'
as $$ select private.portal_agreement(player_id) $$;
create or replace function public.v2_portal_acknowledge_agreement(agreement_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.portal_acknowledge_agreement(agreement_id) $$;
revoke all on function public.v2_portal_agreement(uuid), public.v2_portal_acknowledge_agreement(uuid) from public, anon;
grant execute on function public.v2_portal_agreement(uuid) to authenticated;
grant execute on function public.v2_portal_acknowledge_agreement(uuid) to authenticated;

-- Para la lista de Cobranza: los acuerdos vigentes, uno por Tanner.
create or replace function private.query_agreements_overview(p_organization_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_hoy date := private.hoy_club(p_organization_id);
begin
  if not private.has_any_module_access(p_organization_id, array['billing','taquilla','accounting'], false) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('playerId', x.player_id, 'state', x.s->>'state', 'paid', (x.s->>'paid')::numeric,
      'total', (x.s->>'total')::numeric, 'nextDue', x.s->'next'->>'due', 'nextAmount', (x.s->'next'->>'amount')::numeric))
      from (
        select distinct on (a.player_id) a.player_id, private.agreement_status(a.id, v_hoy) as s
          from app.payment_agreements a
         where a.organization_id = p_organization_id and a.cancelled_at is null
         order by a.player_id, a.created_at desc
      ) x
     where x.s->>'state' in ('active','broken')), '[]');
end $$;
revoke all on function private.query_agreements_overview(uuid) from public, anon, authenticated;

create or replace function public.v2_agreements_overview(organization_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private'
as $$ select private.query_agreements_overview(organization_id) $$;
revoke all on function public.v2_agreements_overview(uuid) from public, anon;
grant execute on function public.v2_agreements_overview(uuid) to authenticated;
