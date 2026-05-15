import { assertUuid, handleOptions, requireAdmin, requireUser, serviceClient, text } from './_supabase.js';

export async function handler(event) {
  const options = handleOptions(event);
  if (options) return options;

  try {
    const auth = await requireUser(event);
    if (auth.error) return auth.error;
    const adminError = requireAdmin(auth);
    if (adminError) return adminError;

    const eventId = event.queryStringParameters?.eventId;
    assertUuid(eventId, 'eventId');

    const supabase = serviceClient();
    const { data, error } = await supabase
      .from('scorecards')
      .select(`
        status,
        gross_total,
        net_total,
        submitted_at,
        teams (
          external_team_id,
          team_name
        ),
        hole_scores (
          hole_number,
          gross_score
        )
      `)
      .eq('event_id', eventId)
      .order('gross_total', { ascending: true, nullsFirst: false });

    if (error) throw error;

    const columns = ['team_id', 'team_name', 'status', 'gross_total', 'net_total', 'submitted_at'];
    for (let hole = 1; hole <= 18; hole += 1) columns.push(`hole_${hole}`);

    const rows = [columns.join(',')];
    for (const card of data || []) {
      const byHole = new Map((card.hole_scores || []).map((score) => [score.hole_number, score.gross_score]));
      rows.push(
        [
          card.teams?.external_team_id,
          card.teams?.team_name,
          card.status,
          card.gross_total,
          card.net_total,
          card.submitted_at,
          ...Array.from({ length: 18 }, (_, index) => byHole.get(index + 1) || '')
        ].map(csvCell).join(',')
      );
    }

    return text(200, rows.join('\n'), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="thursday-league-results.csv"'
    });
  } catch (error) {
    const statusCode = error.message.includes('required') ? 400 : 500;
    return text(statusCode, error.message, { 'Content-Type': 'text/plain' });
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const textValue = String(value);
  if (!/[",\n]/.test(textValue)) return textValue;
  return `"${textValue.replace(/"/g, '""')}"`;
}
