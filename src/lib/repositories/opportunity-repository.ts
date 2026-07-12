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
      eligibility, benefits, tags, difficulty
     from opportunities
     where deadline is null or deadline >= current_date
     order by deadline nulls last, title
     limit 500`,
  );

  return result.rows.map(mapOpportunity);
}

export async function upsertOpportunities(opportunities: Opportunity[]) {
  const db = getPool();
  if (!db) {
    throw new Error("DATABASE_URL is required to store opportunities.");
  }

  for (const opportunity of opportunities) {
    await db.query(
      `insert into opportunities (
        id, title, organization, category, summary, source_name, source_url,
        location, remote, deadline, required_skills, preferred_skills,
        eligibility, benefits, tags, difficulty, raw_payload
      ) values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17::jsonb
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
      ],
    );
  }

  return opportunities.length;
}
