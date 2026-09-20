insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata)
values(
  'ACA-BILL-001',
  'academies',
  'Academy fees in canonical billing ledger',
  'The canonical model can represent academy_fee charges and academy enrollments preserve an agreed fee, but automatic charge generation and late-fee treatment are intentionally disabled until the business decides whether academies enter the same monthly ledger, how the first-month proration is applied, and whether academy balances accrue late fees.',
  'approved_v2',
  100,
  'pending',
  'pending',
  'pending',
  'app.charges / app.academy_enrollments / app.generate_monthly_charges',
  jsonb_build_object(
    'requires_business_decision',true,
    'questions',jsonb_build_array(
      'Should active academy enrollments automatically generate academy_fee charges in the canonical monthly ledger?',
      'Should the first academy month be prorated by active calendar days?',
      'Are academy_fee balances eligible for the same late-fee policy as club monthly_fee balances?'
    ),
    'safety','No automatic academy charge generation enabled before decision'
  )
)
on conflict(rule_key) do update set
  title=excluded.title,
  description=excluded.description,
  source=excluded.source,
  precedence=excluded.precedence,
  enforcement=excluded.enforcement,
  status=excluded.status,
  test_status=excluded.test_status,
  source_ref=excluded.source_ref,
  metadata=app.business_rule_catalog.metadata||excluded.metadata,
  updated_at=now();;
