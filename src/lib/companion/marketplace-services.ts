import type {
  ServiceOperation,
  UserFacingService,
} from "@/lib/types/opportunities";

export const TRAKR_MARKETPLACE_SERVICES = [
  {
    id: "opportunity_discovery",
    title: "Trakr Opportunity Discovery",
    selector: "opportunity-discovery",
    service: "opportunity_finding",
    operation: "discover",
    endpoint: "/api/a2mcp/recommend",
  },
  {
    id: "resume_benchmarking_optimization",
    title: "Trakr Resume Benchmarking & Optimization",
    selector: "resume-benchmarking-optimization",
    service: "resume_benchmarking_optimization",
    operation: "benchmark",
    endpoint:
      "/api/a2mcp/recommend?service=resume-benchmarking-optimization",
  },
  {
    id: "resume_generation",
    title: "Trakr Resume Generation",
    selector: "resume-generation",
    service: "resume_generation",
    operation: "generate_resume",
    endpoint: "/api/a2mcp/recommend?service=resume-generation",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  selector: string;
  service: UserFacingService;
  operation: ServiceOperation;
  endpoint: string;
}>;

const serviceAliases = new Map<string, UserFacingService>([
  ["opportunity_discovery", "opportunity_finding"],
  ["opportunity-discovery", "opportunity_finding"],
  ["opportunity_finding", "opportunity_finding"],
  ["opportunity-finding", "opportunity_finding"],
  ["find_opportunities", "opportunity_finding"],
  ["find-opportunities", "opportunity_finding"],
  ["discover", "opportunity_finding"],
  [
    "resume_benchmarking_optimization",
    "resume_benchmarking_optimization",
  ],
  [
    "resume-benchmarking-optimization",
    "resume_benchmarking_optimization",
  ],
  ["resume_benchmarking", "resume_benchmarking_optimization"],
  ["resume-benchmarking", "resume_benchmarking_optimization"],
  ["benchmark", "resume_benchmarking_optimization"],
  ["optimize", "resume_benchmarking_optimization"],
  ["optimise", "resume_benchmarking_optimization"],
  ["resume_generation", "resume_generation"],
  ["resume-generation", "resume_generation"],
  ["generate_resume", "resume_generation"],
  ["generate-resume", "resume_generation"],
]);

export function parseMarketplaceService(
  value: unknown,
): UserFacingService | undefined {
  if (typeof value !== "string") return undefined;
  return serviceAliases.get(value.trim().toLowerCase());
}

export function operationForMarketplaceService(
  service: UserFacingService,
): ServiceOperation {
  if (service === "opportunity_finding") return "discover";
  if (service === "resume_benchmarking_optimization") return "benchmark";
  return "generate_resume";
}

export function operationBelongsToMarketplaceService(
  operation: ServiceOperation,
  service: UserFacingService,
) {
  if (operation === "auto" || operation === "start") return true;
  if (service === "opportunity_finding") {
    return operation === "discover" || operation === "readiness";
  }
  if (service === "resume_benchmarking_optimization") {
    return operation === "benchmark" || operation === "optimize";
  }
  return operation === "generate_resume";
}
