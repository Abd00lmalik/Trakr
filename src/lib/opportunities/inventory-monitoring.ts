import type { Opportunity } from "@/lib/types/opportunities";

export type InventoryAlertSeverity = "info" | "warning" | "critical";

export type InventoryAlert = {
  code:
    | "source_zero_records"
    | "source_fetch_failure"
    | "record_count_anomaly"
    | "verification_rate_low"
    | "stale_inventory"
    | "duplicate_rate_high"
    | "category_shortage"
    | "africa_coverage_low"
    | "remote_global_coverage_low"
    | "deadline_confidence_low";
  severity: InventoryAlertSeverity;
  scope: string;
  message: string;
};

export type InventoryMonitoringSnapshot = {
  generatedAt: string;
  totalRecords: number;
  activeRecords: number;
  verifiedRecords: number;
  verificationRate: number;
  duplicateRate: number;
  staleRecordCount: number;
  remoteRecordCount: number;
  africaEvidenceCount: number;
  knownDeadlineCount: number;
  sourceCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  alerts: InventoryAlert[];
};

const CATEGORY_MINIMUMS: Record<string, number> = {
  internship: 10,
  scholarship: 5,
  fellowship: 10,
  grant: 5,
  hackathon: 8,
};

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

function isAfricaEvidence(value: string) {
  return /\b(africa|nigeria|kenya|ghana|uganda|rwanda|south africa|egypt|morocco|ethiopia|tanzania|senegal|zambia|zimbabwe|botswana|namibia|cameroon|cote d ivoire|ivory coast)\b/i.test(
    value,
  );
}

function isStale(opportunity: Opportunity, now: Date) {
  const timestamp = opportunity.lastVerifiedAt ?? opportunity.lastSeenAt;
  if (!timestamp) return true;
  const ageMs = now.getTime() - new Date(timestamp).getTime();
  return ageMs > 72 * 60 * 60 * 1000;
}

export function buildInventoryMonitoringSnapshot({
  opportunities,
  expectedSources,
  failedSources = [],
  previous,
  now = new Date(),
}: {
  opportunities: Opportunity[];
  expectedSources: string[];
  failedSources?: string[];
  previous?: InventoryMonitoringSnapshot;
  now?: Date;
}): InventoryMonitoringSnapshot {
  const alerts: InventoryAlert[] = [];
  const sourceCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const canonicalUrls = new Set<string>();
  let duplicateCount = 0;

  for (const opportunity of opportunities) {
    sourceCounts[opportunity.sourceName] =
      (sourceCounts[opportunity.sourceName] ?? 0) + 1;
    categoryCounts[opportunity.category] =
      (categoryCounts[opportunity.category] ?? 0) + 1;
    if (canonicalUrls.has(opportunity.canonicalUrl)) duplicateCount += 1;
    canonicalUrls.add(opportunity.canonicalUrl);
  }

  for (const source of expectedSources) {
    if (!sourceCounts[source] && !failedSources.includes(source)) {
      alerts.push({
        code: "source_zero_records",
        severity: "critical",
        scope: source,
        message: `${source} returned zero records unexpectedly.`,
      });
    }
  }
  for (const source of failedSources) {
    alerts.push({
      code: "source_fetch_failure",
      severity: "critical",
      scope: source,
      message: `${source} failed during the current ingestion run.`,
    });
  }

  if (previous?.totalRecords) {
    const change = Math.abs(
      opportunities.length - previous.totalRecords,
    ) / previous.totalRecords;
    if (change >= 0.5) {
      alerts.push({
        code: "record_count_anomaly",
        severity: change >= 0.75 ? "critical" : "warning",
        scope: "inventory",
        message: `Inventory count changed by ${Math.round(change * 100)}% from the previous snapshot.`,
      });
    }
  }

  const activeRecords = opportunities.filter((item) => item.isActive).length;
  const verifiedRecords = opportunities.filter(
    (item) => item.verificationStatus === "verified" && item.isActive,
  ).length;
  const verificationRate = ratio(verifiedRecords, activeRecords);
  if (activeRecords && verificationRate < 0.85) {
    alerts.push({
      code: "verification_rate_low",
      severity: verificationRate < 0.7 ? "critical" : "warning",
      scope: "inventory",
      message: `Only ${Math.round(verificationRate * 100)}% of active records are verified.`,
    });
  }

  const staleRecordCount = opportunities.filter((item) =>
    isStale(item, now),
  ).length;
  if (staleRecordCount) {
    alerts.push({
      code: "stale_inventory",
      severity:
        ratio(staleRecordCount, opportunities.length) >= 0.1
          ? "critical"
          : "warning",
      scope: "inventory",
      message: `${staleRecordCount} records have not been verified or seen in the last 72 hours.`,
    });
  }

  const duplicateRate = ratio(duplicateCount, opportunities.length);
  if (duplicateRate > 0.05) {
    alerts.push({
      code: "duplicate_rate_high",
      severity: duplicateRate > 0.1 ? "critical" : "warning",
      scope: "inventory",
      message: `${Math.round(duplicateRate * 100)}% of records repeat a canonical URL.`,
    });
  }

  for (const [category, minimum] of Object.entries(CATEGORY_MINIMUMS)) {
    const count = categoryCounts[category] ?? 0;
    if (count < minimum) {
      alerts.push({
        code: "category_shortage",
        severity: count === 0 ? "critical" : "warning",
        scope: category,
        message: `${category} inventory has ${count} records; the monitoring floor is ${minimum}.`,
      });
    }
  }

  const africaEvidenceCount = opportunities.filter((item) =>
    isAfricaEvidence(
      `${item.location} ${item.eligibility.join(" ")} ${item.tags.join(" ")}`,
    ),
  ).length;
  if (opportunities.length && ratio(africaEvidenceCount, opportunities.length) < 0.05) {
    alerts.push({
      code: "africa_coverage_low",
      severity: "warning",
      scope: "Africa",
      message:
        "Fewer than 5% of records contain published Africa location or eligibility evidence.",
    });
  }

  const remoteRecordCount = opportunities.filter((item) => item.remote).length;
  if (opportunities.length && ratio(remoteRecordCount, opportunities.length) < 0.1) {
    alerts.push({
      code: "remote_global_coverage_low",
      severity: "warning",
      scope: "remote",
      message: "Fewer than 10% of records are published as remote.",
    });
  }

  const knownDeadlineCount = opportunities.filter(
    (item) => item.deadline !== null,
  ).length;
  if (opportunities.length && ratio(knownDeadlineCount, opportunities.length) < 0.25) {
    alerts.push({
      code: "deadline_confidence_low",
      severity: "info",
      scope: "deadline",
      message:
        "Fewer than 25% of records have a known deadline; rolling and unknown deadlines require continued verification.",
    });
  }

  return {
    generatedAt: now.toISOString(),
    totalRecords: opportunities.length,
    activeRecords,
    verifiedRecords,
    verificationRate,
    duplicateRate,
    staleRecordCount,
    remoteRecordCount,
    africaEvidenceCount,
    knownDeadlineCount,
    sourceCounts,
    categoryCounts,
    alerts,
  };
}
