import { fetchStructuredOpportunities } from "@/lib/opportunities/ingestion/fetchers";
import { buildInventoryMonitoringSnapshot } from "@/lib/opportunities/inventory-monitoring";
import { enrichOpportunityMetadata } from "@/lib/opportunities/metadata";
import { verifyOpportunities } from "@/lib/opportunities/verification";
import { storeIngestionBatch } from "@/lib/repositories/opportunity-repository";

export async function ingestOpportunities() {
  const startedAt = new Date();
  const {
    opportunities,
    errors,
    sources,
    successfulSourceNames,
    failedSourceNames,
    sourceGroupCounts,
  } =
    await fetchStructuredOpportunities();
  const lastSeenAt = startedAt.toISOString();
  const verifiedRecords = await verifyOpportunities(
    opportunities.map((opportunity) => ({ ...opportunity, lastSeenAt })),
  );
  const verified = verifiedRecords.map((opportunity) =>
    enrichOpportunityMetadata(opportunity, startedAt),
  );
  const result = await storeIngestionBatch(verified, successfulSourceNames, startedAt);
  const monitoring = buildInventoryMonitoringSnapshot({
    opportunities: verified,
    expectedSources: successfulSourceNames,
    sourceGroupCounts,
    failedSources: failedSourceNames,
    now: startedAt,
  });

  return {
    fetched: opportunities.length,
    stored: result.stored,
    deactivated: result.deactivated,
    verification: {
      verified: verified.filter((item) => item.verificationStatus === "verified").length,
      programDirectories: verified.filter(
        (item) => item.verificationStatus === "program_directory",
      ).length,
      inactive: verified.filter(
        (item) => item.verificationStatus === "inactive_listing",
      ).length,
      unverified: verified.filter((item) => item.verificationStatus === "unverified")
        .length,
    },
    errors,
    sources,
    monitoring,
  };
}
