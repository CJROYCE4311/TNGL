# Netlify + Supabase Setup Checklist

## 1. Create The Supabase Project

1. Go to Supabase and create a new project, for example `thursday-league-scoring`.
2. Save these values:
   - Project URL
   - anon public key
   - service role key
3. Keep the service role key secret. It belongs only in Netlify environment variables, never in browser JavaScript.

## 2. Create Tables

1. Open Supabase SQL Editor.
2. Run `supabase-schema.sql` from this folder.
3. Confirm the tables were created:
   - `league_events`
   - `players`
   - `player_handicaps`
   - `teams`
   - `team_players`
   - `courses`
   - `holes`
   - `scorecards`
   - `hole_scores`

## 3. Import Existing League Data

Use the current Google Drive Thursday League tables as source files:

- `players.csv`
- `player_handicaps.csv`
- `relationships.csv`
- `leagues.csv`
- `courses.csv`
- `tee_ratings.csv`
- team tables for the active format

Suggested import path:

1. Download or export the CSV tables from Google Drive.
2. Inspect `data_dictionary.csv` first.
3. Import `players.csv` into `players`.
4. Import `player_handicaps.csv` into `player_handicaps`.
5. Import `courses.csv` and `tee_ratings.csv` into course/hole setup tables as needed.
6. Import active event/team data into `league_events`, `teams`, and `team_players`.

If the existing CSV column names differ from the starter schema, keep the source names in a staging table first, then map them into the app tables.

## 4. Create The Netlify Site

Recommended stack:

- Vite
- React or plain HTML/JavaScript
- Netlify Functions
- Supabase JS client

Suggested folder shape:

```text
thursday-league-scoring/
  netlify.toml
  package.json
  src/
    main.js
    styles.css
  netlify/
    functions/
      events.js
      scorecards.js
      leaderboard.js
      export-results.js
```

## 5. Add Netlify Environment Variables

In Netlify site settings, add:

```text
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
LEAGUE_ADMIN_EMAILS=you@example.com
```

Browser code may use:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Netlify Functions may use:

- `SUPABASE_SERVICE_ROLE_KEY`

## 6. Authentication

For the simplest v1:

- Use Supabase magic-link auth for admins and scorers.
- Restrict score submission to authenticated users.
- Keep public views read-only, or make the whole app login-only.

For one-night pilot testing:

- Start login-only.
- Add trusted scorers manually in Supabase Auth.

## 7. Netlify Deploy

1. Push the app to GitHub.
2. Connect the repo to Netlify.
3. Set build command, for example:

```sh
npm run build
```

4. Set publish directory, for example:

```text
dist
```

5. Deploy.

## 8. Pilot Checklist

Before first Thursday use:

- Create the event for that date.
- Load teams/groups.
- Test score entry on a phone.
- Test two users entering different teams at the same time.
- Test editing a mistaken score.
- Test leaderboard refresh.
- Export final scores.

