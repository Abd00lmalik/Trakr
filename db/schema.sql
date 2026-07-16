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
  request_id_hash text,
  request_fingerprint text,
  provider text not null,
  ai_status text not null,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  duration_ms integer,
  retention_days smallint not null default 30,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

alter table recommendation_runs
  add column if not exists request_id_hash text,
  add column if not exists request_fingerprint text,
  add column if not exists ai_status text not null default 'unknown',
  add column if not exists input_summary jsonb not null default '{}'::jsonb,
  add column if not exists output_summary jsonb not null default '{}'::jsonb,
  add column if not exists duration_ms integer,
  add column if not exists retention_days smallint not null default 30,
  add column if not exists expires_at timestamptz
    not null default (now() + interval '30 days');

update recommendation_runs
set input_summary = '{"schemaVersion":1,"legacyRecord":true}'::jsonb,
    output_summary = '{"schemaVersion":1,"legacyRecord":true}'::jsonb
where input_summary = '{}'::jsonb
  and output_summary = '{}'::jsonb;

drop index if exists recommendation_runs_request_id_idx;

alter table recommendation_runs
  drop column if exists request_id,
  drop column if exists request_payload,
  drop column if exists response_payload;

create index if not exists recommendation_runs_request_id_hash_idx
  on recommendation_runs (request_id_hash)
  where request_id_hash is not null;

create index if not exists recommendation_runs_created_at_idx
  on recommendation_runs (created_at desc);

create index if not exists recommendation_runs_expires_at_idx
  on recommendation_runs (expires_at);
