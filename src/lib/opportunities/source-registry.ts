export type OpportunitySourceAccess =
  | "active"
  | "curated_directory_only"
  | "permission_required"
  | "not_approved";

export type OpportunitySourceRegistryEntry = {
  id: string;
  name: string;
  access: OpportunitySourceAccess;
  ingestionMethod: string;
  officialUrl: string;
  reliability: "high" | "medium" | "unknown";
  maintenanceRisk: "low" | "medium" | "high";
  notes: string;
};

export const opportunitySourceRegistry: OpportunitySourceRegistryEntry[] = [
  {
    id: "devpost",
    name: "Devpost",
    access: "active",
    ingestionMethod: "Public JSON endpoint with normalization and URL verification",
    officialUrl: "https://devpost.com/api/hackathons?status=open",
    reliability: "medium",
    maintenanceRisk: "medium",
    notes:
      "Retain while the endpoint remains public and stable. Verify every canonical opportunity URL and degrade cleanly on schema changes.",
  },
  {
    id: "remoteok",
    name: "RemoteOK",
    access: "active",
    ingestionMethod: "Public API with attribution, quality filters, and URL verification",
    officialUrl: "https://remoteok.com/api",
    reliability: "medium",
    maintenanceRisk: "medium",
    notes:
      "Use only individual listings that survive role-family, eligibility, freshness, and source-quality gates.",
  },
  {
    id: "greenhouse-employer-boards",
    name: "Greenhouse employer job boards",
    access: "active",
    ingestionMethod:
      "Documented public Greenhouse Job Board API for a reviewed allowlist of employer-owned boards",
    officialUrl: "https://developers.greenhouse.io/job-board.html",
    reliability: "high",
    maintenanceRisk: "medium",
    notes:
      "Only official employer boards are included. Individual canonical job pages are verified before Apply Now; board failures are isolated and stale records are not deactivated unless that board refresh succeeds.",
  },
  {
    id: "ashby-employer-boards",
    name: "Ashby employer job boards",
    access: "active",
    ingestionMethod:
      "Documented public Ashby Job Posting API for a reviewed allowlist of employer-owned boards",
    officialUrl: "https://developers.ashbyhq.com/docs/public-job-posting-api",
    reliability: "high",
    maintenanceRisk: "medium",
    notes:
      "Only listed postings from reviewed official employer boards are included. Published workplace type and locations remain authoritative, each canonical job URL is verified, and board failures are isolated before stale deactivation.",
  },
  {
    id: "grants-gov",
    name: "Grants.gov Search2",
    access: "active",
    ingestionMethod:
      "Official documented Search2 JSON API with conservative current-cycle filtering and individual URL verification",
    officialUrl: "https://www.grants.gov/api/common/search2",
    reliability: "high",
    maintenanceRisk: "medium",
    notes:
      "Use as a grant and research-funding lead source. Historical, forecasted, expired, and geographically unclear records remain Explore or Research Lead until the official notice confirms a current application route and eligibility.",
  },
  {
    id: "official-curated",
    name: "Official program directories",
    access: "curated_directory_only",
    ingestionMethod: "Manually curated official URLs",
    officialUrl: "https://trakr-production-c70e.up.railway.app/api/a2mcp",
    reliability: "high",
    maintenanceRisk: "medium",
    notes:
      "Directories are discovery fallbacks, not verified active openings. They cannot receive Apply Now or satisfy verified interest coverage.",
  },
  {
    id: "dorahacks",
    name: "DoraHacks",
    access: "permission_required",
    ingestionMethod: "No automated ingestion approved",
    officialUrl: "https://dorahacks.io/hackathon",
    reliability: "unknown",
    maintenanceRisk: "high",
    notes:
      "Keep the official directory as an explore-only source. Do not scrape protected pages or undocumented interfaces; pursue a documented API, feed, partnership, or written permission first.",
  },
  {
    id: "encode-club",
    name: "Encode Club",
    access: "permission_required",
    ingestionMethod: "No automated ingestion approved",
    officialUrl: "https://www.encode.club/",
    reliability: "unknown",
    maintenanceRisk: "high",
    notes:
      "No stable public opportunities API or feed has been approved for production ingestion. Prefer partnership or permissioned structured delivery over page scraping.",
  },
];

export function activeAutomatedSources() {
  return opportunitySourceRegistry.filter((source) => source.access === "active");
}
