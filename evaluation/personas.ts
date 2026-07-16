import type {
  OpportunityCategory,
  RecommendationRequest,
} from "../src/lib/types/opportunities";

export type EvaluationPersona = {
  id: string;
  archetype: string;
  request: RecommendationRequest;
  expected: {
    opportunityIds: string[];
    categories: OpportunityCategory[];
    signals: string[];
  };
};

type Archetype = {
  id: string;
  name: string;
  headline: string;
  skills: string[];
  interests: string[];
  goals: string[];
  categories: OpportunityCategory[];
  expectedIds: string[];
  signals: string[];
  experienceLevel: NonNullable<
    RecommendationRequest["user"]
  >["experienceLevel"];
};

const archetypes: Archetype[] = [
  {
    id: "web3-builder",
    name: "Web3 builder",
    headline: "Web3 product engineer shipping smart contract applications",
    skills: ["Solidity", "TypeScript", "React", "smart contracts", "GitHub"],
    interests: ["Web3", "Ethereum", "DeFi", "public goods"],
    goals: ["win a Web3 hackathon", "earn ecosystem funding"],
    categories: ["hackathon", "grant", "web3_bounty"],
    expectedIds: [
      "ethglobal-online-buildathon",
      "official-ethglobal-events",
      "official-dorahacks-hackathons",
      "dao-tooling-bounty",
      "official-solana-grants",
      "official-gitcoin-grants",
    ],
    signals: ["web3", "solidity", "ethereum", "blockchain", "smart contract"],
    experienceLevel: "early-career",
  },
  {
    id: "public-goods",
    name: "Public-goods founder",
    headline: "Open-source founder building public-goods infrastructure",
    skills: ["technical writing", "open source", "community", "TypeScript"],
    interests: ["public goods", "impact", "Web3", "open source"],
    goals: ["secure non-dilutive grant funding", "grow an impact project"],
    categories: ["grant", "web3_bounty"],
    expectedIds: [
      "gitcoin-public-goods-grants",
      "official-gitcoin-grants",
      "official-solana-grants",
      "official-dorahacks-hackathons",
      "dao-tooling-bounty",
    ],
    signals: ["grant", "public goods", "open source", "funding", "impact"],
    experienceLevel: "founder",
  },
  {
    id: "ai-engineer",
    name: "AI engineer",
    headline: "Machine learning engineer building applied AI products",
    skills: ["Python", "machine learning", "SQL", "PyTorch", "model evaluation"],
    interests: ["artificial intelligence", "data science", "LLMs"],
    goals: ["enter an AI competition", "build a stronger AI portfolio"],
    categories: ["hackathon", "fellowship", "remote_job"],
    expectedIds: [
      "official-kaggle-competitions",
      "official-google-research-student-programs",
      "ai-tools-remote-job",
      "official-microsoft-learn-student-hub",
      "official-google-developer-programs",
    ],
    signals: ["ai", "machine learning", "data science", "research", "llm"],
    experienceLevel: "early-career",
  },
  {
    id: "security-student",
    name: "Cybersecurity student",
    headline: "Cybersecurity student practicing offensive security",
    skills: ["Linux", "networking", "Python", "web security", "CTFs"],
    interests: ["cybersecurity", "bug bounty", "capture the flag"],
    goals: ["compete in CTFs", "build a security research portfolio"],
    categories: ["hackathon", "web3_bounty"],
    expectedIds: [
      "official-hackerone-bug-bounty",
      "official-ctftime-events",
      "official-dorahacks-hackathons",
      "dao-tooling-bounty",
      "ethglobal-online-buildathon",
    ],
    signals: ["security", "cybersecurity", "ctf", "bug bounty", "vulnerability"],
    experienceLevel: "student",
  },
  {
    id: "frontend-career",
    name: "Frontend early-career developer",
    headline: "Frontend developer seeking mentored professional experience",
    skills: ["React", "TypeScript", "JavaScript", "CSS", "Git"],
    interests: ["frontend", "open source", "product engineering"],
    goals: ["find an internship", "join a mentored developer program"],
    categories: ["internship", "fellowship", "remote_job"],
    expectedIds: [
      "remote-frontend-intern",
      "official-wellfound-startup-jobs",
      "ai-tools-remote-job",
      "official-mlh-fellowship",
      "mlh-fellowship-open-source",
      "official-github-education",
    ],
    signals: ["frontend", "react", "typescript", "developer", "open source"],
    experienceLevel: "early-career",
  },
  {
    id: "open-source-student",
    name: "Open-source student",
    headline: "Computer science student starting an open-source career",
    skills: ["Git", "Python", "JavaScript", "documentation"],
    interests: ["open source", "developer communities", "mentorship"],
    goals: ["join a fellowship", "make sustained open-source contributions"],
    categories: ["fellowship", "scholarship"],
    expectedIds: [
      "official-google-summer-of-code",
      "official-mlh-fellowship",
      "mlh-fellowship-open-source",
      "official-github-education",
      "official-google-developer-programs",
    ],
    signals: ["open source", "student", "mentorship", "developer", "git"],
    experienceLevel: "student",
  },
  {
    id: "startup-founder",
    name: "Startup founder",
    headline: "Technical startup founder preparing to raise and scale",
    skills: ["product strategy", "customer discovery", "pitching", "cloud architecture"],
    interests: ["startups", "accelerators", "fundraising", "cloud credits"],
    goals: ["join an accelerator", "secure startup funding and cloud support"],
    categories: ["grant", "hackathon"],
    expectedIds: [
      "official-y-combinator-apply",
      "official-aws-activate",
      "official-solana-grants",
      "official-gitcoin-grants",
      "gitcoin-public-goods-grants",
    ],
    signals: ["startup", "founder", "accelerator", "funding", "cloud"],
    experienceLevel: "founder",
  },
  {
    id: "creator",
    name: "Digital creator",
    headline: "Video creator growing an educational technology audience",
    skills: ["video editing", "storytelling", "analytics", "community building"],
    interests: ["creator economy", "video", "audience growth"],
    goals: ["join a creator program", "improve monetization and distribution"],
    categories: ["fellowship", "scholarship", "remote_job"],
    expectedIds: [
      "official-youtube-creators",
      "official-tiktok-creator-academy",
      "ai-tools-remote-job",
      "official-google-developer-programs",
      "official-github-education",
    ],
    signals: ["creator", "video", "content", "audience", "community"],
    experienceLevel: "creator",
  },
  {
    id: "cloud-student",
    name: "Cloud computing student",
    headline: "Student learning cloud engineering and developer tooling",
    skills: ["GitHub", "cloud basics", "Python", "Linux"],
    interests: ["cloud", "developer tools", "certifications"],
    goals: ["access cloud credits", "follow a structured learning program"],
    categories: ["scholarship", "grant", "fellowship"],
    expectedIds: [
      "official-microsoft-learn-student-hub",
      "official-aws-activate",
      "official-github-education",
      "official-google-developer-programs",
      "google-student-scholarship",
    ],
    signals: ["cloud", "student", "learning", "developer tools", "credits"],
    experienceLevel: "student",
  },
  {
    id: "ml-researcher",
    name: "Machine learning researcher",
    headline: "Graduate researcher pursuing applied machine learning work",
    skills: ["Python", "statistics", "machine learning", "technical writing"],
    interests: ["AI research", "model evaluation", "academic programs"],
    goals: ["join a research fellowship", "compete on rigorous ML problems"],
    categories: ["fellowship", "hackathon"],
    expectedIds: [
      "official-google-research-student-programs",
      "official-kaggle-competitions",
      "official-google-summer-of-code",
      "official-microsoft-learn-student-hub",
      "official-google-developer-programs",
    ],
    signals: ["research", "machine learning", "ai", "statistics", "academic"],
    experienceLevel: "mid-level",
  },
  {
    id: "student-tools",
    name: "Student seeking developer benefits",
    headline: "University student building a first technical portfolio",
    skills: ["Git", "web development", "learning plan"],
    interests: ["developer education", "student tools", "community"],
    goals: ["access student benefits", "build portfolio projects"],
    categories: ["scholarship", "fellowship"],
    expectedIds: [
      "official-github-education",
      "google-student-scholarship",
      "official-google-developer-programs",
      "official-microsoft-learn-student-hub",
      "official-mlh-fellowship",
    ],
    signals: ["student", "developer", "learning", "tools", "education"],
    experienceLevel: "student",
  },
  {
    id: "remote-fullstack",
    name: "Remote full-stack developer",
    headline: "Full-stack developer seeking remote product work",
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "API design"],
    interests: ["remote work", "startups", "AI tools"],
    goals: ["find a remote engineering role", "strengthen product experience"],
    categories: ["remote_job", "internship", "fellowship"],
    expectedIds: [
      "official-wellfound-startup-jobs",
      "ai-tools-remote-job",
      "remote-frontend-intern",
      "official-mlh-fellowship",
      "mlh-fellowship-open-source",
    ],
    signals: ["remote", "developer", "typescript", "react", "startup"],
    experienceLevel: "mid-level",
  },
];

