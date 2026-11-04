-- BECAS: Cancelación / Suspensión de un beneficio ya activo (sección 8 del
-- protocolo maestro). No es parte del flujo de la solicitud (eso ya vive en
-- app.scholarship_applications) — aquí se vigila una beca YA otorgada:
--   - app.scholarship_warnings: bitácora de advertencias (causa + nota) contra
--     el beneficio activo. "3 advertencias antes de una revisión formal, salvo
--     faltas graves" — el número es scholarship_settings.max_warnings (ya
--     existía, default 3), pero el límite es orientativo: Presidencia puede
--     suspender directo en una falta grave sin esperar a juntar 3.
--   - app.player_benefits gana columnas para registrar por qué y cuándo se
--     terminó un beneficio por causa (no por vencimiento ni por reemplazo con
--     uno nuevo, que ya se manejaban con active=false sin motivo).

begin;

create table if not exists app.scholarship_warnings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  benefit_id uuid not null references app.player_benefits(id),
  player_id uuid not null references app.players(id),
  cause text not null check (cause in ('falsedad_informacion','ausentismo','indisciplina_grave','incumplimiento_reiterado','baja_club','otro')),
  note text,
  created_by_user_id uuid,
  created_at timestamptz not null default now()
);
alter table app.scholarship_warnings enable row level security;
create index if not exists idx_scholarship_warnings_benefit on app.scholarship_warnings(benefit_id, created_at desc);

alter table app.player_benefits add column if not exists ended_at timestamptz;
alter table app.player_benefits add column if not exists ended_cause text;
alter table app.player_benefits add column if not exists ended_reason text;
alter table app.player_benefits add column if not exists ended_by_user_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'player_benefits_ended_cause_check') then
    alter table app.player_benefits add constraint player_benefits_ended_cause_check
      check (ended_cause is null or ended_cause in ('falsedad_informacion','ausentismo','indisciplina_grave','incumplimiento_reiterado','baja_club','otro'));
  end if;
end $$;

commit;
