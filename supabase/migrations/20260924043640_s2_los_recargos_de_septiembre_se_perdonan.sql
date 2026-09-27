-- Perdón de los recargos de septiembre de 2026.
--
-- Por qué. Los 46 recargos del mes se emitieron TODOS el 6 de septiembre, en
-- una sola corrida. La protección que evita cobrarle mora a quien ya había
-- pagado —el bloque `al_corriente` de app.assess_late_fees— entró hasta el 9,
-- con la migración 20260909185359. Tres días tarde.
--
-- Eso no prueba que cada uno de esos 46 recargos fuera injusto, y no se
-- auditaron uno por uno. Lo que sí es un hecho es que se cobraron sin la
-- protección puesta. 16 ya se pagaron; 30 siguen vivos por $3,000, repartidos
-- en 29 de los 63 Tanners del club: casi la mitad.
--
-- Presidencia decidió perdonar los que siguen vivos para arrancar octubre
-- parejo con todas las familias. No se tocan los 16 ya cobrados.
--
-- Cómo. Por el camino que el sistema ya tiene para esto, no por un UPDATE a
-- mano: autorización de ajuste (sólo Presidencia) y posteo del ajuste
-- (requiere contabilidad), que son dos firmas distintas y dejan dos eventos
-- de dominio, ChargeAdjustmentAuthorized y ChargeAdjustmentPosted. Queda el
-- monto, el motivo y quién lo autorizó, por cargo. Se puede auditar y se
-- puede revertir.
--
-- Firma con la cuenta de Presidencia de Michel Enríquez, que es quien tomó la
-- decisión. No es una impersonación de conveniencia: es el autor real del
-- perdón, y así queda escrito en la huella.
--
-- Idempotente por tres lados: la llave de idempotencia devuelve la misma
-- autorización si se repite, una autorización ya consumida devuelve su ajuste
-- existente, y el recorrido sólo mira recargos con saldo vivo, que después de
-- esto son cero. Sobre una base recién construida no encuentra nada y no hace
-- nada.
--
-- Medido antes de aplicar, en un bloque revertido:
--   recargos perdonados: 30 por $3,000.00
--   deuda del club: $18,950.00 -> $15,950.00
--   recargos vivos después: 0
do $do$
declare
  v_org uuid := '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
  v_uid uuid := 'cb3b6ae5-6608-465a-a3a6-70b19bdb6918';
  v_motivo text :=
    'Perdon de recargos de septiembre 2026: los 46 recargos se emitieron el 6 de septiembre '
    'y la proteccion que evita cobrarle mora a quien ya habia pagado entro hasta el 9. '
    'Autorizado por Presidencia para arrancar octubre parejo con todas las familias.';
  r record; v_auth uuid; v_n int := 0; v_monto numeric := 0;
begin
  -- Sin la sesión de Presidencia, command_authorize_charge_adjustment se niega.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  for r in
    select cb.id, cb.balance_due
    from app.charge_balances cb
    where cb.organization_id = v_org
      and cb.charge_type = 'late_fee'
      and cb.balance_due > 0
    order by cb.id
  loop
    v_auth := private.command_authorize_charge_adjustment(
      v_org, r.id, 'waiver', r.balance_due, v_motivo,
      'perdon-recargo-sep2026:' || r.id::text);
    perform private.command_post_authorized_adjustment(v_org, v_auth);
    v_n := v_n + 1;
    v_monto := v_monto + r.balance_due;
  end loop;

  raise notice 'Recargos perdonados: % por $%', v_n, v_monto;
end $do$;