const variants = [
  {
    suffix: "core",
    location: "Lagos, Nigeria",
    skill: "communication",
    goal: "find a strong next opportunity",
  },
  {
    suffix: "portfolio",
    location: "Nairobi, Kenya",
    skill: "portfolio",
    goal: "produce public portfolio proof",
  },
  {
    suffix: "community",
    location: "Accra, Ghana",
    skill: "community participation",
    goal: "grow a professional network",
  },
  {
    suffix: "technical",
    location: "Remote",
    skill: "project delivery",
    goal: "ship a technically ambitious project",
  },
  {
    suffix: "career",
    location: "London, United Kingdom",
    skill: "technical writing",
    goal: "improve long-term career options",
  },
];

export const evaluationPersonas: EvaluationPersona[] = archetypes.flatMap(
  (archetype) =>
    variants.map((variant) => ({
      id: `${archetype.id}-${variant.suffix}`,
      archetype: archetype.name,
      request: {
        user: {
          headline: archetype.headline,
          location: variant.location,
          experienceLevel: archetype.experienceLevel,
          skills: [...archetype.skills, variant.skill],
          interests: archetype.interests,
          goals: [...archetype.goals, variant.goal],
          education: [],
          workHistory: [],
          links: [],
        },
        filters: {
          categories: archetype.categories,
          remote: true,
          limit: 5,
        },
      },
      expected: {
        opportunityIds: archetype.expectedIds,
        categories: archetype.categories,
        signals: archetype.signals,
      },
    })),
);
