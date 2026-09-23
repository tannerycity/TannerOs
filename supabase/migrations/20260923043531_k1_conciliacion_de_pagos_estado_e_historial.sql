-- K1 · Validacion y conciliacion de pagos
--
-- CAMINO A, elegido por Presidencia: el pago sigue aplicando a la deuda en
-- el momento de registrarse, igual que hoy. La conciliacion queda ENCIMA
-- como validacion y trazabilidad. No se toca allocate_payment_oldest_first
-- ni el orden en que se liquidan los adeudos: el motor de cobranza que corre
-- con 238 pagos aplicados no se mueve.
--
-- LOS 318 PAGOS QUE YA EXISTEN
-- La columna nace con default 'approved' para que el historico entre como
-- aprobado y nada cambie de estado de un dia para otro. Inmediatamente
-- despues el default pasa a 'pending', que es lo que aplica a los pagos
-- NUEVOS. reconciled_at queda nulo en los viejos: asi se distingue "aprobado
-- por alguien" de "es de antes de que existiera la conciliacion".
--
-- UN RECHAZO NO BORRA NADA
-- El pago se queda donde esta, con su historia. Lo que se revierte son las
-- asignaciones a los adeudos, con private.command_reverse_payment_allocations
-- que ya existia, para que la deuda vuelva a aparecer. "Un pago rechazado no
-- debe marcar la deuda como liquidada" no se cumple solo cambiando una
-- etiqueta.

alter table app.payments
  add column if not exists reconciliation_status text not null default 'approved',
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by_user_id uuid,
  add column if not exists reconciliation_note text,
  add column if not exists reconciliation_reference text,
  add column if not exists expected_amount numeric,
  add column if not exists receipt_path text,
  add column if not exists observations text;

-- El historico ya quedo en 'approved'. De aqui en adelante, pendiente.
alter table app.payments alter column reconciliation_status set default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='payments_reconciliation_status_check') then
    alter table app.payments
      add constraint payments_reconciliation_status_check
      check (reconciliation_status in ('pending','approved','rejected','clarification'));
  end if;
end $$;

comment on column app.payments.reconciliation_status is
  'pending | approved | rejected | clarification. Los pagos anteriores a la conciliacion quedaron approved con reconciled_at nulo.';
comment on column app.payments.expected_amount is
  'Lo que se esperaba cobrar. amount es lo que se recibio. La diferencia es el indicador que pidio Presidencia.';

create index if not exists payments_reconciliation_status_idx
  on app.payments(organization_id, reconciliation_status)
  where reconciliation_status <> 'approved';

-- Historial completo: cada cambio guarda quien, cuando, de que estado a cual
-- y por que. Nunca se borra un renglon.
create table if not exists app.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_id uuid not null references app.payments(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  reference text,
  actor_user_id uuid,
  actor_name text,
  self_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists payment_reconciliations_payment_idx
  on app.payment_reconciliations(payment_id, created_at desc);
create index if not exists payment_reconciliations_org_idx
  on app.payment_reconciliations(organization_id, created_at desc);

alter table app.payment_reconciliations enable row level security;

-- Sin politicas: se lee y se escribe solo por los RPC SECURITY DEFINER, igual
-- que el resto de app. RLS activa deja la tabla cerrada a PostgREST.

comment on table app.payment_reconciliations is
  'Historial de conciliacion de cada pago. Solo se agrega; nunca se borra ni se edita.';
