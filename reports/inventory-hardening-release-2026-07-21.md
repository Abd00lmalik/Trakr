# Inventory Hardening Release Report

Date: July 21, 2026

Public endpoint: `POST https://trakr-production-c70e.up.railway.app/api/a2mcp/recommend`

## Verdict

**GO for the inventory-hardening milestone.**

The inventory now models opportunity type, domain, geography, remote scope,
deadline evidence, source authority, and recommendation state separately.
Coverage is more measurable and conservative, and the first category-specific
source expansion is live. Inventory breadth remains uneven and must continue
as an ongoing product workstream.

## Baseline And Result

| Measure | July 20 baseline | July 21 result | Change |
| --- | ---: | ---: | ---: |
| Fetched records | 559 | 594 | +35 net |
| Verified records | 485 | 511 | +26 |
| Program directories | 18 | 24 | +6 |
| Unverified records | 56 | 59 | +3 |
| Grants | 4 | 42 | +38 |
| Internships | 10 | 9 | -1 source churn |
| Scholarships | 3 | 3 | No change |
| Known deadlines | 9 | 37 | +28 |
| Exact current deadlines | Not previously modeled | 35 | New measure |

The genuine category-specific inventory growth was approximately 38 official
Grants.gov records. The smaller net increase reflects normal job and internship
source churn. Type/domain counts and coverage states are classification and
monitoring improvements, not additional opportunities.

Final snapshot:

- 594 records fetched from six approved source groups.
- 511 verified records, 24 official directories, and 59 unverified records.
- 353 `apply_now` records and 182 `explore` records.
- 0 duplicate rate and 0 stale records in the captured evaluation.
- 216 remote records, but 155 records still have unknown or low-confidence
  geographic eligibility.
- 129 records have verified Africa-accessibility evidence under the current
  deterministic rules.
- 37 known deadlines, including 35 exact current-cycle deadlines.

## Inventory Schema

Each normalized record can now carry:

- Primary and secondary opportunity types.
- Independent contextual domains with evidence and confidence.
- Eligible and excluded countries and regions.
- Citizenship, residency, work-authorization, sponsorship, travel, onsite,
  and time-zone evidence.
- Structured remote scope: global, country, region, time-zone, hybrid, onsite,
  or unclear.
- Deadline state, date, time zone, confidence, source, verification timestamp,
  and current-cycle status.
- Source tier, permission state, canonical and application URLs, field-level
  provenance, verification state, and duplicate-cluster identity.
- Recommendation state: `apply_now`, `explore`, `research_lead`, or
  `unavailable_or_unverified`.

Program directories do not count as verified direct opportunities. A remote
label does not establish global access, and Africa-related evidence does not
establish eligibility for every African applicant.

## Coverage And Monitoring

`src/lib/opportunities/inventory-monitoring.ts` produces:

- Coverage by type, domain, country, region, remote scope, deadline state,
  geographic confidence, verification state, and type/domain intersection.
- Source-level counts, verification success, inactive and unverified counts,
  duplicate rate, staleness, and last successful verification.
- Alerts for category shortages, deadline-confidence gaps, geographic
  uncertainty, source concentration, zero-record anomalies, parser failures,
  stale inventory, and other quality regressions.

The final snapshot reports:

- Jobs: 499
- Grants: 42
- Fellowships: 27
- Hackathons: 12
- Internships: 9
- Scholarships: 3
- Bounties: 2
- Climate-domain records: 8
- Fintech-domain records: 102
- AI-domain records: 158
- Research-domain records: 92

These domain totals include jobs and other opportunity types. They are not
claims that climate, fintech, AI, or research-program inventory is equally
deep or equally actionable.

Active monitoring warnings remain:

- Internship inventory is below the configured floor.
- Scholarship inventory is below the configured floor.
- Fewer than 25% of records have a known deadline.
- 155 records have unknown or low-confidence geographic eligibility.
- The largest source group supplies 55% of inventory.

## Sources

Accepted automated sources:

- Devpost public JSON endpoint, with canonical URL verification.
- RemoteOK public API, with attribution and quality gates.
- Reviewed employer-owned Greenhouse Job Board APIs.
- Reviewed employer-owned Ashby Job Posting APIs.
- Grants.gov Search2 official JSON API.

