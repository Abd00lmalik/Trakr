# Inventory Hardening Source Research

Review date: July 21, 2026

## Accepted

### Grants.gov Search2

- Tier: A, automated structured source.
- Official documentation:
  `https://www.grants.gov/api/common/search2`
- Endpoint: `https://api.grants.gov/v1/api/search2`
- Decision: accepted with conservative current-cycle filtering, canonical
  detail URLs, verification, and explicit unknown geography.
- Important limitation: Search2 returns historical and forecasted records.
  API presence alone does not establish a current application, deadline, or
  applicant eligibility. Forecasts remain `Explore`; expired and old-cycle
  records are rejected.

## Researched and Deferred

### Simpler.Grants.gov

- Official developer page: `https://simpler.grants.gov/developers`
- The official API supports structured opportunity search and detail access,
  but requires API-key provisioning.
- Decision: high-priority Tier A candidate, deferred until credentials,
  duplicate handling with Grants.gov, production rate limits, and operational
  ownership are approved.

### DAAD Scholarship Database

- Official database: `https://www.daad.de/stipdb-redirect/`
- The directory contains DAAD and selected external scholarship programs.
- Decision: Tier B official directory. No automated ingestion was approved in
  this milestone because a documented public feed/API and stable field-level
  permission model were not established.

### Erasmus Mundus

- Official program pages:
  `https://education.ec.europa.eu/study-in-europe/programmes-and-fields/programmes-by-theme`
- Decision: Tier B official directory. Program pages are useful exploration
  routes, but individual consortium deadlines and eligibility rules vary and
  must be verified at the program owner.

### African Union

- Official internship program: `https://au.int/en/internships`
- Official jobs portal: `https://jobs.au.int/`
- Decision: high-priority Tier B source for Africa-relevant internships,
  fellowships, and calls. Automated ingestion remains deferred pending a
  documented feed/API or explicit permission and a stable current-call parser.
  "African Union" context must not be translated into eligibility for every
  African applicant without published criteria.

### DoraHacks and Encode Club

- Decision: exploration-only.
- No protected page, authentication flow, CAPTCHA, robots control, or
  undocumented interface may be bypassed.
- Promotion requires a documented API, stable official feed, written
  permission, partnership, or equivalent reliable access.

## Priority Order

1. Provision and evaluate the official Simpler.Grants.gov API.
2. Pursue permissioned or structured African Union current-call access.
3. Seek official scholarship feeds or partnerships for DAAD, universities,
   Commonwealth programs, and other program owners.
4. Add source-specific deadline and eligibility verification before counting
   any directory entry as verified coverage.

## Product Rule

Record growth is not the success metric. Verified active coverage, exact
current-cycle deadlines, published geographic eligibility, source diversity,
and safe recommendation state are authoritative.
