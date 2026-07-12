import type { OpportunitySource } from "@/lib/opportunities/source";
import { databaseOpportunitySource } from "@/lib/opportunities/sources/database-source";
import { staticOpportunitySource } from "@/lib/opportunities/sources/static-source";

export const opportunitySource: OpportunitySource = {
  name: "postgres-with-seeded-fallback",
  async fetchOpportunities(request, filters) {
    try {
      const stored = await databaseOpportunitySource.fetchOpportunities(request, filters);
      if (stored.length > 0) {
        return stored;
      }
    } catch {
      // Fallback keeps the ASP callable while database setup is being finished.
    }

    return staticOpportunitySource.fetchOpportunities(request, filters);
  },
};
