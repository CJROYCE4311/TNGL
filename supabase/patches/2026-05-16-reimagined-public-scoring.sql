alter table league_events
  add column if not exists game_type text not null default 'couples_scramble';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'league_events_game_type_check'
  ) then
    alter table league_events
      add constraint league_events_game_type_check
      check (game_type in ('couples_scramble', 'scramble', 'best_ball'));
  end if;
end $$;

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

create index if not exists idx_player_hole_scores_scorecard_id on player_hole_scores(scorecard_id);

alter table player_hole_scores enable row level security;
