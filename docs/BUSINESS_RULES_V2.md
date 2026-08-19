# TannerOS 2.0 — Canonical Business Rules

## Authority order
1. Explicit v2 decisions confirmed by Tannery City during the migration.
2. Business behavior evidenced in TannerOS v1.0.238 / Apps Script legacy.
3. Safer v2 technical constraints that preserve intent without reintroducing legacy bugs.

If a legacy behavior conflicts with a later confirmed v2 decision, the v2 decision wins.

## Players
- A Tanner belongs to one organization/tenant.
- Active jersey numbers may repeat across categories, but not inside the same category.
- Possible duplicate Tanner detection uses normalized child identity; conversion from Prospect must not silently create a second active Tanner.
- Withdrawal preserves all historical records and requires date + reason.
- Reactivation preserves history and resumes billing from the reactivation date; missed withdrawn months are not regenerated.
- Player code generation continues `TannerNNN`; legacy duplicate codes are historical data and are not silently rewritten.
- Prospect → Tanner conversion preserves campaign provenance, photo reference, privacy notice version and consent decisions.
- A converted prospect cannot be converted twice.
- Guardian/contact is reused by canonical phone when possible; otherwise a new guardian is created and linked as primary.

## Billing / collection
- Monthly obligation is born on day 1.
- Payment due date is day 5.
- From day 6, v2 generates a MXN 100 late-fee charge for future v2 periods when applicable. This supersedes the legacy UI-only late-fee suggestion behavior.
- First billing month is prorated from the actual billing/enrollment start date.
- Partial payments are allowed.
- New v2 payments allocate to oldest outstanding debt first unless an explicit historical period/business command overrides it.
- New overpayments become available credit.
- Historical migration excess remains `legacy_hold` and is not spendable credit until reviewed.
- Full scholarship/exemption generates zero expected monthly income.
- Curtibrother is sponsor-paid, not a scholarship.
- Hermanos Tanner is a MXN 50 discount benefit, not a full scholarship.
- Payment posting is idempotent and ledger mutations go through commands, not direct browser table writes.
- Charge lifecycle (`posted/void`) is separate from derived collection state.

## Attendance
- One attendance record per Tanner per session.
- Saving the same Tanner/session updates the record rather than duplicating it.
- Valid attendance states are canonical v2 values (`present`, `absent`, `late`, `excused`).
- Session responsible/recorder derives from authenticated identity, not a free-form browser value.
- Sessions must have valid chronological start/end timestamps.

## Categories
- Category membership is relational through `player_enrollments`; the legacy text category is transitional/display compatibility.
- At most one active primary category enrollment should represent the Tanner's current club category.
- Category history is preserved when a Tanner changes category.

## Prospect capture
- Public enriched registration requires child first name, last name, birth date, guardian, valid international phone, school, purpose, dominant foot, source channel and mandatory data-processing consent.
- Image/publicity consent is independent and optional.
- Referral name becomes required when source is `Recomendación`.
- Public campaign attribution is server-persisted (`source_campaign`) and must not depend on a visible user selector.
- Duplicate retries for the same child/campaign in a short window return the existing prospect rather than creating repeated leads.
- Campaign registration photo is required and stored privately; anonymous users cannot read stored child photos.
- Phone is stored canonically in E.164 form.

## Prospect / Scouting funnel
- Prospect follow-up uses canonical v2 statuses: `new`, `contacted`, `trial_scheduled`, `trial_completed`, `converted`, `not_continuing`, `archived`.
- A scouting report may reference a prospect or Tanner and keeps technical, physical, tactical and mental evaluation independently.
- Conversion to Tanner is an explicit command and emits an audit/domain event.

## Academies
- Academy enrollment belongs to one organization, one academy and one Tanner.
- End date cannot precede start date.
- Academy withdrawal preserves payment and attendance history.
- Academy first month follows the same proration principle when billing begins mid-month.
- Academy capacity cannot be negative.

## Orders / store
- Product/order quantities must be greater than zero.
- Product price is resolved on the backend; browser-supplied price is never trusted.
- Order folio is unique per organization.
- Canonical statuses: `draft`, `pending_payment`, `partial_payment`, `paid`, `in_production`, `ready`, `delivered`, `cancelled`, `refunded`.
- A payment/abono may not exceed the order balance.
- Order derived state follows actual paid amount: no payment → pending, partial amount → partial, full balance → paid.
- Delivered/cancelled orders must not accept normal item editing.
- Public orders require data-processing consent and keep consent version/timestamp metadata.

## Goalkeeper sessions/packages
Legacy source establishes these rules to be implemented in the dedicated v2 goalkeeper domain:
- A session linked to an active package consumes package capacity and does not create a second cash charge.
- A standalone completed goalkeeper session generates its own charge/payment using the configured rate.
- Session duration must be greater than zero.
- Package usage/history must remain traceable.

## Uniforms / equipment
Legacy source establishes these rules to be implemented as commerce + fulfillment evolves:
- Payment and fulfillment are separate states.
- Paid does not mean delivered.
- A Tanner may show debt, paid/pending delivery, delivered/up-to-date, paid without linked order, or no uniform.
- Item sizes/details must be resolved before production/fulfillment when required.

## Roles and permissions
- Authorization is server-side: active Supabase Auth user + organization membership + role permission + subscribed/enabled module.
- Browser visibility is convenience only and never the security boundary.
- Money/ledger writes require the corresponding financial permission.
- Player lifecycle writes require Players write permission.
- Prospect and Scouting permissions remain distinct even when surfaced in one UI.

## Privacy / files
- Child photos are private storage objects.
- Public registration may upload only within the controlled prospect-photo path and allowed image constraints.
- Internal authenticated reads use private/signed access.
- Data consent and optional image consent are stored separately with version/timestamp.

## Regression policy
Every migrated rule must be enforced at the strongest sensible layer:
- database constraint/index for immutable structural invariants;
- transactional command for cross-table/business invariants;
- frontend validation for UX only;
- black-box and rollback smoke tests before real cutover.
