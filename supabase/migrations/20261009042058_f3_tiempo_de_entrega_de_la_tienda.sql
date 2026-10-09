-- f3 · El tiempo de entrega se dice antes de comprar
--
-- Presidencia (09/10/2026): los pedidos se entregan en 3 a 4 semanas. Una
-- familia que no lo sabe pregunta "¿ya está mi jersey?" a la semana. Se guarda
-- por club junto a cómo pagar (settings.paymentInstructions.delivery) y el
-- link público lo lee con v2_public_payment_info.
create or replace function public.v2_public_payment_info(club_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid; v_s jsonb;
begin
  v_org := private.public_organization(club_key);
  if v_org is null then raise exception 'Club not found'; end if;
  select settings into v_s from public.organizations where id = v_org;
  return jsonb_build_object(
    'transfer', v_s->'paymentInstructions'->'transfer',
    'methods', coalesce(v_s->'paymentInstructions'->'methods', '[]'::jsonb),
    'delivery', nullif(trim(coalesce(v_s->'paymentInstructions'->>'delivery', '')), ''),
    'whatsapp', nullif(regexp_replace(coalesce(v_s->>'whatsappNumber', ''), '\D', '', 'g'), ''));
end
$$;

update public.organizations
   set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{paymentInstructions,delivery}', '"3 a 4 semanas"'::jsonb, true),
       updated_at = now()
 where id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