Accepted directory-only source:

- Manually curated official program-owner and government/university URLs.
  These remain `explore` and cannot satisfy verified coverage.

Deferred:

- Simpler.Grants.gov: promising official structured API, pending credentials,
  duplicate strategy, rate-limit review, and operational ownership.
- DAAD and Erasmus Mundus: official Tier B directories, pending a documented
  feed, permission, and current-cycle verification workflow.
- African Union programs: high-priority official source, pending structured or
  permissioned current-call access and source-specific eligibility parsing.

Not approved for automated ingestion:

- DoraHacks and Encode Club remain permission-required exploration sources.
  No authentication, CAPTCHA, robots control, protected page, or undocumented
  interface was bypassed.

The complete source review is in
[inventory-hardening-research-2026-07-21.md](inventory-hardening-research-2026-07-21.md).

## Deadline And Geography Validation

Production sampling confirmed that:

- Grants.gov records expose exact future deadlines and current-cycle evidence
  when available.
- Grants.gov records with unknown applicant-country eligibility remain
  `explore`, even when their deadline and URL are verified.
- A Nigeria-located employer record can become `apply_now` when the published
  geography supports Nigeria.
- A generic remote employer record with unclear global scope remains
  `explore`.
- No sampled expired or unverified record was promoted to `apply_now`.

## Defects Found And Fixed

1. Production health did not initially require the new
   `inventory_metadata` database column.
   - Added `inventoryMetadataReady` to database readiness and health.
2. Scheduled ingestion could write before applying the new migration.
   - The ingestion workflow now migrates with `seed: false` before ingestion.
3. The migration workflow returned HTTP 401 when both operator keys existed.
   - Admin authorization now accepts either configured operator key.
   - Added route-level regression coverage.

Each shared fix was followed by a complete local verification run, CI, database
migration, ingestion, and production regression sequences.

## Validation

Final local `npm run verify`:

- 156 automated tests passed.
- Service 2's 153-case calibration gate passed.
- Typecheck passed.
- ESLint passed with zero warnings.
- Optimized production build passed.
- PDF and DOCX parsing passed.
- Local production-mode smoke passed.

CI and deployment:

- GitHub Actions run `29821584292` passed for commit `d75e5d4`.
- Scheduled/manual ingestion run `29823188451` migrated and ingested
  successfully.
- Railway health reports PostgreSQL, pgvector, schema, privacy logging, source
  verification, and inventory metadata ready.

External regressions:

- Service 1 Opportunity Finding: 7/7 passed.
- Service 2 Benchmarking & Optimization: 20/20 passed.
- Service 3 Resume Generation: 17/17 passed.
- Legacy recommendation payloads remain compatible.
- Deterministic ranking remains authoritative.
- Free HTTP 200 access remains unchanged.

## Remaining Gaps

- Jobs still dominate the inventory.
- Internships, scholarships, fellowships, hackathons, research placements,
  climate programs, and Africa-accessible funding remain thin.
- Grants.gov improves grant discovery but usually cannot establish that an
  individual applicant in Nigeria or another country is eligible.
- Many employer listings have rolling availability rather than fixed
  deadlines.
- Geographic confidence is still incomplete for 155 records.
- No notification delivery integration was added; alerts are generated in the
  monitoring snapshot and are available to scheduled operational workflows.
- Future source expansion still requires source-specific permission,
  maintenance, deadline, duplicate, and eligibility review.

## Complete Evidence

- [Inventory monitoring snapshot](inventory-monitoring-2026-07-21.json)
- [Inventory source research](inventory-hardening-research-2026-07-21.md)
- [Service 3 and shared test log](service3-test-log.md)
- [Service 1 test log](service1-test-log.md)
- [Service 2 test log](service2-test-log.md)

## Final Decision

**GO for inventory hardening.**

The milestone improves truthfulness, observability, deadline handling,
geographic reasoning, and grant depth without lowering ranking, verification,
or eligibility standards. Continued source expansion remains necessary, but it
does not block Resume Generation.
