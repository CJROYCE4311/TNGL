# Thursday League Scoring App

Lightweight Netlify/Supabase scoring app for the Sterling Grove Thursday couples golf league.

This app is intentionally separate from the Caddie server app and does not connect to GHIN.

## What Is Included

- Vite + React phone-first scoring UI.
- No-login player scoring and public leaderboard.
- Hidden URL admin page at `/admin-night` for league-night setup.
- Netlify Functions for all league reads and scoring writes.
- Supabase SQL schema in `supabase-schema.sql`.
- CSV-to-SQL seed script that preserves existing league IDs from `csv_tables`.
- Admin team builder for couples scramble, 4/5-player scramble, and best-ball events.
- Team scoring that lets players select their published team and enter the correct scorecard for the format.
- Public live leaderboard and admin CSV export.

## Local Setup

```sh
cd thursday-league-scoring-app-netlify-supabase
npm install
cp .env.example .env
```

Fill in `.env`:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_AUTH_REDIRECT_URL=https://your-netlify-site.netlify.app
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
LEAGUE_ADMIN_EMAILS=you@example.com
```

Run locally:

```sh
npm run dev
```

Routes:

- `/admin-night` creates the active event, chooses the game, builds teams, and previews handicaps/dots.
- `/score` lets players select their team and enter scores without login.
- `/leaderboard` shows the public live board.

## Supabase Setup

1. Create a Supabase project.
2. Open the SQL Editor.
3. Run `supabase-schema.sql`.
   - If the database already exists, run `supabase/patches/2026-05-16-add-tonight-states.sql`.
   - Also run `supabase/patches/2026-05-16-add-scorecard-player-selection.sql` to support selected players and calculated card handicaps on scorecards.
4. Optional: run `supabase/patches/2026-05-16-reimagined-public-scoring.sql` for forward-compatible game type/player-hole score columns. The app also works against the existing starter schema by storing game type in `league_events.nine` and best-ball player detail in `hole_scores.notes`.

The browser only receives the anon key. The service role key is used only by Netlify Functions.

## Import Current League Data

Generate seed SQL from the existing CSV tables:

```sh
npm run --silent seed:sql -- --event-date=2026-05-21 --format=scramble --holes=9 --status=open > seed-2026-05-21.sql
```

Supported formats:

- `scramble`
- `best_ball`

Then run the generated SQL in Supabase SQL Editor.

The seed script imports from the app's tracked `csv_tables` folder:

- `csv_tables/courses.csv`
- `csv_tables/leagues.csv`
- `csv_tables/players.csv`
- `csv_tables/tee_ratings.csv`
- `csv_tables/player_handicaps.csv`
- the matching active team table for the selected format
- the matching team-player assignment table

It does not create fake holes or scores. If you have hole-by-hole par data later, insert it into `event_holes`; the UI will automatically show to-par once par data exists.

## Netlify Deploy

Build command:

```sh
npm run build
```

Publish directory:

```text
dist
```

Netlify environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_AUTH_REDIRECT_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
LEAGUE_ADMIN_EMAILS
```

Set `VITE_AUTH_REDIRECT_URL` to the deployed Netlify site URL. Supabase Auth magic links sent from local development otherwise point at `localhost`, which only works on the computer running the dev server.

## API Endpoints

- `GET /.netlify/functions/events`
- `GET /.netlify/functions/event-detail?eventId=...`
- `GET /.netlify/functions/active-event`
- `GET /.netlify/functions/admin-event`
- `POST /.netlify/functions/admin-event`
- `POST /.netlify/functions/save-score`
- `POST /.netlify/functions/submit-scorecard`
- `GET /.netlify/functions/leaderboard?eventId=...`
- `GET /.netlify/functions/export-results?eventId=...`

Admin, scoring, and leaderboard endpoints do not require login by design. The admin page is protected only by its hidden URL, which is convenient for league night but not strong security.

## V1 Limitations

- No GHIN integration.
- No Caddie integration.
- Admin URL is hidden but not authenticated.
- No edit history beyond `updated_at`.
- No scorer/team assignment rules yet; anyone with the scoring URL can save a scorecard.
