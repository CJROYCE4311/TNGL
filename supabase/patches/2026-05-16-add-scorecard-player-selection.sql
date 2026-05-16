alter table scorecards
  add column if not exists selected_player_ids uuid[],
  add column if not exists playing_handicap numeric(6,2);
