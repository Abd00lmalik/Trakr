import type { Opportunity } from "@/lib/types/opportunities";
import { enrichOpportunityMetadata } from "@/lib/opportunities/metadata";

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
    | "deadline_confidence_low"
    | "geographic_confidence_low"
    | "source_concentration_high"
    | "expired_actionable_record"
    | "unverified_rate_high";
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
  exactCurrentDeadlineCount?: number;
  actionableRecordCount?: number;
  exploreRecordCount?: number;
  researchLeadRecordCount?: number;
  unknownGeographyCount?: number;
  africaAccessibleCount?: number;
  sourceCounts: Record<string, number>;
  sourceGroupCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  opportunityTypeCounts?: Record<string, number>;
  domainCounts?: Record<string, number>;
  remoteScopeCounts?: Record<string, number>;
  deadlineStateCounts?: Record<string, number>;
  recommendationStateCounts?: Record<string, number>;
  coverageMatrix?: InventoryCoverageCell[];
  sourceHealth?: Record<string, InventorySourceHealth>;
  alerts: InventoryAlert[];
};

export type InventoryCoverageStatus =
  | "healthy"
  | "thin"
  | "very_thin"
  | "no_verified_coverage"
  | "data_quality_problem"
  | "unknown_eligibility";

export type InventoryCoverageCell = {
  segment: string;
  dimension: "opportunity_type" | "domain" | "country" | "region" | "remote_scope" | "type_domain";
  total: number;
  verifiedActive: number;
  applyNow: number;
  exactDeadline: number;
  geographicEvidence: number;
  status: InventoryCoverageStatus;
};

