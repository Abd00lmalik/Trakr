import { createHash } from "node:crypto";
import { buildNextSteps } from "@/lib/recommendation/action-plan";
import {
  compactProfileForSession,
  compactTargetForSession,
} from "@/lib/companion/session";
import {
  isInstructionLikeContent,
  sanitizeUntrustedValues,
} from "@/lib/security/untrusted-content";
import type {
  CompanionTarget,
  GeneratedDocumentType,
  Opportunity,
  OpportunityCompanionRequest,
  ProfileEvidence,
  ResumeBenchmarkReference,
  ScoredOpportunity,
  StructuredUserProfile,
} from "@/lib/types/opportunities";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ").trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function safeEvidenceValues(values: string[]) {
  return sanitizeUntrustedValues(values);
}

function safeTargetText(value: string) {
  return isInstructionLikeContent(value) ? "" : value;
}

function eligibilityConcerns(opportunity: Opportunity) {
  const concerns = opportunity.eligibility
    .slice(0, 4)
    .map((rule) => `Confirm eligibility: ${rule}`);
  if (opportunity.verificationStatus !== "verified") {
    concerns.unshift("The source is not a verified direct application page.");
  }
  if (!opportunity.isActive) {
    concerns.unshift("The opportunity is not currently active.");
  }
  return concerns;
}

function confidenceScore(
  candidate: ScoredOpportunity,
  completeness: number,
) {
  return Math.round(
    Math.min(
      100,
      candidate.score * 0.55 +
        candidate.qualityScore * 0.25 +
        candidate.opportunity.verificationConfidence * 10 +
        completeness * 0.1,
    ),
  );
}

export function buildOpportunityExplanation(
  candidate: ScoredOpportunity,
  completeness: number,
) {
  return {
    opportunityId: candidate.opportunity.id,
    opportunityTitle: candidate.opportunity.title,
    matchScore: candidate.score,
    confidenceScore: confidenceScore(candidate, completeness),
    whyItMatches: candidate.matchedSignals.slice(0, 6),
    gaps: candidate.missingRequirements.slice(0, 6),
    eligibilityConcerns: eligibilityConcerns(candidate.opportunity),
    recommendedAction: candidate.action,
    nextSteps: buildNextSteps(candidate),
  };
}
function evidenceAssessment(profile: StructuredUserProfile) {
  const results: string[] = [];
  if (profile.workHistory.length) {
    results.push("Work history evidence is present.");
  } else {
    results.push("No work history evidence was provided.");
  }
  if (profile.projects.length) {
    results.push("Project evidence is present.");
  } else {
    results.push("No project evidence was provided.");
  }
  if (profile.links.length) {
    results.push("Portfolio or public proof links are present.");
  } else {
    results.push("No portfolio, GitHub, or public proof link was provided.");
  }
  if (profile.education.length) {
    results.push("Education context is present.");
  }
  return results;
}

export function buildReadinessAssessment(
  candidate: ScoredOpportunity,
  profile: StructuredUserProfile,
) {
  const concerns = eligibilityConcerns(candidate.opportunity);
  const evidence = evidenceAssessment(profile);
  const evidencePenalty =
    (profile.workHistory.length ? 0 : 8) + (profile.links.length ? 0 : 8);
  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      candidate.score -
        candidate.missingRequirements.length * 4 -
        evidencePenalty,
    ),
  );
  const readinessLevel =
    readinessScore >= 78
      ? ("ready" as const)
      : readinessScore >= 58
        ? ("nearly_ready" as const)
        : ("needs_preparation" as const);
  const eligibilityStatus =
    !candidate.opportunity.isActive
      ? ("concern" as const)
      : concerns.length
        ? ("needs_confirmation" as const)
        : ("likely_eligible" as const);

  return {
    opportunityId: candidate.opportunity.id,
    opportunityTitle: candidate.opportunity.title,
    readinessScore,
    readinessLevel,
    strengths: candidate.matchedSignals.slice(0, 6),
    gaps: candidate.missingRequirements.slice(0, 6),
    eligibilityStatus,
    eligibilityConcerns: concerns,
    evidenceAssessment: evidence,
    nextActions: [
      ...candidate.missingRequirements
        .slice(0, 3)
        .map((gap) => `Add truthful evidence or close the gap for ${gap}.`),
      profile.links.length
        ? "Lead with the strongest relevant portfolio proof."
        : "Add a portfolio, GitHub, project, or writing sample that proves the strongest claimed skill.",
      "Confirm every eligibility rule on the official source before applying.",
    ],
  };
}

function keywordSet(values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((value) => normalize(value).split(/\s+/))
        .filter((value) => value.length > 2),
    ),
  ];
}

export const RESUME_RUBRIC_VERSION = "resume-rubric-2026-07-21";
export const RESUME_GENERATION_RUBRIC_VERSION =
  "resume-generation-rubric-2026-07-21";

type RequirementImportance = "required" | "preferred" | "instruction" | "context";
type RequirementCategory =
  | "eligibility"
  | "skill"
  | "experience"
  | "education"
  | "portfolio"
  | "achievement"
  | "instruction"
  | "other";

type TargetRequirement = {
  id: string;
  text: string;
  importance: RequirementImportance;
  category: RequirementCategory;
};

function fingerprint(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("base64url")
    .slice(0, 32);
}

function resumeTarget(
  request: OpportunityCompanionRequest,
  opportunity: Opportunity | null,
) {
  return (
    opportunity?.title ??
    request.target?.role ??
    request.target?.industry ??
    "the selected opportunity"
  );
}

function targetType(
  request: OpportunityCompanionRequest,
  opportunity: Opportunity | null,
) {
  return (
    opportunity?.category ??
    request.target?.opportunityType ??
    (request.target?.role ? "role" : "general_goal")
  );
}

function targetConfidence(
  request: OpportunityCompanionRequest,
  opportunity: Opportunity | null,
) {
  if (opportunity || (request.target?.description && request.target.requirements?.length)) {
    return "high" as const;
  }
  if (
    request.target?.description ||
    request.target?.requirements?.length ||
    (request.target?.role && request.target?.industry)
  ) {
    return "medium" as const;
  }
  return "low" as const;
}

function requirementCategory(text: string): RequirementCategory {
  const value = normalize(text);
  if (
    /\b(eligible|eligibility|citizen|citizenship|resident|residency|visa|work authorization|located|based in|age|enrolled)\b/.test(
      value,
    )
  ) {
    return "eligibility";
  }
  if (/\b(degree|bachelor|master|phd|education|gpa|student)\b/.test(value)) {
    return "education";
  }
  if (
    /\b(years?(?: of [a-z-]+){0,4} experience|senior|lead|manager|professional experience)\b/.test(
      value,
    )
  ) {
    return "experience";
  }
  if (/\b(submit|format|page|deadline|file|pdf|cover letter|statement)\b/.test(value)) {
    return "instruction";
  }
  if (
    /\b(portfolio|case study|reel|github|publication|writing sample|work sample)\b/.test(
      value,
    )
  ) {
    return "portfolio";
  }
  if (/\b(achievement|impact|metric|outcome|award|publication)\b/.test(value)) {
    return "achievement";
  }
  if (keywordSet([text]).length <= 5) return "skill";
  return "other";
}

function requirementImportance(text: string): RequirementImportance {
  const value = normalize(text);
  if (/\b(preferred|nice to have|bonus|desirable)\b/.test(value)) {
    return "preferred";
  }
  if (requirementCategory(text) === "instruction") return "instruction";
  if (/\b(required|must|minimum|need to|eligible|only)\b/.test(value)) {
    return "required";
  }
  return "context";
}

function isHardEligibilityRequirement(requirement: TargetRequirement) {
  const value = normalize(requirement.text);
  return /\b(applicants? must|must be based|minimum gpa|current .*enrollment|currently enrolled|university admission|graduate (degree|education)|completed doctorate|bachelor degree|citizenship|registered organization|available for the full|eligible early career|active professional certification|\d{1,2}\+?\s+years?)\b/.test(
    value,
  );
}

