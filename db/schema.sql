create extension if not exists vector;

create table if not exists opportunities (
  id text primary key,
  title text not null,
  organization text not null,
  category text not null check (
    category in (
      'hackathon',
      'grant',
      'scholarship',
      'fellowship',
      'internship',
      'remote_job',
      'web3_bounty'
    )
  ),
  summary text not null,
  source_name text not null,
  source_url text not null,
  location text not null,
  remote boolean not null default false,
  deadline date,
  required_skills text[] not null default '{}',
  preferred_skills text[] not null default '{}',
  eligibility text[] not null default '{}',
  benefits text[] not null default '{}',
  tags text[] not null default '{}',
  difficulty text not null check (difficulty in ('low', 'medium', 'high')),
  embedding vector(1536),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_category_idx on opportunities (category);
create index if not exists opportunities_deadline_idx on opportunities (deadline);
create index if not exists opportunities_remote_idx on opportunities (remote);
create index if not exists opportunities_embedding_idx
  on opportunities using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create table if not exists recommendation_runs (
  id bigserial primary key,
  request_id text not null,
  provider text not null,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_runs_request_id_idx
  on recommendation_runs (request_id);

create index if not exists recommendation_runs_created_at_idx
  on recommendation_runs (created_at desc);
