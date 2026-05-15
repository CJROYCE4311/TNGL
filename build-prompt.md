# Build Prompt For Thursday League Scoring App

Use this prompt in the Thursday League project folder when ready to build the lightweight scoring app.

```text
Build a lightweight web scoring app for our Sterling Grove Thursday couples golf league.

Important constraints:
- Do not touch the existing Caddie server app or personal golf tracking workflow.
- This is a separate hosted app intended for Netlify.
- Use Supabase as the backend database/auth provider.
- Use the existing Thursday League data files in this folder as source material, especially:
  - sterling-grove-thursday-league.xlsx
  - sterling-grove-thursday-league-rules.docx
  - csv_tables/players.csv
  - csv_tables/player_handicaps.csv
  - csv_tables/relationships.csv
  - csv_tables/leagues.csv
  - csv_tables/courses.csv
  - csv_tables/tee_ratings.csv
  - csv_tables/scramble_teams.csv
  - csv_tables/scramble_team_players.csv
  - csv_tables/scramble_allocation_rules.csv
  - csv_tables/best_ball_teams.csv
  - csv_tables/best_ball_team_players.csv
  - csv_tables/data_dictionary.csv

Goal:
Create a simple mobile-friendly scoring app for Thursday night league play on my own website.

V1 features:
- Login-gated access for scorers/admins.
- Select current league event.
- Select team/group.
- Enter gross score by hole.
- Show running total and to-par if course/par data is available.
- Save in-progress scores.
- Submit final scorecard.
- Admin leaderboard view.
- Admin CSV export of results.

Technical preferences:
- Netlify deploy.
- Netlify Functions for API endpoints.
- Supabase for auth and data storage.
- Keep the code simple and low-dependency.
- Prefer Vite with plain JavaScript or React.
- Make the UI phone-first and fast for use during a round.

Data handling:
- Inspect data_dictionary.csv and existing CSVs before designing the final schema.
- Use existing player IDs, team IDs, handicaps, course data, and league tables where possible.
- If schema changes are needed, create migration notes rather than silently inventing incompatible fields.
- Do not create fake players, handicaps, scores, or teams.

Deliverables:
- Working local app.
- Supabase SQL schema/migrations.
- CSV import instructions or scripts.
- Netlify environment variable checklist.
- README with deployment steps.

Safety:
- Do not include Supabase service role keys in browser code.
- Do not store GHIN credentials.
- Do not integrate with Caddie or GHIN in V1.
```

