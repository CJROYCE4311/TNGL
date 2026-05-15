# Migration Notes

Run `supabase-schema.sql` in the Supabase SQL Editor for the initial database.

The app schema intentionally keeps the source CSV identifiers in `external_*` columns:

- `players.external_player_id` maps to `csv_tables/players.csv:player_id`
- `teams.external_team_id` maps to the active format team ID
- `league_events.external_league_id` maps to `csv_tables/leagues.csv:league_id`
- `courses.external_course_id` maps to `csv_tables/courses.csv:course_id`

No fake holes, scorecards, players, or teams are created by the schema. Use `scripts/build-seed-sql.js` with an explicit event date and format to import the current CSV data for a real league night.
