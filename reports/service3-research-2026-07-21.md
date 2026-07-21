# Service 3 Research Foundation

Review date: July 21, 2026

## Product Conclusions

- The published target instructions are the primary authority for document
  type, sections, length, formatting, and submission method.
- A conventional private-sector resume is not interchangeable with an
  academic CV, research CV, biosketch, scholarship CV, grant profile,
  fellowship profile, portfolio-oriented design resume, or hackathon/team
  profile.
- Generation must preserve supplied meaning. Missing dates, titles, metrics,
  qualifications, publications, awards, links, and eligibility facts remain
  questions, placeholders, or omissions.
- Government research biosketches require current agency-specific formats.
  Trakr may organize confirmed evidence for a biosketch, but it must not claim
  to produce a certified or submission-ready NIH/NSF form.
- Accessible output should use semantic headings, simple reading order,
  descriptive links, and document formats that remain usable by assistive
  technology.

## Authoritative Sources

| Area | Source | Product use |
| --- | --- | --- |
| Target-specific resumes | Harvard FAS career services, `https://careerservices.fas.harvard.edu/channels/create-a-resume-cv-or-cover-letter/` | Keep the target organization's needs central; do not generate a universal document. |
| Core CV sections | UK National Careers Service, `https://nationalcareers.service.gov.uk/careers-advice/cv-sections` | Supports contact, introduction, education, and work-history intake while allowing target-specific additions. |
| Public-sector evidence | UK Civil Service Careers, `https://www.civil-service-careers.gov.uk/how-to-write-your-cv/` | Evidence should relate to published essential criteria; volunteering and school/college work may be relevant. |
| European CV tooling | Europass, `https://europass.europa.eu/en/create-europass-cv` | Locale-sensitive CV support should not assume one universal layout. |
| Scholarship evidence | Chevening application guidance, `https://www.chevening.org/resource-hub/guidance/prepare-your-application/` | Scholarship artifacts may need leadership, influencing, work-experience, and referee evidence beyond a job resume. |
| NIH biosketch | NIH biosketch format guidance, `https://grants.nih.gov/grants-process/write-application/forms-directory/biosketch` | Biosketches document qualifications for a project role and must follow current NIH instructions. |
| NIH Common Form | NIH Common Forms implementation, `https://grants.nih.gov/policy-and-compliance/implementation-of-new-initiatives-and-policies/common-forms-for-biosketch` | A generated draft cannot replace the required SciENcv/Common Form workflow. |
| NSF biosketch | NSF senior/key personnel documents, `https://www.nsf.gov/funding/senior-personnel-documents` | NSF biosketch structure includes identifying information, preparation, positions, and products; current PAPPG remains authoritative. |
| Web accessibility | W3C WCAG 2.2, `https://www.w3.org/TR/WCAG22/` | UI and rendered document experiences should preserve perceivable, operable, understandable, and robust content. |
| Document accessibility | Section508.gov accessible documents, `https://www.section508.gov/create/documents/` | Prefer semantic Word/document structure and avoid visually complex structures that disrupt reading order. |

## Implemented Rubric

Version: `resume-generation-rubric-2026-07-21`

1. Resolve a target before generation.
2. Select the artifact from explicit target instructions, opportunity type,
   role context, and supplied evidence.
3. Use only explicit, confirmed claims whose evidence ledger permits
   `generation`.
4. Link every non-placeholder applicant statement to claim IDs.
5. Keep target requirements separate from applicant claims.
6. Convert missing facts into focused questions, marked placeholders, or
   omitted unsupported claims.
7. Require final verification of names, dates, titles, organizations,
   qualifications, links, metrics, locale rules, and submission instructions.

## Limitations

- Trakr does not certify compliance with a specific employer ATS.
- Trakr does not produce digitally certified NIH or NSF biosketch forms.
- Generated content is an evidence-linked draft and still requires user review.
- Locale support currently controls artifact choice and explicit output
  metadata; fully rendered jurisdiction-specific templates remain future work.
