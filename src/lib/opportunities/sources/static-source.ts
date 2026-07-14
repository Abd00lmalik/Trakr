import type { OpportunitySource } from "@/lib/opportunities/source";
import { applyOpportunityFilters } from "@/lib/opportunities/source";
import { curatedOfficialOpportunities } from "@/lib/opportunities/data/curated-official-opportunities";

export const staticOpportunitySource: OpportunitySource = {
  name: "official-curated-fallback-catalog",
  async fetchOpportunities(_request, filters) {
    return applyOpportunityFilters(curatedOfficialOpportunities, filters);
  },
};
