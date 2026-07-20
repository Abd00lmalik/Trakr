# Service 1 Inventory Improvement

Date: 2026-07-20

## Scope

This milestone improves inventory depth without changing the public endpoint,
service identity, free access, legacy request behavior, or the deterministic
ranking authority.

The public endpoint remains:

`POST /api/a2mcp/recommend`

## Diagnosis

The prior live baseline contained 77 records:

| Category | Baseline |
| --- | ---: |
| Remote jobs | 51 |
| Hackathons | 12 |
| Grants | 4 |
| Fellowships | 5 |
| Scholarships | 3 |
| Bounties | 2 |
| Internships | 0 |

The shortage was primarily source depth, with secondary taxonomy and
eligibility-classification weaknesses. Ranking alone could not create
responsible matches for missing AI internships, regionally accessible roles,
or research opportunities.

## Sources

### Added

1. Greenhouse employer job boards through the documented Greenhouse Job Board
   API, restricted to a reviewed allowlist of employer-owned boards.
2. Ashby employer job boards through the documented Ashby Public Job Posting
   API, restricted to a reviewed allowlist of employer-owned boards.

Both connectors:

- accept only listed or published records;
- use employer-owned canonical job URLs;
- isolate board failures so a failed board does not deactivate its prior
  records;
- preserve source identity per employer board;
- treat published workplace type and location as authoritative;
- keep required skills empty unless the source provides stronger structured
  evidence;
- sanitize instruction-like description content before it can reach model
  context;
- pass every URL through the existing verification lifecycle.

### Not added

DoraHacks and Encode Club remain permission-required exploration sources.
No protected page scraping, undocumented API reverse engineering, or
unverified automated ingestion was introduced.

## Live Fetch Comparison

The following counts are raw fetched records before URL verification, captured
on 2026-07-20. They show source growth separately from ranking changes.

| Scope | Total | Remote flag | Africa location evidence | Internships | Fellowships |
| --- | ---: | ---: | ---: | ---: | ---: |
| Prior sources | 77 | 77 | 0 | 0 | 5 |
| Greenhouse | 326 | 82 | 84 | 8 | 20 |
| Ashby | 156 | 55 | 52 | 2 | 2 |
| Current total | 559 | 214 | 136 | 10 | 27 |

Current category totals:

| Category | Current |
| --- | ---: |
| Remote jobs | 501 |
| Fellowships | 27 |
| Internships | 10 |
| Hackathons | 12 |
| Grants | 4 |
| Scholarships | 3 |
| Bounties | 2 |

Both new source groups returned without fetch errors during the live
diagnostic. The increase is genuine source inventory growth, not only taxonomy
renaming.

## Verification Audit

A live URL audit of all 559 fetched records used 12 workers and a 4-second
per-URL timeout:

| Result | Count |
| --- | ---: |
| Verified, active | 398 |
| Verified, redirected | 96 |
| Unverified, unreachable | 47 |
| Program directory, active | 3 |
| Program directory, blocked | 1 |
| Program directory, unreachable | 14 |

No inactive or expired listing appeared in the audited results. Unreachable
records remain unverified and cannot become `Apply Now` recommendations.

## Deterministic Ranking Audit

After verification and hard-gate filtering:

- Nigerian student seeking remote AI internships: 0 qualified results.
  This remains an honest inventory gap; no unrelated job or expired listing
  was substituted.
- Early-career fintech applicant in Africa: 3 qualified results.
- AI research applicant in Uganda: 2 verified active results plus one
  exploration directory.
- Climate-only product-design request: generic fintech product-design roles
  are rejected as target-domain mismatches.

The last item exposed a ranking defect during this milestone. It was fixed in
the domain-fit layer and covered by a regression test.

## Local Release Validation

`npm run verify` passed on 2026-07-20:

- 89 automated tests passed;
- typecheck passed;
- ESLint passed with zero warnings;
- optimized Next.js production build passed;
- production-mode smoke test passed;
- ranking benchmark: Precision@3 100%, Precision@5 100%, NDCG@5 97.4%,
  Recall@5 94.4%, irrelevant result rate 0%, false Apply Now rate 0%.

## Remaining Inventory Gaps

- Verified, globally or Africa-eligible AI internships remain sparse.
- Research funding, scholarships, grants, and climate programs still rely
  heavily on curated official directories and need more permissioned or
  official structured feeds.
- Source metadata can establish published location evidence, but it cannot
  independently establish every applicant's work authorization.
- New employer boards require ongoing review, verification, and stale-source
  monitoring.

The correct product behavior for these cases remains an honest limited-result
or no-qualified-match explanation.
