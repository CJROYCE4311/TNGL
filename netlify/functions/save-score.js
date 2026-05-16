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

    const scoreByHole = new Map();
    for (const score of body.scores) {
      const holeNumber = Number(score.holeNumber);
      const grossScore = normalizeGrossScore(score.grossScore);
      scoreByHole.set(holeNumber, grossScore);
    }

    const scores = [...scoreByHole.entries()].map(([holeNumber, grossScore]) => ({
      hole_number: holeNumber,
      gross_score: grossScore
    }));

    for (const score of scores) {
      if (!Number.isInteger(score.hole_number) || score.hole_number < 1 || score.hole_number > 18) {
        throw new Error('Hole numbers must be between 1 and 18');
      }
      if (
        score.gross_score !== null &&
        (!Number.isInteger(score.gross_score) || score.gross_score < 1 || score.gross_score > 20)
      ) {
        throw new Error('Gross scores must be whole numbers from 1 to 20');
      }
    }

    const supabase = serviceClient();
    const { data: existingScorecard, error: existingError } = await supabase
      .from('scorecards')
      .select('id, status')
      .eq('event_id', body.eventId)
      .eq('team_id', body.teamId)
      .maybeSingle();

    if (existingError) throw existingError;

    const now = new Date().toISOString();
    const scorecardInput = {
      event_id: body.eventId,
      team_id: body.teamId,
      scorer_user_id: auth.user.id,
      scorer_email: auth.user.email,
      updated_at: now
    };

    const { data: scorecard, error: cardError } = existingScorecard
      ? await supabase
        .from('scorecards')
        .update(scorecardInput)
        .eq('id', existingScorecard.id)
        .select('id')
        .single()
      : await supabase
      .from('scorecards')
      .insert(
        {
          ...scorecardInput,
          status: 'in_progress',
          created_at: now
        }
      )
      .select('id')
      .single();

    if (cardError) throw cardError;

    if (scores.length) {
      const affectedHoles = scores.map((score) => score.hole_number);
      const { error: deleteError } = await supabase
        .from('hole_scores')
        .delete()
        .eq('scorecard_id', scorecard.id)
        .in('hole_number', affectedHoles);

      if (deleteError) throw deleteError;

      const rows = scores.filter((score) => score.gross_score !== null).map((score) => ({
        scorecard_id: scorecard.id,
        hole_number: score.hole_number,
        gross_score: score.gross_score,
        updated_at: now
      }));

      if (rows.length) {
        const { error: scoreError } = await supabase
          .from('hole_scores')
          .insert(rows);

        if (scoreError) throw scoreError;
      }
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
    const statusCode = error.message.includes('required') || error.message.includes('must') || error.message.includes('between') ? 400 : 500;
    return json(statusCode, { error: error.message });
  }
}

function normalizeGrossScore(value) {
  if (value === null || value === '' || typeof value === 'undefined') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : NaN;
}

async function refreshScorecardTotal(supabase, scorecardId) {
  const { data: scorecard, error: scorecardError } = await supabase
    .from('scorecards')
    .select(`
      id,
      team_id,
      league_events (
        format,
        hole_count
      ),
      teams (
        team_handicap
      )
    `)
    .eq('id', scorecardId)
    .single();

  if (scorecardError) throw scorecardError;

  const { data: scores, error } = await supabase
    .from('hole_scores')
    .select('gross_score')
    .eq('scorecard_id', scorecardId);

  if (error) throw error;
  const grossTotal = (scores || []).reduce((total, score) => total + (Number(score.gross_score) || 0), 0);
  const teamHandicap = await resolveTeamHandicap(supabase, scorecard);
  const netTotal = grossTotal && teamHandicap !== null ? grossTotal - teamHandicap : null;

  const { error: updateError } = await supabase
    .from('scorecards')
    .update({
      gross_total: grossTotal || null,
      net_total: netTotal,
      updated_at: new Date().toISOString()
    })
    .eq('id', scorecardId);

  if (updateError) throw updateError;
}

async function resolveTeamHandicap(supabase, scorecard) {
  const storedHandicap = Number(scorecard.teams?.team_handicap);
  if (Number.isFinite(storedHandicap)) return storedHandicap;

  if (scorecard.league_events?.format !== 'scramble') return null;

  const { data, error } = await supabase
    .from('team_players')
    .select('course_handicap_100')
    .eq('team_id', scorecard.team_id)
    .not('course_handicap_100', 'is', null);

  if (error) throw error;

  const courseHandicaps = (data || [])
    .map((row) => Number(row.course_handicap_100))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!courseHandicaps.length) return null;

  const allocations = courseHandicaps.length === 2
    ? [0.35, 0.15]
    : [0.25, 0.2, 0.15, 0.1, 0.1];
  const eighteenHoleHandicap = courseHandicaps.reduce(
    (total, handicap, index) => total + handicap * (allocations[index] || 0),
    0
  );
  const holeFactor = Number(scorecard.league_events?.hole_count || 9) / 18;
  return Math.round(eighteenHoleHandicap * holeFactor);
}
