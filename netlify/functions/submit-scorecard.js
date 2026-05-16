import { eventDetail } from './_event-data.js';
import { normalizeHoles } from './_scoring.js';
import { assertUuid, handleOptions, json, parseJson, serviceClient } from './_supabase.js';

export async function handler(event) {
  const options = handleOptions(event);
  if (options) return options;

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = parseJson(event);
    assertUuid(body.eventId, 'eventId');
    assertUuid(body.teamId, 'teamId');

    const supabase = serviceClient();
    const detail = await eventDetail(supabase, body.eventId);
    const requiredHoles = normalizeHoles(detail.holes).length;

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
