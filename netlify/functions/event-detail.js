import { assertUuid, handleOptions, json, requireUser, scorecardSelect, serviceClient } from './_supabase.js';

export async function handler(event) {
  const options = handleOptions(event);
  if (options) return options;

  try {
    const auth = await requireUser(event);
    if (auth.error) return auth.error;

    const eventId = event.queryStringParameters?.eventId;
    assertUuid(eventId, 'eventId');

    const supabase = serviceClient();
    const [{ data: leagueEvent, error: eventError }, { data: teams, error: teamError }, { data: holes, error: holeError }, { data: scorecards, error: scoreError }] =
      await Promise.all([
        supabase
          .from('league_events')
          .select('id, external_league_id, league_name, event_date, format, status, course_name, nine, hole_count')
          .eq('id', eventId)
          .single(),
        supabase
          .from('teams')
          .select(`
            id,
            external_team_id,
            event_id,
            team_name,
            starting_hole,
            tee_time,
            flight,
            team_players (
              position,
              players (
                id,
                external_player_id,
                display_name
              )
            )
          `)
          .eq('event_id', eventId)
          .eq('is_active', true)
          .order('team_name'),
        supabase
          .from('event_holes')
          .select('hole_number, par, handicap, yards')
          .eq('event_id', eventId)
          .order('hole_number'),
        supabase
          .from('scorecards')
          .select(scorecardSelect())
          .eq('event_id', eventId)
      ]);

    if (eventError) throw eventError;
    if (teamError) throw teamError;
    if (holeError) throw holeError;
    if (scoreError) throw scoreError;

    return json(200, {
      event: leagueEvent,
      teams: (teams || []).map((team) => ({
        ...team,
        players: (team.team_players || [])
          .sort((a, b) => (a.position || 0) - (b.position || 0))
          .map((row) => row.players)
          .filter(Boolean)
      })),
      holes: holes || [],
      scorecards: scorecards || []
    });
  } catch (error) {
    const statusCode = error.message.includes('required') ? 400 : 500;
    return json(statusCode, { error: error.message });
  }
}
