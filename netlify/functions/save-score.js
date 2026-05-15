import { assertUuid, handleOptions, json, parseJson, requireUser, scorecardSelect, serviceClient } from './_supabase.js';

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
    if (!Array.isArray(body.scores)) throw new Error('scores must be an array');

    const scores = body.scores.map((score) => ({
      hole_number: Number(score.holeNumber),
      gross_score: Number(score.grossScore)
    }));

    for (const score of scores) {
      if (!Number.isInteger(score.hole_number) || score.hole_number < 1 || score.hole_number > 18) {
        throw new Error('Hole numbers must be between 1 and 18');
      }
      if (!Number.isInteger(score.gross_score) || score.gross_score < 1 || score.gross_score > 20) {
        throw new Error('Gross scores must be whole numbers from 1 to 20');
      }
    }

    const supabase = serviceClient();
    const { data: scorecard, error: cardError } = await supabase
      .from('scorecards')
      .upsert(
        {
          event_id: body.eventId,
          team_id: body.teamId,
          scorer_user_id: auth.user.id,
          scorer_email: auth.user.email,
          status: 'in_progress',
          updated_at: new Date().toISOString()
        },
        { onConflict: 'event_id,team_id' }
      )
      .select('id')
      .single();

    if (cardError) throw cardError;

    if (scores.length) {
      const rows = scores.map((score) => ({
        scorecard_id: scorecard.id,
        hole_number: score.hole_number,
        gross_score: score.gross_score,
        updated_at: new Date().toISOString()
      }));

      const { error: scoreError } = await supabase
        .from('hole_scores')
        .upsert(rows, { onConflict: 'scorecard_id,hole_number' });

      if (scoreError) throw scoreError;
    }

    await refreshScorecardTotal(supabase, scorecard.id);

    const { data: updated, error: updatedError } = await supabase
      .from('scorecards')
      .select(scorecardSelect())
      .eq('id', scorecard.id)
      .single();

    if (updatedError) throw updatedError;
    return json(200, { scorecard: updated });
  } catch (error) {
    const statusCode = error.message.includes('required') || error.message.includes('must') ? 400 : 500;
    return json(statusCode, { error: error.message });
  }
}

async function refreshScorecardTotal(supabase, scorecardId) {
  const { data: scores, error } = await supabase
    .from('hole_scores')
    .select('gross_score')
    .eq('scorecard_id', scorecardId);

  if (error) throw error;
  const grossTotal = (scores || []).reduce((total, score) => total + (Number(score.gross_score) || 0), 0);

  const { error: updateError } = await supabase
    .from('scorecards')
    .update({
      gross_total: grossTotal || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', scorecardId);

  if (updateError) throw updateError;
}
