import { defaultHoles, normalizeGameType, normalizeHoles } from './_scoring.js';

export async function latestPlayerRows(supabase) {
  const [{ data: players, error: playerError }, { data: handicaps, error: handicapError }] = await Promise.all([
    supabase
      .from('players')
      .select('id, external_player_id, display_name, gender, active')
      .eq('active', true)
      .order('display_name'),
    supabase
      .from('player_handicaps')
      .select('player_id, handicap_index, course_handicap_100, best_ball_handicap_95, effective_date, league_tee')
      .order('effective_date', { ascending: false, nullsFirst: false })
  ]);

  if (playerError) throw playerError;
  if (handicapError) throw handicapError;

  const latestByPlayer = new Map();
  for (const row of handicaps || []) {
    if (!latestByPlayer.has(row.player_id)) latestByPlayer.set(row.player_id, row);
  }

  return (players || []).map((player) => ({
    ...player,
    ...(latestByPlayer.get(player.id) || {}),
    player_id: player.id
  }));
}

export async function activeEvent(supabase, { requireTeams = false } = {}) {
  const { data, error } = await supabase
    .from('league_events')
    .select('id, external_league_id, league_name, event_date, format, status, course_name, nine, hole_count')
    .eq('status', 'open')
    .order('event_date', { ascending: false })
    .limit(10);

  if (error) throw error;
  if (!requireTeams) return data?.[0] || null;

  for (const leagueEvent of data || []) {
    const { count, error: teamError } = await supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', leagueEvent.id)
      .eq('is_active', true);
    if (teamError) throw teamError;
    if (count > 0) return leagueEvent;
  }

  return null;
}

export async function eventDetail(supabase, eventId) {
  if (!eventId) {
    return {
      event: null,
      holes: defaultHoles(),
      teams: [],
      scorecards: []
    };
  }

  const [{ data: event, error: eventError }, { data: holes, error: holesError }, { data: teams, error: teamsError }, { data: scorecards, error: scorecardsError }] = await Promise.all([
    supabase
      .from('league_events')
      .select('id, external_league_id, league_name, event_date, format, status, course_name, nine, hole_count')
      .eq('id', eventId)
      .single(),
    supabase
      .from('event_holes')
      .select('hole_number, par, handicap, yards')
      .eq('event_id', eventId)
      .order('hole_number'),
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
        team_handicap,
        team_players (
          position,
          assigned_role,
          course_handicap_100,
          playing_handicap,
          players (
            id,
            external_player_id,
            display_name,
            gender
          )
        )
      `)
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('team_name'),
    supabase
      .from('scorecards')
      .select(`
        id,
        event_id,
        team_id,
        status,
        gross_total,
        net_total,
        submitted_at,
        hole_scores (
          hole_number,
          gross_score,
          net_score,
          notes
        )
      `)
      .eq('event_id', eventId)
  ]);

  if (eventError) throw eventError;
  if (holesError) throw holesError;
  if (teamsError) throw teamsError;
  if (scorecardsError) throw scorecardsError;

  const normalizedHoles = normalizeHoles(holes);
  const gameType = gameTypeForEvent(event);

  return {
    event: {
      ...event,
      game_type: gameType
    },
    holes: normalizedHoles,
    teams: (teams || []).map((team) => ({
      ...team,
      players: (team.team_players || [])
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map((row) => row.players ? {
          ...row.players,
          player_id: row.players.id,
          position: row.position,
          assigned_role: row.assigned_role,
          course_handicap_100: row.course_handicap_100,
          playing_handicap: row.playing_handicap
        } : null)
        .filter(Boolean)
    })),
    scorecards: scorecards || []
  };
}

function gameTypeForEvent(event) {
  if (event?.game_type) return normalizeGameType(event.game_type);
  if (event?.nine?.startsWith('game:')) return normalizeGameType(event.nine.replace('game:', ''));
  if (event?.format === 'best_ball') return 'best_ball';
  return 'couples_scramble';
}
