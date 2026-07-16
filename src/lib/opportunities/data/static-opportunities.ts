import type { Opportunity } from "@/lib/types/opportunities";

type StaticOpportunity = Omit<
  Opportunity,
  | "verificationStatus"
  | "lastVerifiedAt"
  | "lastSeenAt"
  | "sourceStatus"
  | "httpStatus"
  | "canonicalUrl"
  | "publisherDomain"
  | "isActive"
  | "verificationConfidence"
>;

const staticOpportunityCatalog: StaticOpportunity[] = [
  {
    id: "ethglobal-online-buildathon",
    title: "ETHGlobal Online Buildathon",
    organization: "ETHGlobal",
    category: "hackathon",
    summary:
      "Remote Web3 hackathon for builders shipping prototypes across Ethereum infrastructure, AI agents, public goods, and consumer crypto.",
    sourceName: "ETHGlobal",
    sourceUrl: "https://ethglobal.com/events",
    location: "Global",
    remote: true,
    deadline: "2026-08-20",
    requiredSkills: ["JavaScript", "product thinking", "GitHub"],
    preferredSkills: ["Solidity", "TypeScript", "smart contracts", "DeFi"],
    eligibility: ["Open to builders globally", "Team or solo submissions accepted"],
    benefits: ["Prize pool", "Sponsor bounties", "Mentor feedback"],
    tags: ["web3", "hackathon", "ethereum", "builder"],
    difficulty: "medium",
  },
  {
    id: "gitcoin-public-goods-grants",
    title: "Public Goods Builder Grant",
    organization: "Gitcoin",
    category: "grant",
    summary:
      "Grant funding for open-source, community, and public-goods projects with clear impact and credible execution plans.",
    sourceName: "Gitcoin",
    sourceUrl: "https://www.gitcoin.co/grants",
    location: "Global",
    remote: true,
    deadline: "2026-09-15",
    requiredSkills: ["project proposal", "open source", "community"],
    preferredSkills: ["impact metrics", "technical writing", "Web3"],
    eligibility: ["Project must serve a public-good outcome", "Applicant must show execution history"],
    benefits: ["Non-dilutive funding", "Community visibility", "Partner ecosystem access"],
    tags: ["grant", "open source", "public goods", "web3"],
    difficulty: "medium",
  },
  {
    id: "mlh-fellowship-open-source",
    title: "MLH Open Source Fellowship",
    organization: "Major League Hacking",
    category: "fellowship",
    summary:
      "Remote fellowship for students and early-career developers contributing to open-source projects with mentor support.",
    sourceName: "MLH",
    sourceUrl: "https://fellowship.mlh.io/",
    location: "Remote",
    remote: true,
    deadline: "2026-08-05",
    requiredSkills: ["Git", "programming fundamentals", "communication"],
    preferredSkills: ["JavaScript", "Python", "open source contributions"],
    eligibility: ["Student or early-career developer", "Able to commit to the fellowship schedule"],
    benefits: ["Mentorship", "Open-source experience", "Professional network"],
    tags: ["fellowship", "developer", "open source", "remote"],
    difficulty: "medium",
  },
  {
    id: "google-student-scholarship",
    title: "Developer Student Scholarship",
    organization: "Google Developer Programs",
    category: "scholarship",
    summary:
      "Scholarship support for students building technical portfolios and expanding access to developer education.",
    sourceName: "Google for Developers",
    sourceUrl: "https://developers.google.com/community",
    location: "Global",
    remote: true,
    deadline: "2026-10-01",
    requiredSkills: ["student status", "learning plan", "community participation"],
    preferredSkills: ["Android", "web development", "cloud basics"],
    eligibility: ["Currently enrolled or recently graduated", "Demonstrated interest in technology"],
    benefits: ["Learning support", "Community access", "Portfolio guidance"],
    tags: ["scholarship", "student", "developer education"],
    difficulty: "low",
  },
  {
    id: "remote-frontend-intern",
    title: "Remote Frontend Engineering Internship",
    organization: "Open Source Labs",
    category: "internship",
    summary:
      "Remote internship for early developers supporting UI features, issue triage, documentation, and user-facing improvements.",
    sourceName: "Structured partner feed",
    sourceUrl: "https://github.com/open-source-labs",
    location: "Remote",
    remote: true,
    deadline: "2026-07-30",
    requiredSkills: ["React", "JavaScript", "CSS", "Git"],
    preferredSkills: ["TypeScript", "testing", "accessibility"],
    eligibility: ["Portfolio or GitHub profile required", "Able to work async with a distributed team"],
    benefits: ["Mentorship", "Remote experience", "Reference project"],
    tags: ["internship", "frontend", "remote", "open source"],
    difficulty: "low",
  },
  {
    id: "dao-tooling-bounty",
    title: "DAO Tooling Bounty",
    organization: "BuilderDAO",
    category: "web3_bounty",
    summary:
      "Bounty for improving governance dashboards, wallet flows, analytics, and agent-friendly DAO tooling.",
    sourceName: "Bounty board feed",
    sourceUrl: "https://www.bountycaster.xyz/",
    location: "Global",
    remote: true,
    deadline: "2026-08-12",
    requiredSkills: ["TypeScript", "API integration", "GitHub"],
    preferredSkills: ["wallets", "The Graph", "Solidity", "data visualization"],
    eligibility: ["Public GitHub submission", "Working demo required"],
    benefits: ["Bounty payout", "DAO reputation", "Follow-on work"],
    tags: ["web3", "bounty", "dao", "typescript"],
    difficulty: "high",
  },
  {
    id: "ai-tools-remote-job",
    title: "Remote AI Tools Developer",
    organization: "Indie Tools Studio",
    category: "remote_job",
    summary:
      "Contract role building AI-assisted workflows, integrations, and lightweight product features for creator and freelancer audiences.",
    sourceName: "Structured job feed",
    sourceUrl: "https://wellfound.com/jobs",
    location: "Remote",
    remote: true,
    deadline: null,
    requiredSkills: ["TypeScript", "React", "API design", "AI product judgment"],
    preferredSkills: ["Next.js", "prompt engineering", "PostgreSQL"],
    eligibility: ["Portfolio required", "Comfortable with async contract work"],
    benefits: ["Paid contract", "Flexible schedule", "Portfolio growth"],
    tags: ["remote job", "ai", "typescript", "creator tools"],
    difficulty: "high",
  },
];

export const staticOpportunities: Opportunity[] = staticOpportunityCatalog.map(
  (opportunity) => ({
    ...opportunity,
    verificationStatus: "unverified",
    lastVerifiedAt: null,
    lastSeenAt: null,
    sourceStatus: "unverified",
    httpStatus: null,
    canonicalUrl: opportunity.sourceUrl,
    publisherDomain: new URL(opportunity.sourceUrl).hostname.replace(/^www\./, ""),
    isActive: true,
    verificationConfidence: 0,
  }),
);
