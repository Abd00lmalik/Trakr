import type { OpportunitySource } from "@/lib/opportunities/source";
import { applyOpportunityFilters } from "@/lib/opportunities/source";
import { listStoredOpportunities } from "@/lib/repositories/opportunity-repository";
import { enrichOpportunityMetadata } from "@/lib/opportunities/metadata";

export const databaseOpportunitySource: OpportunitySource = {
  name: "postgres-opportunity-store",
  async fetchOpportunities(_request, filters) {
    const opportunities = await listStoredOpportunities();
    return applyOpportunityFilters(
      opportunities.map((opportunity) => enrichOpportunityMetadata(opportunity)),
      filters,
    );
  },
};
