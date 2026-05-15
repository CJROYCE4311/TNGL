-- Add David and Marianne Solomon to the Sterling Grove Thursday League roster.
-- GHIN lookup on 2026-05-15 showed:
-- David Solomon, Sterling Grove Golf & Country Club, Handicap Index 18.6
-- Marianne Solomon, Sterling Grove Golf & Country Club, Handicap Index 40.2

begin;

insert into players (external_player_id, display_name, normalized_name, gender, home_club)
values
  ('player_david_solomon', 'David Solomon', 'david_solomon', 'Men', 'Sterling Grove Golf & Country Club'),
  ('player_marianne_solomon', 'Marianne Solomon', 'marianne_solomon', 'Women', 'Sterling Grove Golf & Country Club')
on conflict (external_player_id) do update set
  display_name = excluded.display_name,
  normalized_name = excluded.normalized_name,
  gender = excluded.gender,
  home_club = excluded.home_club,
  active = true;

insert into player_handicaps (
  external_player_handicap_id,
  player_id,
  external_league_id,
  effective_date,
  league_tee,
  tee_rating_id,
  handicap_index,
  course_rating,
  slope,
  course_handicap_100,
  best_ball_handicap_95,
  notes
)
select
  'handicap_sg_thursday_2026_player_david_solomon',
  p.id,
  'sg_thursday_2026',
  '2026-05-15'::date,
  'Blue',
  tr.id,
  18.6,
  70.5,
  124,
  19,
  18,
  'Added from GHIN golfer lookup'
from players p
left join tee_ratings tr on tr.external_tee_rating_id = 'tee_men_blue'
where p.external_player_id = 'player_david_solomon'
on conflict (external_player_handicap_id) do update set
  handicap_index = excluded.handicap_index,
  course_handicap_100 = excluded.course_handicap_100,
  best_ball_handicap_95 = excluded.best_ball_handicap_95,
  notes = excluded.notes;

insert into player_handicaps (
  external_player_handicap_id,
  player_id,
  external_league_id,
  effective_date,
  league_tee,
  tee_rating_id,
  handicap_index,
  course_rating,
  slope,
  course_handicap_100,
  best_ball_handicap_95,
  notes
)
select
  'handicap_sg_thursday_2026_player_marianne_solomon',
  p.id,
  'sg_thursday_2026',
  '2026-05-15'::date,
  'Red',
  tr.id,
  40.2,
  67.3,
  112,
  35,
  33,
  'Added from GHIN golfer lookup'
from players p
left join tee_ratings tr on tr.external_tee_rating_id = 'tee_women_red'
where p.external_player_id = 'player_marianne_solomon'
on conflict (external_player_handicap_id) do update set
  handicap_index = excluded.handicap_index,
  course_handicap_100 = excluded.course_handicap_100,
  best_ball_handicap_95 = excluded.best_ball_handicap_95,
  notes = excluded.notes;

commit;
