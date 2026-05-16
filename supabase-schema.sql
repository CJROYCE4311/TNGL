-- Thursday League scoring app schema.
-- Source CSV IDs are preserved in external_* columns so imports stay traceable.

create extension if not exists pgcrypto;

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  external_course_id text unique not null,
  course_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists league_events (
  id uuid primary key default gen_random_uuid(),
  external_league_id text,
  league_name text not null default 'Sterling Grove Thursday League',
  event_date date not null,
  format text not null check (format in ('scramble', 'best_ball', 'other')),
  game_type text not null default 'couples_scramble' check (game_type in ('couples_scramble', 'scramble', 'best_ball')),
  course_id uuid references courses(id),
  course_name text,
  nine text,
  hole_count integer not null default 9 check (hole_count between 1 and 18),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_date, format)
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  external_player_id text unique not null,
  display_name text not null,
  normalized_name text,
  gender text,
  home_club text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists tee_ratings (
  id uuid primary key default gen_random_uuid(),
  external_tee_rating_id text unique not null,
  course_id uuid not null references courses(id) on delete cascade,
  gender text,
  tee text,
  course_rating numeric(5,2),
  slope integer,
  is_men_league_tee boolean not null default false,
  is_women_league_tee boolean not null default false
);

create table if not exists player_handicaps (
  id uuid primary key default gen_random_uuid(),
  external_player_handicap_id text unique not null,
  player_id uuid not null references players(id) on delete cascade,
  external_league_id text not null,
  effective_date date,
  league_tee text,
  tee_rating_id uuid references tee_ratings(id),
  handicap_index numeric(5,2),
  course_rating numeric(5,2),
  slope integer,
  course_handicap_100 integer,
  best_ball_handicap_95 integer,
  notes text,
  unique(player_id, external_league_id, effective_date)
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  external_team_id text not null,
  event_id uuid not null references league_events(id) on delete cascade,
  team_name text not null,
  starting_hole integer,
  tee_time text,
  flight text,
  is_active boolean not null default true,
  team_handicap numeric(6,2),
  source_format text,
  source_row integer,
  created_at timestamptz not null default now(),
  unique(event_id, external_team_id)
);

create table if not exists team_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  position integer,
  assigned_role text,
  course_handicap_100 integer,
  playing_handicap integer,
  unique(team_id, player_id)
);

create table if not exists event_holes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references league_events(id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer,
  handicap integer,
  yards integer,
  unique(event_id, hole_number)
);

create table if not exists scorecards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references league_events(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  scorer_user_id uuid,
  scorer_email text,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'locked')),
  selected_player_ids uuid[],
  playing_handicap numeric(6,2),
  gross_total integer,
  net_total numeric(6,2),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, team_id)
);

create table if not exists hole_scores (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references scorecards(id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  gross_score integer check (gross_score between 1 and 20),
  net_score numeric(5,2),
  notes text,
  updated_at timestamptz not null default now(),
  unique(scorecard_id, hole_number)
);

create table if not exists player_hole_scores (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references scorecards(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  gross_score integer check (gross_score between 1 and 20),
  net_score numeric(5,2),
  dots integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(scorecard_id, player_id, hole_number)
);

create table if not exists tonight_states (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_league_events_event_date on league_events(event_date);
create index if not exists idx_teams_event_id on teams(event_id);
create index if not exists idx_team_players_team_id on team_players(team_id);
create index if not exists idx_scorecards_event_id on scorecards(event_id);
create index if not exists idx_hole_scores_scorecard_id on hole_scores(scorecard_id);
create index if not exists idx_player_hole_scores_scorecard_id on player_hole_scores(scorecard_id);

alter table courses enable row level security;
alter table league_events enable row level security;
alter table players enable row level security;
alter table tee_ratings enable row level security;
alter table player_handicaps enable row level security;
alter table teams enable row level security;
alter table team_players enable row level security;
alter table event_holes enable row level security;
alter table scorecards enable row level security;
alter table hole_scores enable row level security;
alter table player_hole_scores enable row level security;
alter table tonight_states enable row level security;

-- V1 uses Netlify Functions with the service role key for reads and writes.
-- Add explicit RLS policies later if you decide to let the browser query tables directly.
