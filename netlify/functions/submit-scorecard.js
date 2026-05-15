import { assertUuid, handleOptions, json, parseJson, requireUser, serviceClient } from './_supabase.js';

export async function handler(event) {
  const options = handleOptions(event);
  if (options) return options;

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const auth = await requireUser(event);
    if (auth.error) return auth.error;

    const body = parseJson(event);
    assertUuid(body.eventId, 'eventId');
    assertUuid(body.teamId, 'teamId');

    const supabase = serviceClient();
    const { data: leagueEvent, error: eventError } = await supabase
      .from('league_events')
      .select('hole_count')
      .eq('id', body.eventId)
      .single();

    if (eventError) throw eventError;

    const { data: scorecard, error: cardError } = await supabase
      .from('scorecards')
      .select('id')
      .eq('event_id', body.eventId)
      .eq('team_id', body.teamId)
      .single();

    if (cardError) throw cardError;

    const { count, error: countError } = await supabase
      .from('hole_scores')
      .select('id', { count: 'exact', head: true })
      .eq('scorecard_id', scorecard.id)
      .not('gross_score', 'is', null);

    if (countError) throw countError;

    const requiredHoles = leagueEvent.hole_count || 9;
    if ((count || 0) < requiredHoles) {
      return json(400, { error: `Scorecard needs ${requiredHoles} holes before submit` });
    }

    const { error: updateError } = await supabase
      .from('scorecards')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', scorecard.id);

    if (updateError) throw updateError;
    return json(200, { ok: true });
  } catch (error) {
    const statusCode = error.message.includes('required') ? 400 : 500;
    return json(statusCode, { error: error.message });
  }
}
