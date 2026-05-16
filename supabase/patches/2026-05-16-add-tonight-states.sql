-- Shared state cache for unauthenticated Tonight mode.
-- Netlify Functions read/write this table with the Supabase service role key.

create table if not exists tonight_states (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table tonight_states enable row level security;
