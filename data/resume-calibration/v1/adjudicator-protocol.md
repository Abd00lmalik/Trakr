# Service 2 Blinded AI Adjudicator Protocol

Protocol version: `service2-calibration-adjudication-v1`

Adjudicator type: AI

## Independence

The adjudicator may read:

- this protocol;
- the reviewer protocol;
- the authoritative and social-research reports;
- assigned adjudication packets containing the synthetic case and three
  preserved AI reviews;
- `calibrationAdjudicationSchema`.

The adjudicator must remain blind to:

- Trakr output or implementation;
- author-sealed risks;
- system runs;
- comparison reports;
- future regression expectations.

## Decision Method

1. Re-read the target requirements and applicant claims.
2. Compare each reviewer's status, claim links, eligibility decision,
   dimension bands, recommendations, and optimization restrictions.
3. Select the best-supported result or construct a better result.
4. Do not choose a label only because two reviewers used it.
5. Preserve ambiguity when the target or applicant evidence does not support a
   single answer.
6. Use the target and authoritative guidance to resolve conflicts.
7. Put low-consensus, locale-sensitive, profession-sensitive, or materially
   subjective cases in the future qualified-human-review queue.

## Required Distinctions

- `missing` means no evidence was supplied.
- `unverified` means potentially relevant evidence requires confirmation.
- `inferred` means evidence suggests but does not prove the requirement.
- `not_met` requires supplied evidence proving an explicit failure.
- `contradictory` requires materially conflicting supplied evidence.
- Unknown eligibility remains `uncertain`.
- A hard failure cannot be averaged away by writing quality or preferred
  qualifications.
- Adjacent roles require equivalent tasks, methods, and outputs, not a shared
  word.

## Optimization

Optimization may use only allowed, confirmed claim IDs. The adjudicator must
prohibit:

- invented metrics;
- inflated seniority;
- implied missing qualifications;
- participation rewritten as leadership;
- removed uncertainty;
- invented employers, credentials, projects, dates, responsibilities, or
  skills.

Use `clarify_first` when decisive evidence is ambiguous or contradictory. Use
`do_not_optimize` when the request would primarily conceal a proven hard
failure or when no truthful useful rewrite is supported.

## Disagreement Classification

Use one or more of:

- `requirement_extraction_defect`
- `requirement_importance_defect`
- `role_family_classification_defect`
- `eligibility_logic_defect`
- `evidence_extraction_defect`
- `evidence_equivalence_defect`
- `contradiction_detection_defect`
- `scoring_weight_defect`
- `recommendation_defect`
- `optimization_fabrication`
- `optimization_exaggeration`
- `locale_handling_defect`
- `target_type_defect`
- `parsing_defect`
- `prompt_injection_defect`
- `reviewer_disagreement`
- `genuinely_ambiguous_case`

## Output

Return one `calibrationAdjudicationSchema` object for every case. The complete
result must be a JSON array ordered by case ID.

The rationale should explain the decisive evidence or uncertainty. It must not
mention Trakr, hiring probability, a universal ATS score, or unpublished
reviewer reasoning.

The final corpus remains an independently AI-reviewed and adjudicated synthetic
benchmark corpus. It is not human-reviewed or expert-certified.