export type InventorySourceHealth = {
  records: number;
  verifiedActive: number;
  stale: number;
  inactive: number;
  unverified: number;
  duplicateRate: number;
  lastSuccessfulVerification: string | null;
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

function increment(record: Record<string, number>, key: string | undefined) {
  if (!key) return;
  record[key] = (record[key] ?? 0) + 1;
}

function coverageStatus(cell: Omit<InventoryCoverageCell, "status">): InventoryCoverageStatus {
  if (!cell.verifiedActive) {
    return cell.total ? "data_quality_problem" : "no_verified_coverage";
  }
  if (!cell.geographicEvidence && cell.dimension !== "domain") {
    return "unknown_eligibility";
  }
  if (cell.applyNow >= 5) return "healthy";
  if (cell.applyNow >= 2) return "thin";
  return "very_thin";
}

function buildCoverageMatrix(opportunities: Opportunity[]) {
  const cells = new Map<string, Omit<InventoryCoverageCell, "status">>();

  function add(
    dimension: InventoryCoverageCell["dimension"],
    segment: string,
    opportunity: Opportunity,
  ) {
    const key = `${dimension}:${segment}`;
    const current = cells.get(key) ?? {
      segment,
      dimension,
      total: 0,
      verifiedActive: 0,
      applyNow: 0,
      exactDeadline: 0,
      geographicEvidence: 0,
    };
    current.total += 1;
    if (opportunity.verificationStatus === "verified" && opportunity.isActive) {
      current.verifiedActive += 1;
    }
    if (opportunity.recommendationState === "apply_now") current.applyNow += 1;
    if (
      opportunity.deadlineInfo?.state === "exact_future" &&
      opportunity.deadlineInfo.currentCycle === "confirmed"
    ) {
      current.exactDeadline += 1;
    }
    if (
      opportunity.geography &&
      opportunity.geography.confidence !== "low" &&
      opportunity.geography.confidence !== "unknown"
    ) {
      current.geographicEvidence += 1;
    }
    cells.set(key, current);
  }

  for (const opportunity of opportunities) {
    const type = opportunity.opportunityType ?? opportunity.category;
    add("opportunity_type", type, opportunity);
    for (const domain of opportunity.domains ?? []) {
      add("domain", domain, opportunity);
      add("type_domain", `${type}:${domain}`, opportunity);
    }
    for (const country of opportunity.geography?.eligibleCountries ?? []) {
      add("country", country, opportunity);
    }
    for (const region of opportunity.geography?.eligibleRegions ?? []) {
      add("region", region, opportunity);
    }
    if (opportunity.geography?.remoteScope) {
      add("remote_scope", opportunity.geography.remoteScope, opportunity);
    }
  }

  return [...cells.values()]
    .map((cell) => ({ ...cell, status: coverageStatus(cell) }))
    .sort(
      (left, right) =>
        left.dimension.localeCompare(right.dimension) ||
        right.applyNow - left.applyNow ||
        left.segment.localeCompare(right.segment),
    );
}

function buildSourceHealth(opportunities: Opportunity[], now: Date) {
  const grouped = new Map<string, Opportunity[]>();
  for (const opportunity of opportunities) {
    grouped.set(opportunity.sourceName, [
      ...(grouped.get(opportunity.sourceName) ?? []),
      opportunity,
    ]);
  }
  return Object.fromEntries(
    [...grouped.entries()].map(([source, records]) => {
      const canonical = new Set<string>();
      let duplicates = 0;
      for (const record of records) {
        if (canonical.has(record.canonicalUrl)) duplicates += 1;
        canonical.add(record.canonicalUrl);
      }
      const verifiedDates = records
        .map((record) => record.lastVerifiedAt)
        .filter((value): value is string => Boolean(value))
        .sort();
      return [
        source,
        {
          records: records.length,
          verifiedActive: records.filter(
            (record) =>
              record.verificationStatus === "verified" && record.isActive,
          ).length,
          stale: records.filter((record) => isStale(record, now)).length,
          inactive: records.filter((record) => !record.isActive).length,
          unverified: records.filter(
            (record) => record.verificationStatus === "unverified",
          ).length,
          duplicateRate: ratio(duplicates, records.length),
          lastSuccessfulVerification: verifiedDates.at(-1) ?? null,
        },
      ];
    }),
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
  sourceGroupCounts = {},
  failedSources = [],
  previous,
  now = new Date(),
}: {
  opportunities: Opportunity[];
  expectedSources: string[];
  sourceGroupCounts?: Record<string, number>;
  failedSources?: string[];
  previous?: InventoryMonitoringSnapshot;
  now?: Date;
}): InventoryMonitoringSnapshot {
  const enriched = opportunities.map((opportunity) =>
    enrichOpportunityMetadata(opportunity, now),
  );
  const alerts: InventoryAlert[] = [];
  const sourceCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const canonicalUrls = new Set<string>();
  let duplicateCount = 0;

  const opportunityTypeCounts: Record<string, number> = {};
  const domainCounts: Record<string, number> = {};
  const remoteScopeCounts: Record<string, number> = {};
  const deadlineStateCounts: Record<string, number> = {};
  const recommendationStateCounts: Record<string, number> = {};

  for (const opportunity of enriched) {
    sourceCounts[opportunity.sourceName] =
      (sourceCounts[opportunity.sourceName] ?? 0) + 1;
    categoryCounts[opportunity.category] =
      (categoryCounts[opportunity.category] ?? 0) + 1;
    increment(opportunityTypeCounts, opportunity.opportunityType);
    for (const domain of opportunity.domains ?? []) increment(domainCounts, domain);
    increment(remoteScopeCounts, opportunity.geography?.remoteScope);
    increment(deadlineStateCounts, opportunity.deadlineInfo?.state);
    increment(recommendationStateCounts, opportunity.recommendationState);
    if (canonicalUrls.has(opportunity.canonicalUrl)) duplicateCount += 1;
    canonicalUrls.add(opportunity.canonicalUrl);
  }

  for (const source of expectedSources) {
    if (
      !sourceGroupCounts[source] &&
      !sourceCounts[source] &&
      !failedSources.includes(source)
    ) {
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
      enriched.length - previous.totalRecords,
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

  const activeRecords = enriched.filter((item) => item.isActive).length;
  const verifiedRecords = enriched.filter(
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
  if (activeRecords && ratio(activeRecords - verifiedRecords, activeRecords) > 0.15) {
    alerts.push({
      code: "unverified_rate_high",
      severity: ratio(activeRecords - verifiedRecords, activeRecords) > 0.3
        ? "critical"
        : "warning",
      scope: "inventory",
      message: `${Math.round(ratio(activeRecords - verifiedRecords, activeRecords) * 100)}% of active records are not verified active opportunities.`,
    });
  }

  const staleRecordCount = enriched.filter((item) =>
    isStale(item, now),
  ).length;
  if (staleRecordCount) {
    alerts.push({
      code: "stale_inventory",
      severity:
        ratio(staleRecordCount, enriched.length) >= 0.1
          ? "critical"
          : "warning",
      scope: "inventory",
      message: `${staleRecordCount} records have not been verified or seen in the last 72 hours.`,
    });
  }

  const duplicateRate = ratio(duplicateCount, enriched.length);
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

  const africaEvidenceCount = enriched.filter((item) =>
    isAfricaEvidence(
      `${item.location} ${item.eligibility.join(" ")} ${item.tags.join(" ")}`,
    ),
  ).length;
  if (enriched.length && ratio(africaEvidenceCount, enriched.length) < 0.05) {
    alerts.push({
      code: "africa_coverage_low",
      severity: "warning",
      scope: "Africa",
      message:
        "Fewer than 5% of records contain published Africa location or eligibility evidence.",
    });
  }

  const remoteRecordCount = enriched.filter((item) => item.remote).length;
  if (enriched.length && ratio(remoteRecordCount, enriched.length) < 0.1) {
    alerts.push({
      code: "remote_global_coverage_low",
      severity: "warning",
      scope: "remote",
      message: "Fewer than 10% of records are published as remote.",
    });
  }

  const knownDeadlineCount = enriched.filter(
    (item) => item.deadline !== null,
  ).length;
  if (enriched.length && ratio(knownDeadlineCount, enriched.length) < 0.25) {
    alerts.push({
      code: "deadline_confidence_low",
      severity: "info",
      scope: "deadline",
      message:
        "Fewer than 25% of records have a known deadline; rolling and unknown deadlines require continued verification.",
    });
  }

  const exactCurrentDeadlineCount = enriched.filter(
    (item) =>
      item.deadlineInfo?.state === "exact_future" &&
      item.deadlineInfo.currentCycle === "confirmed",
  ).length;
  const actionableRecordCount = enriched.filter(
    (item) => item.recommendationState === "apply_now",
  ).length;
  const exploreRecordCount = enriched.filter(
    (item) => item.recommendationState === "explore",
  ).length;
  const researchLeadRecordCount = enriched.filter(
    (item) => item.recommendationState === "research_lead",
  ).length;
  const unknownGeographyCount = enriched.filter(
    (item) =>
      !item.geography ||
      item.geography.confidence === "low" ||
      item.geography.confidence === "unknown" ||
      item.geography.unknownConditions.length > 0,
  ).length;
  const africaAccessibleCount = enriched.filter(
    (item) =>
      item.recommendationState === "apply_now" &&
      item.geography?.confidence !== "low" &&
      item.geography?.confidence !== "unknown" &&
      item.geography?.unknownConditions.length === 0 &&
      (item.geography?.eligibleRegions.includes("Africa") ||
        item.geography?.eligibleCountries.some((country) =>
          isAfricaEvidence(country),
        )),
  ).length;
  if (enriched.length && ratio(unknownGeographyCount, enriched.length) > 0.25) {
    alerts.push({
      code: "geographic_confidence_low",
      severity: ratio(unknownGeographyCount, enriched.length) > 0.5
        ? "critical"
        : "warning",
      scope: "geography",
      message: `${unknownGeographyCount} records have unknown or low-confidence geographic eligibility.`,
    });
  }

  const largestSourceGroup = Math.max(
    0,
    ...Object.values(sourceGroupCounts),
  );
  if (
    enriched.length &&
    ratio(largestSourceGroup, enriched.length) > 0.5
  ) {
    alerts.push({
      code: "source_concentration_high",
      severity: ratio(largestSourceGroup, enriched.length) > 0.75
        ? "critical"
        : "warning",
      scope: "sources",
      message: `The largest source group supplies ${Math.round(ratio(largestSourceGroup, enriched.length) * 100)}% of inventory.`,
    });
  }
  if (
    enriched.some(
      (item) =>
        item.recommendationState === "apply_now" &&
        (item.deadlineInfo?.state === "passed" ||
          item.deadlineInfo?.state === "closed"),
    )
  ) {
    alerts.push({
      code: "expired_actionable_record",
      severity: "critical",
      scope: "recommendations",
      message: "At least one expired or closed record is incorrectly marked Apply Now.",
    });
  }

  return {
    generatedAt: now.toISOString(),
    totalRecords: enriched.length,
    activeRecords,
    verifiedRecords,
    verificationRate,
    duplicateRate,
    staleRecordCount,
    remoteRecordCount,
    africaEvidenceCount,
    knownDeadlineCount,
    exactCurrentDeadlineCount,
    actionableRecordCount,
    exploreRecordCount,
    researchLeadRecordCount,
    unknownGeographyCount,
    africaAccessibleCount,
    sourceCounts,
    sourceGroupCounts,
    categoryCounts,
    opportunityTypeCounts,
    domainCounts,
    remoteScopeCounts,
    deadlineStateCounts,
    recommendationStateCounts,
    coverageMatrix: buildCoverageMatrix(enriched),
    sourceHealth: buildSourceHealth(enriched, now),
    alerts,
  };
}
