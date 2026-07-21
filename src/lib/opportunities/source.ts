import type {
  Opportunity,
  RecommendationFilters,
  RecommendationRequest,
} from "@/lib/types/opportunities";
import { isGeographicallyActionable } from "@/lib/opportunities/metadata";

export interface OpportunitySource {
  name: string;
  fetchOpportunities(
    request: RecommendationRequest,
    filters: RecommendationFilters,
  ): Promise<Opportunity[]>;
}

export function applyOpportunityFilters(
  opportunities: Opportunity[],
  filters: RecommendationFilters,
) {
  return opportunities.filter((opportunity) => {
    if (filters.categories?.length && !filters.categories.includes(opportunity.category)) {
      return false;
    }

    if (
      filters.opportunityTypes?.length &&
      (!opportunity.opportunityType ||
        !filters.opportunityTypes.includes(opportunity.opportunityType))
    ) {
      return false;
    }

    if (
      filters.domains?.length &&
      !opportunity.domains?.some((domain) => filters.domains?.includes(domain))
    ) {
      return false;
    }

    if (
      filters.remoteScopes?.length &&
      (!opportunity.geography ||
        !filters.remoteScopes.includes(opportunity.geography.remoteScope))
    ) {
      return false;
    }

    if (typeof filters.remote === "boolean" && opportunity.remote !== filters.remote) {
      return false;
    }

    if (filters.location) {
      const requestedLocation = filters.location.toLowerCase();
      const candidateLocation = opportunity.location.toLowerCase();
      if (
        !candidateLocation.includes(requestedLocation) &&
        !isGeographicallyActionable(
          opportunity,
          filters.applicantCountry,
          Boolean(filters.remote),
        )
      ) {
        return false;
      }
    }

    if (
      filters.applicantCountry &&
      !isGeographicallyActionable(
        opportunity,
        filters.applicantCountry,
        Boolean(filters.remote),
      )
    ) {
      return false;
    }

    if (filters.deadlineAfter && opportunity.deadline) {
      if (opportunity.deadline < filters.deadlineAfter) {
        return false;
      }
    }

    if (filters.deadlineBefore && opportunity.deadline) {
      if (opportunity.deadline > filters.deadlineBefore) {
        return false;
      }
    }

    return true;
  });
}
