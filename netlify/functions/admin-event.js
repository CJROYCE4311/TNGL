import { activeEvent, eventDetail, latestPlayerRows } from './_event-data.js';
import {
  calculateTeamHandicap,
  defaultHoles,
  formatForGameType,
  normalizeGameType,
  validateTeamSize
} from './_scoring.js';
import { handleOptions, json, parseJson, serviceClient } from './_supabase.js';

export async function handler(event) {
  const options = handleOptions(event);
  if (options) return options;

  try {
    const supabase = serviceClient();

    if (event.httpMethod === 'GET') {
      const leagueEvent = await activeEvent(supabase);
      const [players, detail] = await Promise.all([
        latestPlayerRows(supabase),
        eventDetail(supabase, leagueEvent?.id)
      ]);
      return json(200, { players, ...detail });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = parseJson(event);
    const gameType = normalizeGameType(body.gameType);
    const eventDate = normalizeDate(body.eventDate);
    const status = ['draft', 'open', 'closed'].includes(body.status) ? body.status : 'open';
    const teams = normalizeTeams(body.teams);

    for (const team of teams) validateTeamSize(gameType, team.playerIds.length);
    validateUniquePlayers(teams);

    if (status === 'open') {
      const { error: closeError } = await supabase
        .from('league_events')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('status', 'open');
      if (closeError) throw closeError;
    }

    const format = formatForGameType(gameType);
    const { data: leagueEvent, error: eventError } = await supabase
      .from('league_events')
      .upsert({
        external_league_id: 'sg_thursday_2026',
        league_name: 'Sterling Grove Thursday League',
        event_date: eventDate,
        format,
        nine: `game:${gameType}`,
        course_name: 'Sterling Grove Golf & Country Club',
        hole_count: 9,
        status,
        updated_at: new Date().toISOString()
      }, { onConflict: 'event_date,format' })
      .select('id')
      .single();

    if (eventError) throw eventError;

    const { error: deleteTeamsError } = await supabase
      .from('teams')
      .delete()
      .eq('event_id', leagueEvent.id);
    if (deleteTeamsError) throw deleteTeamsError;

    const { error: deleteHolesError } = await supabase
      .from('event_holes')
      .delete()
      .eq('event_id', leagueEvent.id);
    if (deleteHolesError) throw deleteHolesError;

    const { error: holeError } = await supabase
      .from('event_holes')
      .insert(defaultHoles().map((hole) => ({ ...hole, event_id: leagueEvent.id })));
    if (holeError) throw holeError;

    const players = await latestPlayerRows(supabase);
    const playerById = new Map(players.map((player) => [player.id, player]));

    for (const [teamIndex, team] of teams.entries()) {
      const teamPlayers = team.playerIds.map((playerId) => {
        const player = playerById.get(playerId);
        if (!player) throw new Error(`Unknown player ${playerId}`);
        return player;
      });
      const teamHandicap = calculateTeamHandicap(gameType, teamPlayers, 9);
      const { data: insertedTeam, error: teamError } = await supabase
        .from('teams')
        .insert({
          external_team_id: `${gameType}_${eventDate}_${teamIndex + 1}`,
          event_id: leagueEvent.id,
          team_name: team.teamName || `Team ${teamIndex + 1}`,
          is_active: true,
          team_handicap: teamHandicap,
          source_format: gameType,
          source_row: teamIndex + 1
        })
        .select('id')
        .single();

      if (teamError) throw teamError;

      const { error: playerError } = await supabase
        .from('team_players')
        .insert(teamPlayers.map((player, playerIndex) => ({
          team_id: insertedTeam.id,
          player_id: player.id,
          position: playerIndex + 1,
          course_handicap_100: player.course_handicap_100,
          playing_handicap: gameType === 'best_ball'
            ? Math.round(Number(player.best_ball_handicap_95 || 0) * 0.5)
            : null
        })));

      if (playerError) throw playerError;
    }

    const [freshPlayers, detail] = await Promise.all([
      latestPlayerRows(supabase),
      eventDetail(supabase, leagueEvent.id)
    ]);

    return json(200, { players: freshPlayers, ...detail });
  } catch (error) {
    const statusCode = error.message.includes('required') ||
      error.message.includes('must') ||
      error.message.includes('Unknown')
      ? 400
      : 500;
    return json(statusCode, { error: error.message });
  }
}

function normalizeDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new Error('eventDate is required');
  }
  return value;
}

function normalizeTeams(value) {
  if (!Array.isArray(value) || !value.length) throw new Error('teams are required');
  return value.map((team, index) => {
    const playerIds = Array.isArray(team.playerIds)
      ? [...new Set(team.playerIds.filter(Boolean))]
      : [];
    return {
      teamName: String(team.teamName || `Team ${index + 1}`).trim(),
      playerIds
    };
  });
}

function validateUniquePlayers(teams) {
  const seen = new Set();
  for (const team of teams) {
    for (const playerId of team.playerIds) {
      if (seen.has(playerId)) throw new Error('Players can only be assigned to one team');
      seen.add(playerId);
    }
  }
}
