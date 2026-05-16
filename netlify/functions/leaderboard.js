import { activeEvent, eventDetail } from './_event-data.js';
import { handleOptions, json, serviceClient } from './_supabase.js';

export async function handler(event) {
  const options = handleOptions(event);
  if (options) return options;

  try {
    const supabase = serviceClient();
    const eventId = event.queryStringParameters?.eventId || (await activeEvent(supabase, { requireTeams: true }))?.id;
    const detail = await eventDetail(supabase, eventId);
    const teamById = new Map(detail.teams.map((team) => [team.id, team]));

    const leaderboard = (detail.scorecards || [])
      .map((card) => {
        const team = teamById.get(card.team_id);
        return {
          team_id: card.team_id,
          team_name: team?.team_name || 'Team',
          players: team?.players?.map((player) => player.display_name) || [],
          status: card.status,
          playing_handicap: team?.team_handicap,
          gross_total: card.gross_total,
          net_total: card.net_total,
          holes_played: (card.hole_scores || []).filter((score) => Number(score.gross_score) > 0).length,
          submitted_at: card.submitted_at
        };
      })
      .sort((a, b) => {
        const aNet = Number.isFinite(Number(a.net_total)) ? Number(a.net_total) : 999;
        const bNet = Number.isFinite(Number(b.net_total)) ? Number(b.net_total) : 999;
        if (aNet !== bNet) return aNet - bNet;
        return (Number(a.gross_total) || 999) - (Number(b.gross_total) || 999);
      });

    return json(200, {
      event: detail.event,
      holes: detail.holes,
      hole_count: detail.holes.length,
      leaderboard
    });
  } catch (error) {
    return json(500, { error: error.message });
  }
}
