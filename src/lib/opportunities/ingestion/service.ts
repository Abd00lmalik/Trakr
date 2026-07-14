import { fetchStructuredOpportunities } from "@/lib/opportunities/ingestion/fetchers";
import { upsertOpportunities } from "@/lib/repositories/opportunity-repository";

export async function ingestOpportunities() {
  const { opportunities, errors, sources } = await fetchStructuredOpportunities();
  const stored = opportunities.length ? await upsertOpportunities(opportunities) : 0;

  return {
    fetched: opportunities.length,
    stored,
    errors,
    sources,
  };
}
