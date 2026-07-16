import fs from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to seed opportunities.");
  process.exit(1);
}

const source = await fs.readFile(
  new URL("../src/lib/opportunities/data/static-opportunities.ts", import.meta.url),
  "utf8",
);
const match = source.match(
  /const staticOpportunityCatalog: StaticOpportunity\[] = ([\s\S]*?);\s*\n\s*export const/,
);

if (!match?.[1]) {
  console.error("Could not read static opportunity seed data.");
  process.exit(1);
}

const opportunities = Function(`return ${match[1]}`)().map((opportunity) => ({
  ...opportunity,
  verificationStatus: "unverified",
  lastVerifiedAt: null,
  lastSeenAt: new Date().toISOString(),
  sourceStatus: "unverified",
  httpStatus: null,
  canonicalUrl: opportunity.sourceUrl,
  publisherDomain: new URL(opportunity.sourceUrl).hostname.replace(/^www\./, ""),
  isActive: true,
  verificationConfidence: 0,
}));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  for (const opportunity of opportunities) {
    await pool.query(
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

  console.log(`Seeded ${opportunities.length} opportunities.`);
} finally {
  await pool.end();
}
