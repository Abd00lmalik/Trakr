# Service 2 Research and Rubric Foundation

Date: 2026-07-20

Rubric version: `resume-rubric-2026-07-20`

## Purpose

Service 2 is an application-readiness capability, not a hiring predictor and
not a generic resume score generator. The benchmark compares supplied evidence
with a dated target and reports what is confirmed, inferred, unverified,
missing, contradictory, or not met.

The rubric deliberately does not claim that one resume template, keyword
density, or ATS score predicts an interview. ATS output is limited to
transparent document-readiness heuristics such as extractable sections,
terminology coverage, and target instruction alignment.

## Source Selection

The sources below were reviewed on 2026-07-20. They are used as guidance and
constraints, not as a universal template.

| Source | Use in Trakr | Important limitation |
| --- | --- | --- |
| USAJOBS Help Center, `https://help.usajobs.gov/faq/application/documents` | Shows that some application systems impose target-specific required content and document limits. | Federal applications are not representative of every employer or country. |
| USAJOBS resume help, `https://help.usajobs.gov/how-to/account/documents/resume` | Reinforces that the job announcement controls required resume content and that federal resume handling can have explicit page rules. | Do not apply federal rules to ordinary private-sector applications. |
| UK National Careers Service, `https://nationalcareers.service.gov.uk/careers-advice/cv-sections` | Provides a public baseline for contact details, introduction, education, work history, and references. | UK guidance is not a global formatting law. |
| UK Civil Service Careers, `https://www.civil-service-careers.gov.uk/how-to-write-your-cv/` | Supports mapping skills and experience to essential criteria in an advert, including paid, volunteer, and education experience. | Civil Service scoring and competency language are target-specific. |
| UC Berkeley Career Engagement, `https://career.berkeley.edu/prepare-for-success/resumes/` | Supplies career-center examples and action-oriented resume guidance for students and early-career applicants. | Examples are educational, not evidence that a single template wins. |
| UC Berkeley academic CV overview, `https://career.berkeley.edu/grad-students-postdocs/academic-job-search/the-cv-part-1-overview/` | Supports treating an academic CV as a distinct artifact focused on academic background and accomplishments. | Academic CV expectations vary by discipline and institution. |
| UC Berkeley academic CV elements, `https://career.berkeley.edu/grad-students-postdocs/academic-job-search/the-cv-part-2-elements/` | Supports target-specific ordering and separate treatment of honors, fellowships, publications, and academic evidence. | The target's published instructions remain authoritative. |
| NIH Biosketch guidance, `https://grants.nih.gov/grants-process/write-application/forms-directory/biosketch` | Requires a distinct biosketch workflow for research and grant contexts, with format-controlled sections. | NIH format is not a normal job resume and must not be generalized. |
| NIH Biographical Sketch Common Form, `https://grants.nih.gov/grants-process/write-application/forms-directory/biographical-sketch-common-form` | Supports distinguishing standardized research forms from resumes and CVs. | Current grant instructions and sponsor forms override generic advice. |
| Europass CV, `https://europass.europa.eu/en/create-europass-cv` | Supports locale-aware CV workflows and the fact that users may apply to employment, education, training, or volunteering. | Europass is an option for European contexts, not a requirement for every European application. |
| Microsoft Careers hiring tips, `https://careers.microsoft.com/v2/global/en/hiring-tips` | Supports role-relevant preparation and structured evaluation rather than a promise that a document alone determines selection. | Employer guidance is organization-specific. |
| Microsoft technical interviewing, `https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing` | Supports treating technical evidence and problem-solving as distinct from document terminology. | Interview guidance is not a resume scoring formula. |
| Greenhouse ATS glossary, `https://www.greenhouse.com/resources/glossary/what-is-an-applicant-tracking-system-ats` | Establishes that an ATS is an employer workflow system that stores candidate and application data; it does not establish a universal candidate score. | Vendor material describes the product category and is not neutral hiring research. |
| W3C PDF techniques, `https://www.w3.org/TR/WCAG20-TECHS/pdf` | Provides document accessibility considerations for tagged and readable PDFs. | Accessibility checks do not guarantee an employer's parser behavior. |
| W3C headings and labels, `https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html` | Supports clear headings and labels as readability and accessibility requirements. | Web accessibility guidance is not a substitute for target-specific document rules. |
| Adobe PDF accessibility guidance, `https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html` | Supports checking reading order, tags, and table headers in generated PDFs. | Acrobat checks are one validation tool, not proof of application success. |

