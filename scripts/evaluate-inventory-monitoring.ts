import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchStructuredOpportunities } from "../src/lib/opportunities/ingestion/fetchers";
import { buildInventoryMonitoringSnapshot } from "../src/lib/opportunities/inventory-monitoring";
import { verifyOpportunities } from "../src/lib/opportunities/verification";

async function main() {
  const startedAt = new Date();
  const fetched = await fetchStructuredOpportunities();
  const verified = await verifyOpportunities(
    fetched.opportunities.map((opportunity) => ({
      ...opportunity,
      lastSeenAt: startedAt.toISOString(),
    })),
  );
  const snapshot = buildInventoryMonitoringSnapshot({
    opportunities: verified,
    expectedSources: fetched.successfulSourceNames,
    sourceGroupCounts: fetched.sourceGroupCounts,
    failedSources: fetched.failedSourceNames,
    now: startedAt,
  });
  const verificationCounts = Object.fromEntries(
    [
      "verified",
      "program_directory",
      "inactive_listing",
      "unverified",
    ].map((status) => [
      status,
      verified.filter(
        (opportunity) => opportunity.verificationStatus === status,
      ).length,
    ]),
  );
  const result = {
    evaluatedAt: startedAt.toISOString(),
    approvedSourceGroups: fetched.sources,
    sourceErrors: fetched.errors,
    sourceGroupCounts: fetched.sourceGroupCounts,
    fetchedRecords: fetched.opportunities.length,
    verificationCounts,
    monitoring: snapshot,
    permissionRequiredSources: ["DoraHacks", "Encode Club"],
    permissionDecision:
      "No automated ingestion. A documented API, official feed, permission, or partnership remains required.",
  };
  const reportPath = path.resolve(
    "reports",
    "inventory-monitoring-2026-07-21.json",
  );
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: !snapshot.alerts.some((alert) => alert.severity === "critical"),
        reportPath,
        fetchedRecords: result.fetchedRecords,
        verificationCounts,
        sourceGroupCounts: fetched.sourceGroupCounts,
        alerts: snapshot.alerts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
