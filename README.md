# Thursday League Scoring App

Lightweight Netlify/Supabase scoring app for the Sterling Grove Thursday couples golf league.

This app is intentionally separate from the Caddie server app and does not connect to GHIN.

## What Is Included

- Immediate local "Tonight" mode for couples scramble scoring before Supabase is configured.
- Vite + React phone-first scoring UI.
- Supabase magic-link login.
- Netlify Functions for all league reads and scoring writes.
- Supabase SQL schema in `supabase-schema.sql`.
- CSV-to-SQL seed script that preserves existing league IDs from `../csv_tables`.
- Admin leaderboard and authenticated CSV export.

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

If `.env` is not filled in yet, the app opens in Tonight mode. Tonight mode stores check-ins, foursome assignments, scores, submissions, and CSV export in browser local storage so it can be used immediately for a league night pilot.

Tonight mode includes:

- Couple check-in list from the current league CSV player names.
- Foursome assignment selector for each checked-in couple.
- One scorecard per foursome with side-by-side scramble team scoring.
- Live leaderboard toggle.
- Local CSV export.
- Temporary Sterling Grove course imagery from public Sterling Grove web assets.

## Supabase Setup

1. Create a Supabase project.
2. Open the SQL Editor.
3. Run `supabase-schema.sql`.
4. Enable email magic links in Supabase Auth.
5. Add trusted scorers/admins in Supabase Auth.

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

The seed script imports:

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
- `POST /.netlify/functions/save-score`
- `POST /.netlify/functions/submit-scorecard`
- `GET /.netlify/functions/leaderboard?eventId=...`
- `GET /.netlify/functions/export-results?eventId=...`

All endpoints require login. Leaderboard and export require the signed-in email to be listed in `LEAGUE_ADMIN_EMAILS`.

## V1 Limitations

- No GHIN integration.
- No Caddie integration.
- No public leaderboard.
- No edit history beyond `updated_at`.
- No scorer/team assignment rules yet; any signed-in scorer can save scores, and admin-only views are email-gated.