## Rubric Model

The benchmark runs in this order:

1. Identify the target type, target source, locale, instructions, and target
   confidence.
2. Extract requirements into stable records with importance and category.
3. Build an evidence map from the supplied resume or structured background.
4. Apply hard eligibility checks separately from alignment scoring.
5. Score transparent dimensions and attach requirement IDs, evidence claim IDs,
   confidence, explanations, and actions.
6. Report limitations and unresolved facts.
7. Offer optimization only after the benchmark is stored in the same trusted
   session.

Requirement statuses:

- `confirmed`: explicit supplied evidence supports the requirement.
- `inferred`: the evidence suggests the requirement but does not prove it.
- `unverified`: a claim or condition was mentioned but needs confirmation.
- `missing`: no supplied evidence supports the requirement.
- `contradictory`: supplied evidence conflicts.
- `not_met`: deterministic evidence shows an explicit failure.

Primary dimensions:

- Basic eligibility.
- Required qualification alignment.
- Preferred qualification alignment.
- Strength of evidence.
- Accomplishments and demonstrated outcomes.
- Structure and machine readability.
- Target terminology alignment.
- Target-specific instructions and document type.

Scores are bounded heuristics. A hard eligibility failure is surfaced directly
and caps the overall alignment score; it is never hidden by a high average.

## Target-Specific Rules

The rubric adds contextual expectations without inventing requirements:

- Technical roles: relevant technical work, projects, repositories, and
  problem-solving evidence where the target asks for them.
- Design roles: portfolio or work-sample evidence when appropriate.
- Research, academic, fellowship, and grant targets: methods, publications,
  writing, contributions, proposal, or funded-project evidence when required
  by the target.
- Scholarships and fellowships: academic, leadership, service, and mission
  evidence only when the published criteria call for it.
- Hackathons and competitions: project, prototype, team, and submission
  evidence when the rules require it.
- Senior roles: scope, leadership, decision-making, and outcomes appropriate
  to the stated level.
- Early-career applicants: coursework, projects, volunteering, research, and
  open-source work may be relevant evidence when the target accepts them.

The target description and official application instructions remain
authoritative. Contextual expectations are not eligibility findings by
themselves.

## Optimization Guardrails

Optimization is evidence-preserving editing:

- It can reorder supported skills and evidence.
- It can suggest section changes and rewrite supplied statements for clarity.
- It can identify terminology that is missing but must not add it as a fact.
- It can ask for a real metric, date, scope, or result.
- It must mark rewritten statements for user confirmation.
- It must never invent an employer, title, degree, certification, date,
  responsibility, project, publication, award, metric, team size, revenue,
  leadership claim, or link.

Prompt-like text inside a resume or target is treated as untrusted content and
is excluded from evidence and generated rewrites.

## Evaluation Plan

The repository uses synthetic, fictional resumes and target snapshots. The
next evaluation expansion should add human-reviewed cases with annotations for
requirement status, evidence claim IDs, hard eligibility findings, and whether
each suggested change is truth-preserving.

Recommended acceptance measures:

- 100% of hard eligibility failures surfaced in labeled cases.
- 0 fabricated claims in optimization outputs.
- 100% of optimization rewrites linked to supplied evidence or explicitly
  marked as requiring confirmation.
- 100% of injected instruction cases contained.
- 100% of benchmark outputs include target, rubric version, score meaning,
  evidence, uncertainty, and limitations.
- At least 95% agreement with expert labels on requirement status before
  expanding model authority.
- ATS language must remain qualified as document-readiness heuristics, never
  as a hiring or interview probability.

Fine-tuning is not justified by the current data. Versioned deterministic
rubrics, retrieval of approved guidance, synthetic cases, and human-reviewed
regression labels provide a more auditable foundation. Fine-tuning can be
reconsidered only after Trakr has rights-cleared, anonymized, sufficiently
large, role-diverse labeled data and a measured improvement over the current
approach.
