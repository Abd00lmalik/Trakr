import type { OpportunitySource } from "@/lib/opportunities/source";
import { applyOpportunityFilters } from "@/lib/opportunities/source";
import { staticOpportunities } from "@/lib/opportunities/data/static-opportunities";

export const staticOpportunitySource: OpportunitySource = {
  name: "seeded-structured-catalog",
  async fetchOpportunities(_request, filters) {
    return applyOpportunityFilters(staticOpportunities, filters);
  },
};
