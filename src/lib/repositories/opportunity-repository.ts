import { getPool } from "@/lib/db";
import type { Opportunity } from "@/lib/types/opportunities";

type OpportunityRow = {
  id: string;
  title: string;
  organization: string;
  category: Opportunity["category"];
  summary: string;
  source_name: string;
  source_url: string;
  location: string;
  remote: boolean;
  deadline: Date | string | null;
  required_skills: string[];
  preferred_skills: string[];
  eligibility: string[];
  benefits: string[];
  tags: string[];
  difficulty: Opportunity["difficulty"];
  verification_status: Opportunity["verificationStatus"];
  last_verified_at: Date | string | null;
  last_seen_at: Date | string | null;
  source_status: Opportunity["sourceStatus"];
  http_status: number | null;
  canonical_url: string;
  publisher_domain: string;
  is_active: boolean;
  verification_confidence: number | string;
};

function serializeDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}

function serializeTimestamp(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function mapOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    title: row.title,
    organization: row.organization,
    category: row.category,
    summary: row.summary,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    location: row.location,
    remote: row.remote,
    deadline: serializeDate(row.deadline),
    requiredSkills: row.required_skills ?? [],
    preferredSkills: row.preferred_skills ?? [],
    eligibility: row.eligibility ?? [],
    benefits: row.benefits ?? [],
    tags: row.tags ?? [],
    difficulty: row.difficulty,
    verificationStatus: row.verification_status,
    lastVerifiedAt: serializeTimestamp(row.last_verified_at),
    lastSeenAt: serializeTimestamp(row.last_seen_at),
    sourceStatus: row.source_status,
    httpStatus: row.http_status,
    canonicalUrl: row.canonical_url,
    publisherDomain: row.publisher_domain,
    isActive: row.is_active,
    verificationConfidence: Number(row.verification_confidence),
  };
}

export async function listStoredOpportunities() {
  const db = getPool();
  if (!db) {
    return [];
  }

  const result = await db.query<OpportunityRow>(
    `select id, title, organization, category, summary, source_name, source_url,
      location, remote, deadline, required_skills, preferred_skills,
      eligibility, benefits, tags, difficulty, verification_status,
      last_verified_at, last_seen_at, source_status, http_status,
      canonical_url, publisher_domain, is_active, verification_confidence
     from opportunities
     where is_active = true
       and (deadline is null or deadline >= current_date)
     order by deadline nulls last, title
     limit 500`,
  );

  return result.rows.map(mapOpportunity);
}

export async function storeIngestionBatch(
  opportunities: Opportunity[],
  refreshedSourceNames: string[],
  ingestionStartedAt: Date,
) {
  const db = getPool();
  if (!db) {
    throw new Error("DATABASE_URL is required to store opportunities.");
  }

  const client = await db.connect();
  try {
    await client.query("begin");
    for (const opportunity of opportunities) {
      await client.query(
        `insert into opportunities (
          id, title, organization, category, summary, source_name, source_url,
          location, remote, deadline, required_skills, preferred_skills,
          eligibility, benefits, tags, difficulty, raw_payload,
          verification_status, last_verified_at, last_seen_at, source_status,
          http_status, canonical_url, publisher_domain, is_active,
          verification_confidence
        ) values (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17::jsonb,
          $18, $19, $20, $21,
          $22, $23, $24, $25, $26
        )
        on conflict (id) do update set
          title = excluded.title,
          organization = excluded.organization,
          category = excluded.category,
          summary = excluded.summary,
          source_name = excluded.source_name,
          source_url = excluded.source_url,
          location = excluded.location,
          remote = excluded.remote,
          deadline = excluded.deadline,
          required_skills = excluded.required_skills,
          preferred_skills = excluded.preferred_skills,
          eligibility = excluded.eligibility,
          benefits = excluded.benefits,
          tags = excluded.tags,
          difficulty = excluded.difficulty,
          raw_payload = excluded.raw_payload,
          verification_status = excluded.verification_status,
          last_verified_at = excluded.last_verified_at,
          last_seen_at = excluded.last_seen_at,
          source_status = excluded.source_status,
          http_status = excluded.http_status,
          canonical_url = excluded.canonical_url,
          publisher_domain = excluded.publisher_domain,
          is_active = excluded.is_active,
          verification_confidence = excluded.verification_confidence,
          updated_at = now()`,
        [
          opportunity.id,
          opportunity.title,
          opportunity.organization,
          opportunity.category,
          opportunity.summary,
          opportunity.sourceName,
          opportunity.sourceUrl,
          opportunity.location,
          opportunity.remote,
          opportunity.deadline,
          opportunity.requiredSkills,
          opportunity.preferredSkills,
          opportunity.eligibility,
          opportunity.benefits,
          opportunity.tags,
          opportunity.difficulty,
          JSON.stringify(opportunity),
          opportunity.verificationStatus,
          opportunity.lastVerifiedAt,
          opportunity.lastSeenAt,
          opportunity.sourceStatus,
          opportunity.httpStatus,
          opportunity.canonicalUrl,
          opportunity.publisherDomain,
          opportunity.isActive,
          opportunity.verificationConfidence,
        ],
      );
    }

    const staleResult = refreshedSourceNames.length
      ? await client.query(
          `update opportunities
           set verification_status = 'inactive_listing',
               source_status = 'stale',
               is_active = false,
               verification_confidence = 1,
               updated_at = now()
           where source_name = any($1::text[])
             and (last_seen_at is null or last_seen_at < $2)`,
          [refreshedSourceNames, ingestionStartedAt.toISOString()],
        )
      : { rowCount: 0 };
    await client.query("commit");

    return {
      stored: opportunities.length,
      deactivated: staleResult.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertOpportunities(opportunities: Opportunity[]) {
  const result = await storeIngestionBatch(opportunities, [], new Date());
  return result.stored;
}