function requirementList(
  request: OpportunityCompanionRequest,
  opportunity: Opportunity | null,
) {
  const values: Array<{ text: string; importance?: RequirementImportance; category?: RequirementCategory }> = [];
  if (opportunity) {
    values.push(
      ...opportunity.eligibility.map((text) => ({
        text,
        importance: "required" as const,
        category: "eligibility" as const,
      })),
      ...opportunity.requiredSkills.map((text) => ({
        text,
        importance: "required" as const,
        category: "skill" as const,
      })),
      ...opportunity.preferredSkills.map((text) => ({
        text,
        importance: "preferred" as const,
        category: "skill" as const,
      })),
    );
  }
  values.push(
    ...(request.target?.requirements ?? [])
      .map(safeTargetText)
      .filter(Boolean)
      .map((text) => ({ text })),
  );
  const description = request.target?.description;
  if (description) {
    values.push(
      ...safeTargetText(description)
        .split(/\r?\n|(?<=[.!?])\s+/)
        .map((text) => text.replace(/^[-*]\s*/, "").trim())
        .filter(
          (text) =>
            text.length >= 8 &&
            /\b(required|must|minimum|preferred|eligible|experience|degree|skills?|portfolio|submit|application)\b/i.test(
              text,
            ),
        )
        .slice(0, 24)
        .map((text) => ({ text })),
    );
  }
  const targetText = normalize(
    [
      request.target?.role,
      request.target?.industry,
      request.target?.opportunityType,
      opportunity?.title,
      opportunity?.category,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const contextualExpectations: string[] = [];
  if (/\b(design|ux|ui|graphic|creative)\b/.test(targetText)) {
    contextualExpectations.push(
      "Target-relevant portfolio or work-sample evidence where appropriate.",
    );
  }
  if (/\b(research|academic|phd|fellowship|grant)\b/.test(targetText)) {
    contextualExpectations.push(
      "Relevant research methods, outputs, publications, writing, or funded-project evidence where appropriate.",
    );
  }
  if (/\b(scholarship|fellowship)\b/.test(targetText)) {
    contextualExpectations.push(
      "Evidence connected to the published academic, leadership, service, or mission criteria.",
    );
  }
  if (/\b(hackathon|competition|challenge)\b/.test(targetText)) {
    contextualExpectations.push(
      "Relevant project, prototype, team, or technical evidence for the challenge.",
    );
  }
  if (/\b(senior|staff|principal|lead|director|head)\b/.test(targetText)) {
    contextualExpectations.push(
      "Evidence of scope, leadership, decision-making, and outcomes appropriate to seniority.",
    );
  }
  values.push(
    ...contextualExpectations.map((text) => ({
      text,
      importance: "context" as const,
      category: requirementCategory(text),
    })),
  );
  if (!values.length) {
    values.push(
      ...keywordSet([
        request.target?.role ?? "",
        request.target?.industry ?? "",
      ]).map((text) => ({
        text,
        importance: "context" as const,
        category: "skill" as const,
      })),
    );
  }

  const seen = new Set<string>();
  return values
    .filter(({ text }) => {
      const key = normalize(text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40)
    .map<TargetRequirement>(({ text, importance, category }, index) => ({
      id: `req_${index + 1}_${fingerprint(text).slice(0, 8)}`,
      text,
      importance: importance ?? requirementImportance(text),
      category: category ?? requirementCategory(text),
    }));
}

function profileEvidenceEntries(
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
) {
  const entries: Array<{
    field: string;
    value: string;
    claimId?: string;
    source: ProfileEvidence["source"];
  }> = [];
  const profileFields = [
    "headline",
    "bio",
    "skills",
    "education",
    "workHistory",
    "projects",
    "certifications",
    "links",
    "location",
    "experienceLevel",
  ];

  for (const item of evidence) {
    if (
      !profileFields.includes(item.field) ||
      !(item.allowedUse ?? []).includes("assessment")
    ) {
      continue;
    }
    const rawValue =
      item.value ??
      profile[item.field as keyof StructuredUserProfile];
    const values =
      typeof rawValue === "string"
        ? [rawValue]
        : Array.isArray(rawValue)
          ? rawValue
          : [];
    for (const value of safeEvidenceValues(values)) {
      entries.push({
        field: item.field,
        value,
        claimId: item.claimId,
        source: item.source,
      });
    }
  }

  return entries;
}

const evidenceConceptPatterns: Array<[string, RegExp]> = [
  ["enrollment", /\b(student|currently enrolled|undergraduate|university admission)\b/],
  ["graduate_degree", /\b(msc|master s|graduate degree|graduate education)\b/],
  ["doctorate", /\b(phd|doctorate|doctoral)\b/],
  ["bachelor_degree", /\b(bsc|ba|beng|bdes|bachelor)\b/],
  ["gpa", /\b(gpa|grade point average)\b/],
  ["testing", /\b(test|tests|testing|playwright|quality assurance|qa)\b/],
  ["backend_api", /\b(backend|server side|node js|rest api|api development|inventory api)\b/],
  ["database", /\b(postgresql|postgres|sql|database|migration)\b/],
  ["full_stack", /\b(full stack|frontend and api|react and node)\b/],
  ["mobile_development", /\b(mobile|flutter|dart|android|ios|application prototype)\b/],
  ["cloud", /\b(cloud|aws|azure|gcp|cloud infrastructure|test environment)\b/],
  ["infrastructure_code", /\b(terraform|cloudformation|pulumi|infrastructure as code|reusable modules)\b/],
  ["monitoring", /\b(monitoring|observability|telemetry|alerting)\b/],
  ["security_monitoring", /\b(siem|security monitoring|security alerts)\b/],
  ["incident_response", /\b(incident response|response playbook)\b/],
  ["data_analysis", /\b(data analysis|sql analysis|analyzed|analysis|dashboard)\b/],
  ["data_communication", /\b(data communication|dashboard|presented|explaining|visualization)\b/],
  ["data_science", /\b(data science|churn model|statistical model|machine learning)\b/],
  ["statistics", /\b(statistics|statistical|churn model|model evaluation)\b/],
  ["python", /\bpython\b/],
  ["javascript", /\b(javascript|typescript|react|node js)\b/],
  ["software_development", /\b(software development|built .*api|packaged inference|application development)\b/],
  ["machine_learning", /\b(machine learning|pytorch|classifier|model deployment|inference)\b/],
  ["experiment_design", /\b(experiment|experimental design|benchmark experiment)\b/],
  ["research_methods", /\b(research methods|survey methods|qualitative interviews|mixed methods|literature review|community health survey|supported .*survey|survey data)\b/],
  ["academic_writing", /\b(academic writing|scientific writing|literature review|dissertation|policy brief)\b/],
  ["publication", /\b(publication|published|journal article|research output)\b/],
  ["smart_contract", /\b(smart contract|solidity|contract test|web3|blockchain)\b/],
  ["security_review", /\b(security review|contract tests? for access control|access control tests?)\b/],
  ["product_delivery", /\b(product delivery|product discovery|roadmap|requirements|api product)\b/],
  ["developer_platform", /\b(developer platform|api products?|api dashboard)\b/],
  ["collaboration", /\b(cross functional|collaboration|coordinated|stakeholder|design and engineering)\b/],
  ["software_testing", /\b(software test|test design|regression plan|playwright|api testing)\b/],
  ["defect_documentation", /\b(defect documentation|bug report|test documentation)\b/],
  ["troubleshooting", /\b(troubleshooting|resolved|account issue|knowledge base)\b/],
  ["customer_communication", /\b(customer communication|customer facing|knowledge base|employee communication|communications|supported outreach)\b/],
  ["cloud_security", /\b(cloud security|aws security|threat modeling|least privilege|iam polic)\b/],
  ["security_automation", /\b(security automation|automated security|security scripting)\b/],
  ["identity_access", /\b(identity and access|iam|access control|least privilege)\b/],
  ["people_management", /\b(people management|managed .*engineers|team management|team development)\b/],
  ["multi_team", /\b(multi team|across .*teams|three .*teams|organizational scope)\b/],
  ["portfolio", /\b(portfolio|case study|reel|work sample)\b/],
  ["fintech", /\b(fintech|payments|financial technology)\b/],
  ["commercial_interiors", /\b(commercial interiors?|workplace interiors?|retail interiors?)\b/],
  ["product_design", /\b(product design|payments onboarding|research to prototype)\b/],
  ["user_research", /\b(user research|usability|interview|research synthesis)\b/],
  ["user_centered", /\b(user centered|observed issues|usability|research to prototype)\b/],
  ["accessibility", /\b(accessibility|accessible|screen reader)\b/],
  ["interface_design", /\b(interface design|responsive interface|component library|ui design)\b/],
  ["design_system", /\b(design systems?|component librar(?:y|ies)|visual systems?)\b/],
  ["visual_system", /\b(visual systems?|brand systems?|nonprofit brand system|logo and typography rules)\b/],
  ["graphic_design", /\b(graphic design|typography|layout|conference identity|print and digital)\b/],
  ["brand_design", /\b(brand identity|brand system|logo|art direction)\b/],
  ["campaign_art_direction", /\b(campaign art direction|campaign creative direction)\b/],
  ["motion_design", /\b(motion design|motion graphics|animation|after effects|storyboard|product explainer)\b/],
  ["three_d_motion", /\b(3d motion|three dimensional motion|3d animation)\b/],
  ["interior_design", /\b(interior design|interior architecture|community library interior)\b/],
  ["space_planning", /\b(space planning|space plan|autocad)\b/],
  ["industrial_design", /\b(industrial design|water filter enclosure|cad)\b/],
  ["physical_prototyping", /\b(physical prototyping|prototyped|prototype|material tradeoff)\b/],
  ["manufacturing", /\b(manufactur(?:e|ing|ability)|design for manufacture|material tradeoffs?)\b/],
  ["policy_research", /\b(policy research|policy analysis|policy brief|stakeholder interview)\b/],
  ["writing_sample", /\b(writing sample|policy brief|newsletter|academic writing)\b/],
  ["data_stewardship", /\b(data stewardship|data management|metadata|data dictionary|reproducibility)\b/],
  ["data_quality", /\b(data quality|validation check|data dictionary)\b/],
  ["research_coordination", /\b(research study coordination|study coordination|coordinated .*study|consent records)\b/],
  ["research_ethics", /\b(research ethics|ethics compliance|consent records)\b/],
  ["research_communication", /\b(research communication|presented themes|research synthesis|presented .*limitations)\b/],
  ["research_leadership", /\b(research leadership|research team leadership|led .*research|directed .*research)\b/],
  ["multi_country", /\b(multi country|five country|regional program)\b/],
  ["regional_policy", /\b(regional policy|region specific policy|cross border policy)\b/],
  ["fair_data", /\b(fair data|findable accessible interoperable reusable|reproducibility)\b/],
  ["community_leadership", /\b(community leadership|community service|coding club|civic literacy|student workshop)\b/],
  ["public_service", /\b(public service|civic literacy|civic engagement)\b/],
  ["community_arts", /\b(community arts|design workshop|arts activity)\b/],
  ["community_climate", /\b(community climate|campus recycling|local climate action)\b/],
  ["climate", /\b(climate|renewable energy|solar|recycling)\b/],
  ["social_impact", /\b(social impact|community engagement|youth skills|participant feedback)\b/],
  ["registered_organization", /\b(registered organization|incorporated organization|organization registration)\b/],
  ["project_proposal", /\b(project proposal|project plan|work plan|implementation plan)\b/],
  ["open_source", /\b(open source|documentation patch|triaged issues|public contribution)\b/],
  ["maintainer", /\b(maintainer|issue triage|triaged issues)\b/],
  ["availability", /\b(available|availability|full program period)\b/],
  ["marketing_analysis", /\b(marketing analysis|campaign analysis|channel performance)\b/],
  ["spreadsheet", /\b(spreadsheets?|excel|financial model|three statement model|reporting)\b/],
  ["spreadsheet_reporting", /\b(spreadsheet reporting|spreadsheets?.*presented|presented.*channel performance)\b/],
  ["crm", /\b(crm|customer relationship management)\b/],
  ["sales", /\b(sales|prospecting|outreach|follow up)\b/],
  ["b2b_sales", /\b(b2b|business to business sales)\b/],
  ["organization", /\b(organizational ability|coordinated|scheduling|action log)\b/],
  ["logistics", /\b(logistics|scheduling|schedule|event procedures|volunteer coordination)\b/],
  ["hr_admin", /\b(hr administration|hr operations|onboarding records|human resource)\b/],
  ["confidential_data", /\b(confidential data|data privacy|onboarding records)\b/],
  ["project_coordination", /\b(project coordination|project planning|coordinated .*project|website relaunch|risk and action log)\b/],
  ["status_reporting", /\b(status reporting|risk and action log|presented .*performance)\b/],
  ["written_communication", /\b(written communication|policy writing|documented .*procedures|policy newsletter|public consultation|knowledge base article)\b/],
  ["customer_relationship", /\b(customer relationship|customer onboarding|onboarded|support checklist)\b/],
  ["saas_onboarding", /\b(saas onboarding|software onboarding|saas\b.*\bonboard|onboard\w*\b.*\bsaas)\b/],
  ["saas_support", /\b(saas support|software as a service support)\b/],
  ["problem_solving", /\b(problem solving|troubleshooting|resolved|support checklist)\b/],
  ["policy_interest", /\b(policy interest|policy writing|public consultation|political science)\b/],
  ["financial_analysis", /\b(financial analysis|financial modeling|budget variance|three statement model|accounting)\b/],
  ["financial_reporting", /\b(financial reporting|financial statements?|management accounts)\b/],
  ["accounting_certification", /\b(accounting certification|certified public accountant|chartered accountant|cpa|acca|aca)\b/],
  ["audit_leadership", /\b(audit leadership|led .*audit|managed .*audit|audit team)\b/],
  ["operations", /\b(operations|process improvement|scheduling|event procedures)\b/],
  ["leadership", /\b(leadership|led|managed|directed|supervised|owned)\b/],
  ["budget", /\b(budget|funding|grant portfolio)\b/],
  ["stakeholder_management", /\b(stakeholder management|partners|partnerships|government and nonprofit)\b/],
  ["donor_funded", /\b(donor funded|grant funded|development partner funded)\b/],
  ["co_funding", /\b(co funding|co-funded|matching funds?)\b/],
  ["clinical_trials", /\b(clinical trials?|randomized clinical study)\b/],
  ["grant_portfolio", /\b(grant portfolio|funding portfolio)\b/],
];

const strictQualifierConcepts = new Set([
  "accounting_certification",
  "audit_leadership",
  "b2b_sales",
  "campaign_art_direction",
  "clinical_trials",
  "co_funding",
  "commercial_interiors",
  "community_climate",
  "donor_funded",
  "grant_portfolio",
  "saas_support",
  "three_d_motion",
]);

const qualifierInferenceConcepts = new Set(["campaign_art_direction"]);

const inferenceOnlyConceptEvidencePatterns: Array<[string, RegExp]> = [
  ["academic_writing", /\bliterature review\b/],
  ["confidential_data", /\bonboarding records?\b/],
  ["data_quality", /\bdata dictionary\b/],
  ["developer_platform", /\b(api products?|api dashboard)\b/],
  ["logistics", /\b(schedule|scheduling|event procedures)\b/],
  ["maintainer", /\b(issue triage|triaged issues)\b/],
  ["manufacturing", /\b(manufacturing methods?|material tradeoffs?)\b/],
  ["public_service", /\bcivic literacy\b/],
  ["security_review", /\b(contract tests? for access control|access control tests?)\b/],
];

const evidenceStopWords = new Set([
  "applicant",
  "candidate",
  "current",
  "required",
  "preferred",
  "experience",
  "evidence",
  "relevant",
  "professional",
  "ability",
  "knowledge",
  "submit",
  "tailored",
  "published",
  "criteria",
  "target",
  "discipline",
  "active",
  "must",
  "have",
  "with",
  "from",
  "this",
  "that",
  "design",
  "development",
  "management",
  "project",
  "program",
  "process",
  "system",
  "communication",
  "analysis",
  "and",
  "or",
  "is",
  "are",
  "of",
]);
const canonicalEvidenceConcepts = new Set(
  evidenceConceptPatterns.map(([concept]) => concept),
);

function stemEvidenceToken(token: string) {
  if (token.length <= 4 || /(?:ss|us|is)$/.test(token)) return token;
  return token
    .replace(/ies$/, "y")
    .replace(/ing$/, "")
    .replace(/ed$/, "")
    .replace(/s$/, "");
}

function evidenceConcepts(value: string) {
  const normalized = normalize(value).replace(/[-/.]/g, " ");
  const concepts = new Set(
    normalized
      .split(/\s+/)
      .filter((token) => !evidenceStopWords.has(token))
      .map(stemEvidenceToken)
      .filter((token) => token.length > 2 && !evidenceStopWords.has(token)),
  );
  for (const [concept, pattern] of evidenceConceptPatterns) {
    if (pattern.test(normalized)) concepts.add(concept);
  }
  return concepts;
}

function semanticEvidenceMatches(
  requirement: TargetRequirement,
  entries: ReturnType<typeof profileEvidenceEntries>,
) {
  const requirementValue = normalize(requirement.text);
  const requirementConcepts = evidenceConcepts(requirement.text);
  return entries
    .filter(
      (entry) =>
        !["headline", "bio", "experienceLevel", "goals", "interests"].includes(
          entry.field,
        ) &&
        !/^(?:no formal employment|no professional certification)/i.test(
          entry.value,
        ),
    )
    .map((entry) => {
      const entryValue = normalize(entry.value);
      const entryConcepts = evidenceConcepts(entry.value);
      const shared = [...requirementConcepts].filter((concept) =>
        entryConcepts.has(concept),
      );
      const exact =
        entryValue.includes(requirementValue) ||
        requirementValue.includes(entryValue);
      const sharedCanonical = shared.some((concept) =>
        canonicalEvidenceConcepts.has(concept),
      );
      return {
        ...entry,
        shared,
        matched: exact || sharedCanonical || shared.length >= 1,
      };
    })
    .filter((entry) => entry.matched);
}

function isInferenceOnlyConceptEvidence(
  entry: ReturnType<typeof semanticEvidenceMatches>[number],
  requirementConcepts: Set<string>,
) {
  const value = normalize(entry.value);
  return inferenceOnlyConceptEvidencePatterns.some(
    ([concept, pattern]) =>
      requirementConcepts.has(concept) && pattern.test(value),
  );
}

function statedYears(values: string[]) {
  const matches = [...values.join(" ").matchAll(
    /\b(\d{1,2})\+?\s+years?(?:\s+of)?\s+(?:(?:relevant|professional)\s+){0,2}experience\b/gi,
  )];
  return matches.length
    ? Math.max(...matches.map((match) => Number.parseInt(match[1], 10)))
    : undefined;
}

function evidenceContradictions(
  entries: ReturnType<typeof profileEvidenceEntries>,
) {
  const contradictions = new Map<string, string>();
  for (const field of ["location", "experienceLevel"] as const) {
    const values = uniqueStrings(
      entries
        .filter(
          (entry) => entry.field === field && entry.source === "explicit",
        )
        .map((entry) => entry.value),
    );
    if (values.length > 1) {
      contradictions.set(
        field,
        `Conflicting ${field === "experienceLevel" ? "experience-level" : field} evidence was supplied: ${values.join(" versus ")}.`,
      );
    }
  }
  const reversedDate = entries.find((entry) => {
    if (!["workHistory", "projects", "education"].includes(entry.field)) {
      return false;
    }
    const match = entry.value.match(
      /\b(20\d{2}|19\d{2})\s*[-–—]\s*(20\d{2}|19\d{2})\b/,
    );
    return Boolean(match && Number(match[1]) > Number(match[2]));
  });
  if (reversedDate) {
    contradictions.set(
      "timeline",
      `A supplied timeline appears reversed or contradictory: ${reversedDate.value}`,
    );
  }
  return contradictions;
}

function explicitRequirementResolution(
  requirement: TargetRequirement,
  profile: StructuredUserProfile,
  entries: ReturnType<typeof profileEvidenceEntries>,
) {
  const text = normalize(requirement.text);
  const profileValues = entries.map((entry) => entry.value);
  const matchingEntries = (pattern: RegExp) =>
    entries.filter((entry) => pattern.test(normalize(entry.value)));
  const result = (
    status: "confirmed" | "missing" | "contradictory" | "not_met" | "unverified",
    explanation: string,
    matched: ReturnType<typeof matchingEntries>,
    score: number,
  ) => ({
    status,
    explanation,
    evidence: uniqueStrings(matched.map((entry) => entry.value)).slice(0, 4),
    evidenceClaimIds: uniqueStrings(
      matched
        .map((entry) => entry.claimId)
        .filter((value): value is string => Boolean(value)),
    ),
    score,
  });
  const yearsRequired = text.match(/\b(\d{1,2})\+?\s+years?/);
  const suppliedYears = statedYears(profileValues);
  if (yearsRequired && suppliedYears !== undefined) {
    const yearEntries = matchingEntries(/\b\d{1,2}\+?\s+years?\b/);
    if (suppliedYears < Number.parseInt(yearsRequired[1], 10)) {
      return result(
        "not_met",
        `The target requires ${yearsRequired[1]} years, while the supplied evidence states ${suppliedYears}.`,
        yearEntries,
        0,
      );
    }
    return result(
      "confirmed",
      `The supplied evidence states ${suppliedYears} years against a requirement of ${yearsRequired[1]} years.`,
      yearEntries,
      100,
    );
  }
  if (
    /\b(senior|staff|principal|lead)\b/.test(text) &&
    ["student", "beginner", "early-career"].includes(
      profile.experienceLevel ?? "",
    )
  ) {
    return result(
      "not_met",
      "The target explicitly requires senior scope, while the supplied experience stage is early career.",
      matchingEntries(/\b(student|beginner|early career)\b/),
      0,
    );
  }
  const locationRules = [
    ["united states", /\b(united states|usa|u\.s\.)\b/i],
    ["united kingdom", /\b(united kingdom|uk|u\.k\.)\b/i],
    ["canada", /\bcanada\b/i],
    ["nigeria", /\bnigeria\b/i],
  ] as const;
  if (profile.location && /\b(only|must be based|resident|residents)\b/.test(text)) {
    for (const [label, pattern] of locationRules) {
      if (pattern.test(requirement.text) && !pattern.test(profile.location)) {
        return result(
          "not_met",
          `The target is restricted to ${label}, while the supplied location is ${profile.location}.`,
          matchingEntries(/\bbased in\b/),
          0,
        );
      }
    }
  }
  if (/\b(enrolled|enrollment|university admission)\b/.test(text)) {
    const negative = matchingEntries(
      /\b(not currently enrolled|completed studies|not enrolled)\b/,
    );
    const negativeValues = new Set(negative.map((entry) => entry.value));
    const positive = matchingEntries(
      /\b(student|currently enrolled|undergraduate student)\b/,
    ).filter((entry) => !negativeValues.has(entry.value));
    if (positive.length && negative.length) {
      return result(
        "contradictory",
        "The supplied education evidence conflicts about current enrollment.",
        [...positive, ...negative],
        20,
      );
    }
    if (negative.length) {
      return result(
        "not_met",
        "The supplied evidence explicitly states that the applicant is not currently enrolled.",
        negative,
        0,
      );
    }
    if (positive.length) {
      return result(
        "confirmed",
        "The supplied education evidence explicitly indicates current student enrollment.",
        positive,
        100,
      );
    }
  }
  if (/\bminimum gpa\b/.test(text)) {
    const required = text.match(/\bminimum gpa (?:of )?(\d(?:\.\d+)?)\b/);
    const gpaEntries = matchingEntries(/\b\d(?:\.\d+)?\s+gpa\b|\bgpa\s+\d(?:\.\d+)?\b/);
    const supplied = gpaEntries
      .flatMap((entry) => [
        ...normalize(entry.value).matchAll(
          /\b(?:gpa\s+)?(\d(?:\.\d+)?)(?:\s+gpa)?\b/g,
        ),
      ])
      .map((match) => Number.parseFloat(match[1]))
      .find((value) => value <= 5);
    if (required && supplied !== undefined) {
      return result(
        supplied >= Number.parseFloat(required[1]) ? "confirmed" : "not_met",
        `The supplied GPA is ${supplied} against a minimum of ${required[1]}.`,
        gpaEntries,
        supplied >= Number.parseFloat(required[1]) ? 100 : 0,
      );
    }
  }
  if (/\bcompleted doctorate\b/.test(text)) {
    const doctorate = matchingEntries(/\b(phd|doctorate|doctoral degree)\b/);
    if (doctorate.length) {
      return result(
        "confirmed",
        "The supplied education evidence states a completed doctorate.",
        doctorate,
        100,
      );
    }
  }
  if (/\b(relevant graduate (degree|education))\b/.test(text)) {
    const graduate = matchingEntries(/\b(msc|master s|graduate degree|phd)\b/);
    if (graduate.length) {
      return result(
        "confirmed",
        "The supplied education evidence states a relevant graduate qualification.",
        graduate,
        100,
      );
    }
  }
  if (/\bbachelor degree\b/.test(text)) {
    const bachelor = matchingEntries(/\b(bsc|ba|beng|bdes|bachelor)\b/);
    if (bachelor.length) {
      return result(
        "confirmed",
        "The supplied education evidence states a bachelor's qualification.",
        bachelor,
        100,
      );
    }
  }
  if (/\bcitizenship\b/.test(text)) {
    const citizenship = matchingEntries(/\b(citizen|citizenship|national of)\b/);
    if (!citizenship.length) {
      return result(
        "unverified",
        "Location does not prove citizenship, so this eligibility rule remains unverified.",
        [],
        35,
      );
    }
  }
  if (/\beligible early[- ]career status\b/.test(text)) {
    return result(
      "unverified",
      "The target does not define enough detail to verify its early-career eligibility boundary.",
      [],
      35,
    );
  }
  if (/\b(active professional certification|licensed|licence)\b/.test(text)) {
    const certification = entries.filter(
      (entry) =>
        entry.field === "certifications" &&
        !/\b(no|none|not listed)\b/.test(normalize(entry.value)),
    );
    if (certification.length) {
      return result(
        "confirmed",
        "A supplied certification directly supports this requirement.",
        certification,
        100,
      );
    }
    return result(
      "missing",
      "No active target-relevant professional certification was supplied.",
      [],
      0,
    );
  }
  if (/\badmission to a relevant graduate program\b/.test(text)) {
    const admission = matchingEntries(
      /\b(admitted|admission offer|accepted into|enrolled in .*(graduate|master|phd))\b/,
    );
    return result(
      admission.length ? "confirmed" : "missing",
      admission.length
        ? "The supplied evidence explicitly confirms admission to a relevant graduate program."
        : "No graduate-program admission evidence was supplied.",
      admission,
      admission.length ? 100 : 0,
    );
  }
  if (/\bavailable for the full program period\b/.test(text)) {
    const availability = matchingEntries(
      /\b(available|availability|can commit|full program period)\b/,
    );
    return result(
      availability.length ? "confirmed" : "missing",
      availability.length
        ? "The supplied evidence explicitly confirms program-period availability."
        : "No explicit availability commitment was supplied.",
      availability,
      availability.length ? 100 : 0,
    );
  }
  if (/\beligible registered organization\b/.test(text)) {
    const registration = matchingEntries(
      /\b(registered organization|incorporated|registration number)\b/,
    );
    return result(
      registration.length ? "confirmed" : "missing",
      registration.length
        ? "The supplied evidence explicitly confirms organization registration."
        : "No organization-registration evidence was supplied.",
      registration,
      registration.length ? 100 : 0,
    );
  }
  if (
    requirement.importance === "required" &&
    /\b(published|publication)\b/.test(text)
  ) {
    const publications = matchingEntries(
      /\b(published|publication|journal article|conference paper)\b/,
    );
    return result(
      publications.length ? "confirmed" : "unverified",
      publications.length
        ? "Supplied publication evidence directly supports this requirement."
        : "Related research evidence exists, but publication evidence is not verified.",
      publications,
      publications.length ? 100 : 35,
    );
  }
  return undefined;
}

function requirementAssessment(
  requirement: TargetRequirement,
  profile: StructuredUserProfile,
  entries: ReturnType<typeof profileEvidenceEntries>,
  contradictions: Map<string, string>,
  profileSource: "resume" | "background" | "request" | undefined,
) {
  if (requirement.importance === "instruction") {
    const requestedDocument = normalize(requirement.text).match(
      /\bsubmit (?:a|an) (resume|cv|academic cv|profile|portfolio|biosketch)\b/,
    )?.[1];
    const suppliedDocument =
      profileSource === "resume"
        ? "resume"
        : profileSource === "background"
          ? "profile"
          : undefined;
    const matches =
      suppliedDocument &&
      (requestedDocument === suppliedDocument ||
        (requestedDocument === "profile" && suppliedDocument === "profile"));
    return {
      id: requirement.id,
      requirement: requirement.text,
      importance: requirement.importance,
      category: requirement.category,
      status: matches ? ("confirmed" as const) : ("not_met" as const),
      evidence: [],
      evidenceClaimIds: [],
      confidence: 0.95,
      score: matches ? 100 : 0,
      explanation: matches
        ? `The supplied intake route matches the requested ${requestedDocument}.`
        : `The supplied intake route does not provide the requested ${requestedDocument ?? "document"}.`,
      actions: matches
        ? ["Keep the document tailored to the published criteria."]
        : [`Prepare the requested ${requestedDocument ?? "application document"} before submission.`],
    };
  }
  const contradiction =
    requirement.category === "eligibility"
      ? contradictions.get("location") ??
        contradictions.get("experienceLevel")
      : requirement.category === "experience"
        ? contradictions.get("experienceLevel") ??
          contradictions.get("timeline")
        : undefined;
  const resolution = explicitRequirementResolution(
    requirement,
    profile,
    entries,
  );
  if (resolution) {
    return {
      id: requirement.id,
      requirement: requirement.text,
      importance: requirement.importance,
      category: requirement.category,
      status: resolution.status,
      evidence: resolution.evidence,
      evidenceClaimIds: resolution.evidenceClaimIds,
      confidence: 0.95,
      score: resolution.score,
      explanation: resolution.explanation,
      actions: [
        resolution.status === "not_met"
          ? "Do not imply that this requirement is met."
          : resolution.status === "contradictory"
            ? "Resolve the conflicting facts before presenting this requirement as satisfied."
            : resolution.status === "confirmed"
              ? "Keep this evidence explicit and accurate."
              : `Supply this only if genuine: ${requirement.text}`,
      ],
    };
  }
  if (contradiction) {
    return {
      id: requirement.id,
      requirement: requirement.text,
      importance: requirement.importance,
      category: requirement.category,
      status: "contradictory" as const,
      evidence: [],
      evidenceClaimIds: [],
      confidence: 0.9,
      score: 20,
      explanation: contradiction,
      actions: [
        "Resolve the conflicting facts before presenting this requirement as satisfied.",
      ],
    };
  }
  if (/\b\d{1,2}\+?\s+years?\b/.test(normalize(requirement.text))) {
    return {
      id: requirement.id,
      requirement: requirement.text,
      importance: requirement.importance,
      category: requirement.category,
      status: "missing" as const,
      evidence: [],
      evidenceClaimIds: [],
      confidence: 0.9,
      score: 0,
      explanation:
        "No supplied evidence states enough years to verify this numeric experience requirement.",
      actions: [
        `Add this only if the user can verify it: ${requirement.text}`,
      ],
    };
  }
  const matches = semanticEvidenceMatches(requirement, entries);
  if (matches.length) {
    const requirementConceptSet = evidenceConcepts(requirement.text);
    const specificRequirementConcepts = new Set(
      [...requirementConceptSet].filter((concept) =>
        canonicalEvidenceConcepts.has(concept),
      ),
    );
    const hasSpecificMatch = (item: (typeof matches)[number]) =>
      item.shared.some((concept) => specificRequirementConcepts.has(concept));
    const artifactRequirement = requirement.category === "portfolio";
    const artifactEvidence = matches.some(
      (item) =>
        ["workHistory", "projects"].includes(item.field) &&
        /\b(portfolio|case study|reel|writing sample|publication)\b/.test(
          normalize(item.value),
        ) &&
        item.field !== "links",
    );
    const appliedExplicit = matches.some(
      (item) =>
        item.source === "explicit" &&
        ["workHistory", "projects", "links", "certifications"].includes(
          item.field,
        ) &&
        !/^coursework includes\b/i.test(item.value),
    );
    const educationExplicit = matches.some(
      (item) => item.source === "explicit" && item.field === "education",
    );
    const inferredEvidence = matches.some(
      (item) =>
        item.source === "inferred" ||
        /^coursework includes\b/i.test(item.value),
    );
    const appliedMatches = matches.filter((item) =>
      ["workHistory", "projects", "certifications"].includes(item.field),
    );
    const specificMatches = matches.filter(hasSpecificMatch);
    const strictRequirementConcepts = new Set(
      [...specificRequirementConcepts].filter((concept) =>
        strictQualifierConcepts.has(concept),
      ),
    );
    const hasRequiredQualifierMatch = (item: (typeof matches)[number]) =>
      strictRequirementConcepts.size === 0 ||
      [...strictRequirementConcepts].every((concept) =>
        item.shared.includes(concept),
      );
    const appliedSpecificMatches = appliedMatches.filter(
      (item) =>
        item.source === "explicit" &&
        hasSpecificMatch(item) &&
        hasRequiredQualifierMatch(item) &&
        !isInferenceOnlyConceptEvidence(item, specificRequirementConcepts),
    );
    const proxySpecificMatches = specificMatches.filter((item) =>
      isInferenceOnlyConceptEvidence(item, specificRequirementConcepts),
    );
    const permitsQualifierInference = [...strictRequirementConcepts].every(
      (concept) => qualifierInferenceConcepts.has(concept),
    );
    const qualifierMatched = specificMatches.some(hasRequiredQualifierMatch);
    const specificSkillMatch = specificMatches.some(
      (item) =>
        item.field === "skills" &&
        item.source === "explicit" &&
        (hasRequiredQualifierMatch(item) || permitsQualifierInference),
    );
    if (requirement.importance === "preferred") {
      const hasCanonicalRequirement = specificRequirementConcepts.size > 0;
      const hasAppliedSupport = hasCanonicalRequirement
        ? appliedSpecificMatches.length > 0
        : appliedMatches.length > 0;
      if (
        !hasAppliedSupport &&
        (specificSkillMatch || proxySpecificMatches.length > 0)
      ) {
        return {
          id: requirement.id,
          requirement: requirement.text,
          importance: requirement.importance,
          category: requirement.category,
          status: "inferred" as const,
          evidence: uniqueStrings(
            specificMatches.map((item) => item.value),
          ).slice(0, 4),
          evidenceClaimIds: uniqueStrings(
            specificMatches
              .map((item) => item.claimId)
              .filter((value): value is string => Boolean(value)),
          ),
          confidence: 0.7,
          score: 65,
          explanation:
            "The supplied skills are relevant, but applied evidence for this preference is limited.",
          actions: [
            `Add applied evidence only if genuine: ${requirement.text}`,
          ],
        };
      }
      if (!hasAppliedSupport) {
        return {
          id: requirement.id,
          requirement: requirement.text,
          importance: requirement.importance,
          category: requirement.category,
          status: "missing" as const,
          evidence: [],
          evidenceClaimIds: [],
          confidence: 0.85,
          score: 0,
          explanation:
            "No applied evidence demonstrates this preferred qualification.",
          actions: [
            `Add this only if the user can provide genuine evidence: ${requirement.text}`,
          ],
        };
      }
    }
    if (
      strictRequirementConcepts.size > 0 &&
      !qualifierMatched &&
      !permitsQualifierInference
    ) {
      return {
        id: requirement.id,
        requirement: requirement.text,
        importance: requirement.importance,
        category: requirement.category,
        status: "missing" as const,
        evidence: [],
        evidenceClaimIds: [],
        confidence: 0.9,
        score: 0,
        explanation:
          "The supplied evidence is from an adjacent domain and does not establish this qualified requirement.",
        actions: [
          `Add this only if the user can provide target-specific evidence: ${requirement.text}`,
        ],
      };
    }
    if (
      profileSource === "background" &&
      /\b(project evidence|contributions|leadership|portfolio|case study|reel)\b/.test(
        normalize(requirement.text),
      ) &&
      !appliedExplicit
    ) {
      return {
        id: requirement.id,
        requirement: requirement.text,
        importance: requirement.importance,
        category: requirement.category,
        status: "unverified" as const,
        evidence: uniqueStrings(matches.map((item) => item.value)).slice(0, 4),
        evidenceClaimIds: uniqueStrings(
          matches
            .map((item) => item.claimId)
            .filter((value): value is string => Boolean(value)),
        ),
        confidence: 0.7,
        score: 35,
        explanation:
          "Related background evidence exists, but ownership, scope, or the required artifact is not verified.",
        actions: [
          `Clarify direct evidence for: ${requirement.text}`,
        ],
      };
    }
    const hasCanonicalRequirement = specificRequirementConcepts.size > 0;
    const directAppliedEvidence = hasCanonicalRequirement
      ? appliedSpecificMatches.length > 0
      : appliedExplicit;
    if (artifactRequirement && !artifactEvidence) {
      const authoredArtifactEvidence = appliedSpecificMatches.some((item) =>
        /\b(wrote|authored|produced|published|created|designed|animated|prototyped)\b/.test(
          normalize(item.value),
        ),
      );
      const artifactStatus =
        requirement.importance === "preferred" && authoredArtifactEvidence
          ? ("inferred" as const)
          : appliedSpecificMatches.length > 0 ||
              matches.some((item) => item.field === "links")
            ? ("unverified" as const)
            : ("missing" as const);
      return {
        id: requirement.id,
        requirement: requirement.text,
        importance: requirement.importance,
        category: requirement.category,
        status: artifactStatus,
        evidence: uniqueStrings(matches.map((item) => item.value)).slice(0, 4),
        evidenceClaimIds: uniqueStrings(
          matches
            .map((item) => item.claimId)
            .filter((value): value is string => Boolean(value)),
        ),
        confidence: artifactStatus === "missing" ? 0.9 : 0.75,
        score:
          artifactStatus === "inferred"
            ? 65
            : artifactStatus === "unverified"
              ? 35
              : 0,
        explanation:
          artifactStatus === "inferred"
            ? "Authored work may provide a suitable sample, but the requested artifact is not explicitly identified."
            : artifactStatus === "unverified"
              ? "Related work or a link is supplied, but the requested artifact cannot be verified from the available evidence."
              : "No requested portfolio, reel, case study, or work sample was supplied.",
        actions: [
          artifactStatus === "missing"
            ? `Provide the requested artifact if available: ${requirement.text}`
            : `Confirm which supplied work satisfies: ${requirement.text}`,
        ],
      };
    }
    const source =
      directAppliedEvidence ||
      (requirement.category === "education" && educationExplicit)
        ? ("confirmed" as const)
        : inferredEvidence || matches.some((item) => item.source === "explicit")
          ? ("inferred" as const)
          : ("unverified" as const);
    return {
      id: requirement.id,
      requirement: requirement.text,
      importance: requirement.importance,
      category: requirement.category,
      status: source,
      evidence: uniqueStrings(matches.map((item) => item.value)).slice(0, 4),
      evidenceClaimIds: uniqueStrings(
        matches
          .map((item) => item.claimId)
          .filter((value): value is string => Boolean(value)),
      ),
      confidence: source === "confirmed" ? 0.9 : 0.75,
      score:
        source === "confirmed"
          ? 100
          : source === "inferred"
            ? 65
            : 35,
      explanation:
        source === "confirmed"
          ? "Supplied profile or resume evidence directly supports this requirement."
          : source === "inferred"
            ? "Supplied evidence is relevant but does not fully establish the required scope."
            : "Related evidence exists, but the required artifact or qualification is not verified.",
      actions: [
        source === "confirmed"
          ? "Keep the strongest relevant evidence close to this requirement in the application document."
          : `Clarify or provide direct evidence for: ${requirement.text}`,
      ],
    };
  }
  const status = "missing" as const;
  return {
    id: requirement.id,
    requirement: requirement.text,
    importance: requirement.importance,
    category: requirement.category,
    status,
    evidence: [],
    evidenceClaimIds: [],
    confidence: 0.8,
    score: 0,
    explanation: "No supplied evidence demonstrates this item.",
    actions: [
      `Add this only if the user can provide genuine evidence: ${requirement.text}`,
    ],
  };
}

function average(values: number[], fallback = 50) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : fallback;
}

function claimIdsFor(evidence: ProfileEvidence[], fields: string[]) {
  return uniqueStrings(
    evidence
      .filter((item) => fields.includes(item.field))
      .map((item) => item.claimId)
      .filter((value): value is string => Boolean(value)),
  );
}

function optimizationValues(
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
  field: keyof StructuredUserProfile,
) {
  const values = evidence
    .filter(
      (item) =>
        item.field === field &&
        item.source === "explicit" &&
        item.confirmed !== false &&
        (item.allowedUse ?? []).includes("optimization"),
    )
    .flatMap((item) => {
      const value = item.value ?? profile[field];
      return typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value
          : [];
    });
  return safeEvidenceValues(uniqueStrings(values));
}

function optimizationProfile(
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
): StructuredUserProfile {
  const scalar = (
    field: "headline" | "bio" | "location" | "timezone",
  ) => optimizationValues(profile, evidence, field).at(-1);
  return {
    name: optimizationValues(profile, evidence, "name").at(-1),
    headline: scalar("headline"),
    bio: scalar("bio"),
    location: scalar("location"),
    timezone: scalar("timezone"),
    experienceLevel: profile.experienceLevel,
    skills: optimizationValues(profile, evidence, "skills"),
    interests: optimizationValues(profile, evidence, "interests"),
    goals: optimizationValues(profile, evidence, "goals"),
    education: optimizationValues(profile, evidence, "education"),
    workHistory: optimizationValues(profile, evidence, "workHistory"),
    projects: optimizationValues(profile, evidence, "projects"),
    certifications: optimizationValues(profile, evidence, "certifications"),
    links: optimizationValues(profile, evidence, "links"),
  };
}

function optimizationClaimIds(evidence: ProfileEvidence[], fields: string[]) {
  return uniqueStrings(
    evidence
      .filter(
        (item) =>
          fields.includes(item.field) &&
          item.source === "explicit" &&
          item.confirmed !== false &&
          (item.allowedUse ?? []).includes("optimization"),
      )
      .map((item) => item.claimId)
      .filter((value): value is string => Boolean(value)),
  );
}

function optimizationClaimIdsForValue(
  evidence: ProfileEvidence[],
  field: string,
  value: string,
) {
  const target = normalize(value);
  return uniqueStrings(
    evidence
      .filter(
        (item) =>
          item.field === field &&
          item.source === "explicit" &&
          item.confirmed !== false &&
          (item.allowedUse ?? []).includes("optimization"),
      )
      .filter((item) => {
        const itemValues =
          typeof item.value === "string"
            ? [item.value]
            : Array.isArray(item.value)
              ? item.value
              : [];
        return itemValues.some((itemValue) => normalize(itemValue) === target);
      })
      .map((item) => item.claimId)
      .filter((claimId): claimId is string => Boolean(claimId)),
  );
}

function parseabilityScore(profile: StructuredUserProfile) {
  return Math.min(
    100,
    35 +
      (profile.headline ? 10 : 0) +
      (profile.skills.length ? 15 : 0) +
      (profile.workHistory.length ? 15 : 0) +
      (profile.projects.length ? 10 : 0) +
      (profile.education.length ? 10 : 0) +
      (profile.links.length ? 5 : 0),
  );
}

export function buildResumeBenchmark(
  request: OpportunityCompanionRequest,
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
  opportunity: Opportunity | null,
) {
  const target = resumeTarget(request, opportunity);
  const requirements = requirementList(request, opportunity);
  const entries = profileEvidenceEntries(profile, evidence);
  const contradictions = evidenceContradictions(entries);
  const requestContext =
    request.context &&
    typeof request.context === "object" &&
    "profileSource" in request.context
      ? request.context
      : undefined;
  const assessments = requirements.map((requirement) =>
    requirementAssessment(
      requirement,
      profile,
      entries,
      contradictions,
      requestContext?.profileSource,
    ),
  );
  const required = assessments.filter((item) => item.importance === "required");
  const preferred = assessments.filter((item) => item.importance === "preferred");
  const hardRequirementIds = new Set(
    requirements
      .filter(isHardEligibilityRequirement)
      .map((requirement) => requirement.id),
  );
  const hardAssessments = assessments.filter((item) =>
    hardRequirementIds.has(item.id),
  );
  const failures = hardAssessments
    .filter((item) => item.status === "not_met")
    .map((item) => item.explanation);
  const unknowns = hardAssessments
    .filter((item) =>
      ["missing", "unverified", "inferred", "contradictory"].includes(
        item.status,
      ),
    )
    .map((item) => item.requirement);
  const requiredScore = average(required.map((item) => item.score), 65);
  const preferredScore = average(preferred.map((item) => item.score), 60);
  const evidenceStrength = Math.min(
    100,
    (profile.workHistory.length ? 30 : 0) +
      (profile.projects.length ? 25 : 0) +
      (profile.links.length ? 15 : 0) +
      (profile.education.length ? 15 : 0) +
      (profile.certifications.length ? 10 : 0),
  );
  const accomplishmentScore = Math.min(
    100,
    [...profile.workHistory, ...profile.projects].filter((item) =>
      /\b(\d+|%|increased|reduced|improved|built|launched|published|led|delivered)\b/i.test(
        item,
      ),
    ).length * 20,
  );
  const parseability = parseabilityScore(profile);
  const terminologyScore = average(
    assessments
      .filter((item) => item.category === "skill")
      .map((item) => item.score),
    55,
  );
  const instructionScore = average(
    assessments
      .filter((item) => item.importance === "instruction")
      .map((item) => item.score),
    70,
  );
  let overallAlignmentScore = Math.round(
    requiredScore * 0.35 +
      preferredScore * 0.1 +
      evidenceStrength * 0.2 +
      accomplishmentScore * 0.1 +
      parseability * 0.1 +
      terminologyScore * 0.1 +
      instructionScore * 0.05,
  );
  if (failures.length) overallAlignmentScore = Math.min(overallAlignmentScore, 45);
  const matchedKeywords = uniqueStrings(
    assessments
      .filter((item) => item.status === "confirmed")
      .map((item) => item.requirement),
  );
  const missingKeywords = uniqueStrings(
    assessments
      .filter((item) => item.status !== "confirmed")
      .map((item) => item.requirement),
  );
  const benchmarkId = `bench_${fingerprint({
    requirements: assessments.map((item) => [item.requirement, item.status]),
    profile: compactProfileForSession(profile),
    rubric: RESUME_RUBRIC_VERSION,
    canonicalTarget: compactTargetForSession(request.target),
  })}`;
  const dimensions = [
    {
      id: "eligibility",
      label: "Basic eligibility",
      score: failures.length ? 0 : unknowns.length ? 60 : 100,
      confidence: failures.length ? 0.95 : 0.75,
      explanation: failures.length
        ? "At least one explicit eligibility or experience requirement is not met."
        : unknowns.length
          ? "No hard failure is proven, but some requirements remain unverified."
          : "Supplied evidence supports the evaluated eligibility requirements.",
      requirementIds: hardAssessments.map((item) => item.id),
      evidenceClaimIds: claimIdsFor(evidence, ["location", "experienceLevel", "education"]),
      actions: failures.length
        ? ["Do not hide the eligibility failure inside the average score."]
        : ["Confirm all eligibility rules on the official target page."],
    },
    {
      id: "required_alignment",
      label: "Required qualification alignment",
      score: requiredScore,
      confidence: required.length ? 0.85 : 0.5,
      explanation: `${required.filter((item) => item.status === "confirmed").length} of ${required.length} required items have supplied supporting evidence.`,
      requirementIds: required.map((item) => item.id),
      evidenceClaimIds: uniqueStrings(required.flatMap((item) => item.evidenceClaimIds)),
      actions: required
        .filter((item) => item.status !== "confirmed")
        .slice(0, 3)
        .map((item) => `Verify or address: ${item.requirement}`),
    },
    {
      id: "evidence_strength",
      label: "Strength of evidence",
      score: evidenceStrength,
      confidence: 0.9,
      explanation: "Measures whether claims are supported by work, projects, education, certifications, and public proof.",
      requirementIds: [],
      evidenceClaimIds: claimIdsFor(evidence, ["workHistory", "projects", "education", "certifications", "links"]),
      actions: profile.links.length
        ? ["Prioritize the strongest target-relevant proof."]
        : ["Add a genuine portfolio, publication, GitHub, writing sample, or project link when relevant."],
    },
    {
      id: "accomplishments",
      label: "Accomplishments and demonstrated outcomes",
      score: accomplishmentScore,
      confidence: 0.8,
      explanation: "Rewards supplied action and outcome evidence; missing metrics are not invented.",
      requirementIds: [],
      evidenceClaimIds: claimIdsFor(evidence, ["workHistory", "projects"]),
      actions: ["Add real scope, outcome, or metric only when the user can verify it."],
    },
    {
      id: "structure",
      label: "Structure and machine readability",
      score: parseability,
      confidence: 0.75,
      explanation: "A transparent document-structure heuristic, not a prediction about any ATS or employer.",
      requirementIds: [],
      evidenceClaimIds: [],
      actions: ["Use clear section headings, conventional chronology, readable text, and the target's requested file format."],
    },
    {
      id: "terminology",
      label: "Target terminology alignment",
      score: terminologyScore,
      confidence: requirements.length ? 0.8 : 0.45,
      explanation: "Checks whether supported target terminology appears in supplied evidence without keyword stuffing.",
      requirementIds: assessments
        .filter((item) => item.category === "skill")
        .map((item) => item.id),
      evidenceClaimIds: claimIdsFor(evidence, ["skills", "workHistory", "projects"]),
      actions: ["Use target terminology only where the underlying fact is true."],
    },
  ];

  return {
    benchmarkId,
    rubricVersion: RESUME_RUBRIC_VERSION,
    target,
    targetType: targetType(request, opportunity),
    targetConfidence: targetConfidence(request, opportunity),
    scoreMeaning:
      "Scores are transparent application-document heuristics, not hiring predictions and not a universal ATS score.",
    overallAlignmentScore,
    atsReadinessScore: Math.round((parseability + terminologyScore) / 2),
    parseabilityScore: parseability,
    eligibility: {
      status: failures.length
        ? ("not_met" as const)
        : unknowns.length
          ? ("unclear" as const)
          : required.length
            ? ("meets" as const)
            : ("likely" as const),
      failures,
      unknowns: unknowns.slice(0, 10),
    },
    requirements: assessments,
    dimensions,
    matchedKeywords: matchedKeywords.slice(0, 12),
    missingKeywords: missingKeywords.slice(0, 12),
    positioningStrengths: [
      profile.headline ? `Clear current positioning: ${profile.headline}.` : "",
      profile.skills.length
        ? `Relevant skills are available to prioritize: ${profile.skills.slice(0, 6).join(", ")}.`
        : "",
      profile.links.length ? "Public proof links can support the application." : "",
      profile.projects.length
        ? "Project evidence can support capability claims."
        : "",
    ].filter(Boolean),
    concerns: [
      ...contradictions.values(),
      !profile.workHistory.length
        ? "No verified work-history entries were provided, so experience claims cannot be strengthened yet."
        : "",
      !profile.links.length
        ? "No portfolio or public proof link was provided."
        : "",
      ...missingKeywords.slice(0, 5).map(
        (keyword) =>
          `The target emphasizes ${keyword}; include it only if the user's real experience supports it.`,
      ),
    ].filter(Boolean),
    priorityActions: [
      ...failures.map((failure) => `Resolve or acknowledge eligibility: ${failure}`),
      ...assessments
        .filter((item) => item.importance === "required" && item.status !== "confirmed")
        .slice(0, 4)
        .map((item) => item.actions[0]),
      ...(profile.workHistory.length || profile.projects.length
        ? ["Move the strongest target-relevant evidence earlier in the document."]
        : ["Supply genuine work, project, coursework, volunteer, or research evidence before optimization."]),
    ].filter(Boolean),
    limitations: [
      targetConfidence(request, opportunity) === "low"
        ? "The target is underspecified, so this benchmark is necessarily generic."
        : "",
      "Trakr cannot know how a specific employer configures its ATS or hiring process.",
      "Unknown information remains unknown and does not count as confirmed evidence.",
    ].filter(Boolean),
    factualIntegrity:
      "This benchmark uses only supplied profile and resume facts. Missing keywords are gaps to verify, not claims to add automatically.",
  };
}

export function buildResumeOptimization(
  request: OpportunityCompanionRequest,
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
  opportunity: Opportunity | null,
) {
  const benchmark = buildResumeBenchmark(request, profile, evidence, opportunity);
  const supported = optimizationProfile(profile, evidence);
  const target = benchmark.target;
  const skillsOrder = uniqueStrings([
    ...benchmark.matchedKeywords.filter((keyword) =>
      supported.skills.some((skill) =>
        normalize(skill).includes(normalize(keyword)),
      ),
    ),
    ...supported.skills,
  ]);
  const identity =
    supported.headline ??
    (skillsOrder.length
      ? `${skillsOrder.slice(0, 2).join(" and ")} profile`
      : "Application profile");
  const domain = uniqueStrings(supported.interests).slice(0, 3).join(", ");
  const professionalSummary = [
    identity,
    skillsOrder.length
      ? `with supplied skills including ${skillsOrder.slice(0, 5).join(", ")}`
      : "",
    domain ? `interested in ${domain}` : "",
    `seeking to contribute to ${target}`,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .concat(".");

  return {
    benchmarkId: benchmark.benchmarkId,
    rubricVersion: benchmark.rubricVersion,
    target,
    optimizedHeadline: [
      identity,
      ...skillsOrder.slice(0, 3).filter(
        (skill) => !normalize(identity).includes(normalize(skill)),
      ),
    ].join(" | "),
    professionalSummary,
    skillsOrder,
    experienceGuidance:
      [...supported.workHistory, ...supported.projects].length
      ? [...supported.workHistory, ...supported.projects].map(
          (entry) =>
            `Keep this experience factual, then lead with the most relevant action, evidence, and outcome: ${entry}`,
        )
      : [
          "No experience bullets were generated because no verified work history was provided.",
          "Add genuine projects, coursework, volunteer work, open-source contributions, or employment before requesting bullet rewrites.",
        ],
    prioritizedChanges: benchmark.priorityActions.slice(0, 8).map(
      (recommendation, index) => ({
        priority:
          index === 0 && benchmark.eligibility.failures.length
            ? ("critical" as const)
            : index < 3
              ? ("high" as const)
              : ("medium" as const),
        section:
          benchmark.eligibility.failures.length && index === 0
            ? "Eligibility"
            : "Resume content",
        recommendation,
        reason:
          "This change follows from the target-specific benchmark and supplied evidence.",
        evidenceClaimIds: optimizationClaimIds(evidence, [
          "skills",
          "workHistory",
          "projects",
          "education",
        ]),
      }),
    ),
    sectionRewrites: [
      ...supported.workHistory.map((entry) => ({
        section: "Work history",
        original: entry,
        suggested: entry
          .replace(/^I\s+/i, "")
          .replace(/^Worked on\b/i, "Contributed to")
          .replace(/^Helped with\b/i, "Supported")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/[.;]?$/, "."),
        evidenceClaimIds: optimizationClaimIdsForValue(
          evidence,
          "workHistory",
          entry,
        ),
        requiresConfirmation: true,
      })),
      ...supported.projects.map((entry) => ({
        section: "Projects",
        original: entry,
        suggested: entry
          .replace(/^I\s+/i, "")
          .replace(/^Worked on\b/i, "Built")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/[.;]?$/, "."),
        evidenceClaimIds: optimizationClaimIdsForValue(
          evidence,
          "projects",
          entry,
        ),
        requiresConfirmation: true,
      })),
    ].slice(0, 12),
    keywordsToUse: uniqueStrings([
      ...benchmark.matchedKeywords,
      ...benchmark.missingKeywords.filter((keyword) =>
        supported.skills.some((skill) =>
          normalize(skill).includes(normalize(keyword)),
        ),
      ),
    ]),
    unsupportedClaims: benchmark.missingKeywords.filter(
      (keyword) =>
        !supported.skills.some((skill) =>
          normalize(skill).includes(normalize(keyword)),
        ),
    ),
    verificationChecklist: [
      "Confirm every rewritten line accurately describes work the user actually performed.",
      "Confirm all dates, titles, employers, degrees, certifications, links, and locations.",
      "Add metrics only when the user can provide a real, supportable figure.",
      "Follow the target's explicit document and submission instructions.",
    ],
    factualIntegrity:
      "Use only claims supported by the verified profile, resume, portfolio, or user-confirmed experience. Do not add unsupported jobs, degrees, projects, metrics, certifications, or skills.",
  };
}

function generationValues(
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
  field: keyof StructuredUserProfile,
) {
  const supplied = evidence
    .filter(
      (item) =>
        item.field === field &&
        item.source === "explicit" &&
        item.confirmed !== false &&
        (item.allowedUse ?? []).includes("generation"),
    )
    .flatMap((item) => {
      const value = item.value ?? profile[field];
      return typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value
          : [];
    });
  return safeEvidenceValues(uniqueStrings(supplied));
}

function generationClaimIdsForValue(
  evidence: ProfileEvidence[],
  field: string,
  value: string,
) {
  const normalized = normalize(value);
  return uniqueStrings(
    evidence
      .filter(
        (item) =>
          item.field === field &&
          item.source === "explicit" &&
          item.confirmed !== false &&
          (item.allowedUse ?? []).includes("generation"),
      )
      .filter((item) => {
        const values =
          typeof item.value === "string"
            ? [item.value]
            : Array.isArray(item.value)
              ? item.value
              : [];
        return values.some((candidate) => normalize(candidate) === normalized);
      })
      .map((item) => item.claimId)
      .filter((claimId): claimId is string => Boolean(claimId)),
  );
}

function requestedDocumentType(
  request: OpportunityCompanionRequest,
  profile: StructuredUserProfile,
  opportunity: Opportunity | null,
): {
  documentType: GeneratedDocumentType;
  reason: string;
} {
  if (request.generationPreferences?.documentType) {
    return {
      documentType: request.generationPreferences.documentType,
      reason:
        "The caller explicitly selected this document type for the current target.",
    };
  }
  const target = normalize(
    [
      opportunity?.title,
      request.target?.role,
      request.target?.description,
      ...(request.target?.requirements ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  const type = opportunity?.category ?? request.target?.opportunityType;

  if (/\b(biosketch|sci?encv|nih biosketch|nsf biosketch)\b/.test(target)) {
    return {
      documentType: "biosketch",
      reason: "The target explicitly requests a biosketch-style artifact.",
    };
  }
  if (type === "scholarship") {
    return {
      documentType: "scholarship_cv",
      reason:
        "The target is a scholarship, so education, leadership, service, and achievements should be foregrounded.",
    };
  }
  if (type === "grant") {
    return {
      documentType: "grant_profile",
      reason:
        "The target is a grant or funded program, so relevant expertise, projects, research, and supported outcomes should lead.",
    };
  }
  if (type === "fellowship") {
    return {
      documentType: "fellowship_profile",
      reason:
        "The target is a fellowship, which calls for a focused profile spanning qualifications, evidence, and purpose-relevant work.",
    };
  }
  if (type === "hackathon" || type === "web3_bounty") {
    return {
      documentType: /\bteam\b/.test(target)
        ? "team_member_profile"
        : "hackathon_profile",
      reason:
        "The target is a competition-style application where projects, skills, repositories, and team contribution matter most.",
    };
  }
  if (type === "internship") {
    return {
      documentType: "internship_resume",
      reason:
        "The target is an internship, so education, projects, coursework-level evidence, and early experience should be prioritized.",
    };
  }
  if (
    /\b(academic cv|faculty|lecturer|professor|postdoctoral|postdoc)\b/.test(
      target,
    )
  ) {
    return {
      documentType: "academic_cv",
      reason:
        "The target is academic and should preserve research, publications, teaching-adjacent work, and complete scholarly evidence.",
    };
  }
  if (
    /\b(research cv|research fellow|research scientist|research assistant|research role)\b/.test(
      target,
    )
  ) {
    return {
      documentType: "research_cv",
      reason:
        "The target and supplied evidence are research-oriented, so research activity and publications should be foregrounded.",
    };
  }
  if (
    /\b(product design|ux|ui|graphic design|brand design|motion design|portfolio)\b/.test(
      target,
    )
  ) {
    return {
      documentType: "design_portfolio_resume",
      reason:
        "The target is design-oriented and should connect concise experience evidence with portfolio or work-sample links.",
    };
  }
  if (
    !profile.workHistory.length &&
    profile.projects.length &&
    /\b(software|developer|engineering|data|machine learning|cybersecurity|blockchain|web3)\b/.test(
      target,
    )
  ) {
    return {
      documentType: "technical_project_resume",
      reason:
        "The applicant has stronger project evidence than formal employment for a technical target.",
    };
  }
  return {
    documentType: "private_sector_resume",
    reason:
      "The target is a conventional professional role without a published requirement for a different artifact.",
  };
}

function documentSectionOrder(documentType: GeneratedDocumentType) {
  const common = [
    "identity",
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "research",
    "publications",
    "leadership",
    "volunteer",
    "achievements",
    "awards",
    "certifications",
    "links",
  ];
  const orders: Partial<Record<GeneratedDocumentType, string[]>> = {
    internship_resume: [
      "identity",
      "summary",
      "education",
      "skills",
      "projects",
      "experience",
      "leadership",
      "volunteer",
      "achievements",
      "links",
    ],
    academic_cv: [
      "identity",
      "education",
      "research",
      "publications",
      "experience",
      "projects",
      "awards",
      "leadership",
      "skills",
      "certifications",
      "links",
    ],
    research_cv: [
      "identity",
      "summary",
      "research",
      "publications",
      "education",
      "experience",
      "projects",
      "skills",
      "awards",
      "links",
    ],
    scholarship_cv: [
      "identity",
      "summary",
      "education",
      "leadership",
      "volunteer",
      "achievements",
      "awards",
      "projects",
      "skills",
      "links",
    ],
    fellowship_profile: [
      "identity",
      "summary",
      "experience",
      "research",
      "projects",
      "leadership",
      "volunteer",
      "achievements",
      "education",
      "skills",
      "links",
    ],
    grant_profile: [
      "identity",
      "summary",
      "research",
      "projects",
      "experience",
      "achievements",
      "leadership",
      "publications",
      "education",
      "skills",
      "links",
    ],
    hackathon_profile: [
      "identity",
      "summary",
      "skills",
      "projects",
      "experience",
      "leadership",
      "achievements",
      "links",
    ],
    technical_project_resume: [
      "identity",
      "summary",
      "skills",
      "projects",
      "education",
      "experience",
      "achievements",
      "links",
    ],
    design_portfolio_resume: [
      "identity",
      "summary",
      "links",
      "experience",
      "projects",
      "skills",
      "education",
      "achievements",
    ],
    team_member_profile: [
      "identity",
      "summary",
      "skills",
      "projects",
      "leadership",
      "experience",
      "links",
    ],
    biosketch: [
      "identity",
      "summary",
      "education",
      "experience",
      "research",
      "publications",
      "achievements",
    ],
  };
  return orders[documentType] ?? common;
}

const generationFields: Array<{
  id: string;
  heading: string;
  field: keyof StructuredUserProfile;
}> = [
  { id: "experience", heading: "Experience", field: "workHistory" },
  { id: "projects", heading: "Projects", field: "projects" },
  { id: "education", heading: "Education", field: "education" },
  { id: "research", heading: "Research", field: "research" },
  { id: "publications", heading: "Publications", field: "publications" },
  { id: "leadership", heading: "Leadership", field: "leadership" },
  {
    id: "volunteer",
    heading: "Volunteer Experience",
    field: "volunteerExperience",
  },
  { id: "achievements", heading: "Achievements", field: "achievements" },
  { id: "awards", heading: "Awards", field: "awards" },
  { id: "certifications", heading: "Certifications", field: "certifications" },
  { id: "links", heading: "Portfolio and Links", field: "links" },
];

export function buildResumeGeneration(
  request: OpportunityCompanionRequest,
  profile: StructuredUserProfile,
  evidence: ProfileEvidence[],
  opportunity: Opportunity | null,
) {
  const target = resumeTarget(request, opportunity);
  const selection = requestedDocumentType(request, profile, opportunity);
  const benchmark = buildResumeBenchmark(request, profile, evidence, opportunity);
  const name = generationValues(profile, evidence, "name").at(-1);
  const headline = generationValues(profile, evidence, "headline").at(-1);
  const location = generationValues(profile, evidence, "location").at(-1);
  const skills = generationValues(profile, evidence, "skills");
  const identityItems = [
    name
      ? {
          text: name,
          evidenceClaimIds: generationClaimIdsForValue(evidence, "name", name),
          placeholder: false,
          requiresConfirmation: false,
        }
      : {
          text: "[Confirm full name]",
          evidenceClaimIds: [],
          placeholder: true,
          requiresConfirmation: true,
        },
    headline
      ? {
          text: headline,
          evidenceClaimIds: generationClaimIdsForValue(
            evidence,
            "headline",
            headline,
          ),
          placeholder: false,
          requiresConfirmation: false,
        }
      : null,
    location
      ? {
          text: location,
          evidenceClaimIds: generationClaimIdsForValue(
            evidence,
            "location",
            location,
          ),
          placeholder: false,
          requiresConfirmation: false,
        }
      : null,
    {
      text: "[Confirm preferred contact details]",
      evidenceClaimIds: [],
      placeholder: true,
      requiresConfirmation: true,
    },
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const summaryParts = [
    headline
      ? {
          text: headline,
          field: "headline",
        }
      : null,
    skills.length
      ? {
          text: `Supplied skills: ${skills.slice(0, 8).join(", ")}.`,
          field: "skills",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const sections = [
    {
      id: "identity",
      heading: "Contact",
      items: identityItems,
    },
    ...(summaryParts.length
      ? [
          {
            id: "summary",
            heading:
              selection.documentType === "biosketch"
                ? "Personal Statement Evidence"
                : "Profile",
            items: summaryParts.map((item) => ({
              text: item.text,
              evidenceClaimIds:
                item.field === "headline" && headline
                  ? generationClaimIdsForValue(
                      evidence,
                      "headline",
                      headline,
                    )
                  : uniqueStrings(
                      skills.flatMap((skill) =>
                        generationClaimIdsForValue(
                          evidence,
                          "skills",
                          skill,
                        ),
                      ),
                    ),
              placeholder: false,
              requiresConfirmation: false,
            })),
          },
        ]
      : []),
    ...(skills.length
      ? [
          {
            id: "skills",
            heading: "Skills",
            items: skills.map((skill) => ({
              text: skill,
              evidenceClaimIds: generationClaimIdsForValue(
                evidence,
                "skills",
                skill,
              ),
              placeholder: false,
              requiresConfirmation: false,
            })),
          },
        ]
      : []),
    ...generationFields.flatMap(({ id, heading, field }) => {
      const values = generationValues(profile, evidence, field);
      return values.length
        ? [
            {
              id,
              heading,
              items: values.map((value) => ({
                text: value,
                evidenceClaimIds: generationClaimIdsForValue(
                  evidence,
                  field,
                  value,
                ),
                placeholder: false,
                requiresConfirmation: false,
              })),
            },
          ]
        : [];
    }),
  ].sort(
    (left, right) =>
      documentSectionOrder(selection.documentType).indexOf(left.id) -
      documentSectionOrder(selection.documentType).indexOf(right.id),
  );

  const placeholders = identityItems
    .filter((item) => item.placeholder)
    .map((item) => item.text);
  const questions = uniqueStrings([
    !name ? "What full name should appear on the document?" : "",
    "Which email address, phone number, and location should appear in the final document?",
    !skills.length
      ? "Which skills can you verify and want included for this target?"
      : "",
    selection.documentType === "internship_resume" &&
    !generationValues(profile, evidence, "education").length
      ? "What education, coursework, or training can you verify?"
      : "",
    ["academic_cv", "research_cv", "biosketch"].includes(
      selection.documentType,
    ) && !generationValues(profile, evidence, "research").length
      ? "What research roles, methods, topics, or contributions can you verify?"
      : "",
    ["academic_cv", "research_cv", "biosketch"].includes(
      selection.documentType,
    ) && !generationValues(profile, evidence, "publications").length
      ? "Do you have verified publications, presentations, preprints, or other scholarly outputs?"
      : "",
    ["design_portfolio_resume", "technical_project_resume", "hackathon_profile"].includes(
      selection.documentType,
    ) && !generationValues(profile, evidence, "links").length
      ? "Which portfolio, repository, or work-sample links can you verify?"
      : "",
    !generationValues(profile, evidence, "achievements").length
      ? "Are there genuine outcomes or metrics you can verify for the strongest experience or project?"
      : "",
  ]);

  const omittedUnsupportedClaims = uniqueStrings([
    ...benchmark.requirements
      .filter((item) =>
        ["missing", "unverified", "not_met", "contradictory"].includes(
          item.status,
        ),
      )
      .map(
        (item) =>
          `Omitted unsupported target requirement: ${item.requirement}`,
      ),
    ...benchmark.missingKeywords.map(
      (keyword) => `Omitted unverified target term: ${keyword}`,
    ),
  ]).slice(0, 20);

  return {
    generationId: `generation_${fingerprint({
      target,
      profile: compactProfileForSession(profile),
      documentType: selection.documentType,
    })}`,
    rubricVersion: RESUME_GENERATION_RUBRIC_VERSION,
    documentType: selection.documentType,
    documentTypeReason: selection.reason,
    target,
    locale:
      request.generationPreferences?.locale ??
      request.target?.locale ??
      profile.location ??
      "unspecified",
    format: request.generationPreferences?.format ?? "markdown",
    pageLimit: request.generationPreferences?.pageLimit ?? null,
    instructions: safeEvidenceValues(
      request.generationPreferences?.instructions ?? [],
    ),
    title: name ? `${name} - ${target}` : `Application document - ${target}`,
    sections,
    placeholders,
    omittedUnsupportedClaims,
    followUpQuestions: questions,
    verificationChecklist: [
      "Confirm every name, date, title, organization, qualification, link, and location before submission.",
      "Replace placeholders only with facts the user can verify.",
      "Add metrics only when the user supplies a real, supportable figure.",
      "Follow the target's published document type, length, formatting, and submission instructions.",
      "Do not imply that a missing eligibility rule, skill, publication, award, or result has been met.",
    ],
    factualIntegrity:
      "Every non-placeholder applicant statement is copied or minimally formatted from explicit, confirmed evidence authorized for generation and linked to its claim IDs.",
  };
}

export function buildBenchmarkReference(
  benchmark: ReturnType<typeof buildResumeBenchmark>,
  target: CompanionTarget | undefined,
  profile: StructuredUserProfile,
): ResumeBenchmarkReference {
  const canonicalTarget = compactTargetForSession(target);
  const canonicalProfile = compactProfileForSession(profile);
  return {
    benchmarkId: benchmark.benchmarkId,
    rubricVersion: benchmark.rubricVersion,
    targetFingerprint: fingerprint(canonicalTarget ?? benchmark.target),
    evidenceFingerprint: fingerprint(canonicalProfile),
    completedAt: new Date().toISOString(),
  };
}

export function isBenchmarkCompatible(
  reference: ResumeBenchmarkReference | undefined,
  target: CompanionTarget | undefined,
  profile: StructuredUserProfile,
) {
  const canonicalTarget = compactTargetForSession(target);
  const canonicalProfile = compactProfileForSession(profile);
  return Boolean(
    reference &&
      reference.rubricVersion === RESUME_RUBRIC_VERSION &&
      reference.targetFingerprint === fingerprint(canonicalTarget) &&
      reference.evidenceFingerprint === fingerprint(canonicalProfile),
  );
}
