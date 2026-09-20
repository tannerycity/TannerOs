
create index if not exists idx_app_payments_program_fk
  on app.payments(program_id)
  where program_id is not null;
create index if not exists idx_app_payments_program_enrollment_fk
  on app.payments(program_enrollment_id)
  where program_enrollment_id is not null;
create index if not exists idx_program_attendance_program_fk
  on app.program_attendance(program_id,organization_id);
create index if not exists idx_program_attendance_enrollment_fk
  on app.program_attendance(enrollment_id,organization_id);
;
