import { assertUuid, handleOptions, json, requireAdmin, requireUser, serviceClient } from './_supabase.js';

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
        team_id,
        status,
        gross_total,
        net_total,
        submitted_at,
        teams (
          team_name
        )
      `)
      .eq('event_id', eventId)
      .order('net_total', { ascending: true, nullsFirst: false })
      .order('gross_total', { ascending: true, nullsFirst: false });

    if (error) throw error;

    return json(200, {
      leaderboard: (data || []).map((row) => ({
        team_id: row.team_id,
        team_name: row.teams?.team_name || 'Team',
        status: row.status,
        gross_total: row.gross_total,
        net_total: row.net_total,
        submitted_at: row.submitted_at
      }))
    });
  } catch (error) {
    const statusCode = error.message.includes('required') ? 400 : 500;
    return json(statusCode, { error: error.message });
  }
}
