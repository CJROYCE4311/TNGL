# Netlify Functions Outline

## Recommended Endpoints

### `GET /.netlify/functions/events`

Returns active or upcoming league events.

Response:

```json
{
  "events": [
    {
      "id": "uuid",
      "event_date": "2026-05-21",
      "format": "scramble",
      "status": "open"
    }
  ]
}
```

### `GET /.netlify/functions/event-detail?eventId=...`

Returns event, teams, team players, holes, and existing scorecards.

### `POST /.netlify/functions/save-score`

Saves one hole score or a batch of hole scores.

Input:

```json
{
  "eventId": "uuid",
  "teamId": "uuid",
  "scores": [
    { "holeNumber": 1, "grossScore": 4 },
    { "holeNumber": 2, "grossScore": 5 }
  ]
}
```

Rules:

- Validate the user is allowed to score this team or is an admin.
- Validate hole numbers are in the event's active nine or eighteen.
- Recalculate totals after save.
- Return the updated scorecard.

### `POST /.netlify/functions/submit-scorecard`

Marks a scorecard as submitted.

Rules:

- Require all active holes to have scores.
- Preserve edit history later if needed.
- Allow admin unlock for corrections.

### `GET /.netlify/functions/leaderboard?eventId=...`

Returns sorted team results.

### `GET /.netlify/functions/export-results?eventId=...`

Returns CSV for final event scoring.

## Environment Variables

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
LEAGUE_ADMIN_EMAILS
```

## Security Notes

- Do not put the Supabase service role key in frontend code.
- Use Netlify Functions for privileged writes.
- Use Supabase Auth for scorer/admin identity.
- Start with a login-only pilot; loosen read access later only if wanted.
- Store only league scoring data here, not Caddie personal data or GHIN credentials.

## V1 UI Screens

- Sign in.
- Select event.
- Select team.
- Score entry by hole.
- Review and submit.
- Leaderboard.
- Admin export.

