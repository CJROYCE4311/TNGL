import { eventDetail } from './_event-data.js';
import {
  bestBallPlayerHandicap,
  calculateScorecardTotals,
  calculateTeamHandicap,
  dotsForHandicap,
  normalizeGameType,
  normalizeHoles
} from './_scoring.js';
import { assertUuid, handleOptions, json, parseJson, scorecardSelect, serviceClient } from './_supabase.js';

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
    const gameType = normalizeGameType(detail.event?.game_type);
    const holes = normalizeHoles(detail.holes);
    const team = detail.teams.find((row) => row.id === body.teamId);
    if (!team) throw new Error('Selected team is not active for this event');

    const teamPlayers = team.players || [];
    const teamScores = normalizeTeamScores(body.scores || body.teamScores || []);
    const playerScores = normalizePlayerScores(body.playerScores || {});
    const saveScope = {
      autoSave: Boolean(body.autoSave),
      changedHoleNumber: Number(body.changedHoleNumber),
      changedPlayerId: body.changedPlayerId || null
    };

    const now = new Date().toISOString();
    const scorecard = await upsertScorecard(supabase, {
      eventId: body.eventId,
      teamId: body.teamId,
      now
    });

    if (gameType === 'best_ball') {
      await saveBestBallScores(supabase, {
        scorecardId: scorecard.id,
        teamPlayers,
        holes,
        playerScores,
        saveScope,
        now
      });
    } else {
      await saveTeamScores(supabase, {
        scorecardId: scorecard.id,
        holes,
        teamScores,
        saveScope,
        now
      });
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
    const statusCode = error.message.includes('required') ||
      error.message.includes('must') ||
      error.message.includes('between') ||
      error.message.includes('not active')
      ? 400
      : 500;
    return json(statusCode, { error: error.message });
  }
}

async function upsertScorecard(supabase, { eventId, teamId, now }) {
  const { data: existingScorecard, error: existingError } = await supabase
    .from('scorecards')
    .select('id')
    .eq('event_id', eventId)
    .eq('team_id', teamId)
    .maybeSingle();

  if (existingError) throw existingError;

  const input = {
    event_id: eventId,
    team_id: teamId,
    status: 'in_progress',
    updated_at: now
  };

  const query = existingScorecard
    ? supabase
      .from('scorecards')
      .update(input)
      .eq('id', existingScorecard.id)
    : supabase
      .from('scorecards')
      .insert({ ...input, created_at: now });

  const { data, error } = await query.select('id').single();
  if (error) throw error;
  return data;
}

async function saveTeamScores(supabase, { scorecardId, holes, teamScores, saveScope, now }) {
  const { data: existingScores, error: existingError } = await supabase
    .from('hole_scores')
    .select('hole_number, gross_score')
    .eq('scorecard_id', scorecardId);
  if (existingError) throw existingError;

  const holeNumbers = new Set(holes.map((hole) => Number(hole.hole_number)));
  const mergedScores = new Map(
    (existingScores || [])
      .filter((score) => holeNumbers.has(Number(score.hole_number)))
      .map((score) => [Number(score.hole_number), score.gross_score])
  );

  for (const hole of holes) {
    if (isScopedToAnotherHole(saveScope, hole.hole_number)) continue;
    if (!hasOwn(teamScores, hole.hole_number)) continue;
    const grossScore = normalizeGrossScore(teamScores[hole.hole_number]);
    if (grossScore !== null) {
      mergedScores.set(hole.hole_number, grossScore);
    }
  }

  const { error: deleteError } = await supabase
    .from('hole_scores')
    .delete()
    .eq('scorecard_id', scorecardId);
  if (deleteError) throw deleteError;

  const rows = holes
    .map((hole) => ({
      scorecard_id: scorecardId,
      hole_number: hole.hole_number,
      gross_score: mergedScores.get(hole.hole_number) ?? null,
      updated_at: now
    }))
    .filter((row) => row.gross_score !== null);

  if (rows.length) {
    const { error } = await supabase.from('hole_scores').insert(rows);
    if (error) throw error;
  }
}

async function saveBestBallScores(supabase, { scorecardId, teamPlayers, holes, playerScores, saveScope, now }) {
  const { data: existingScores, error: existingError } = await supabase
    .from('hole_scores')
    .select('hole_number, notes')
    .eq('scorecard_id', scorecardId);
  if (existingError) throw existingError;

  const playerIds = new Set(teamPlayers.map((player) => player.id));
  const mergedPlayerScores = {};
  for (const score of existingScores || []) {
    const parsed = parseNotes(score.notes);
    for (const playerScore of parsed.playerScores || []) {
      if (!playerIds.has(playerScore.player_id)) continue;
      mergedPlayerScores[score.hole_number] = {
        ...(mergedPlayerScores[score.hole_number] || {}),
        [playerScore.player_id]: playerScore.gross_score
      };
    }
  }

  for (const hole of holes) {
    if (isScopedToAnotherHole(saveScope, hole.hole_number)) continue;
    if (!hasOwn(playerScores, hole.hole_number)) continue;
    for (const player of teamPlayers) {
      if (saveScope?.autoSave && saveScope.changedPlayerId && saveScope.changedPlayerId !== player.id) continue;
      const holePlayerScores = playerScores[hole.hole_number] || {};
      if (!hasOwn(holePlayerScores, player.id)) continue;
      const grossScore = normalizeGrossScore(holePlayerScores[player.id]);
      mergedPlayerScores[hole.hole_number] = mergedPlayerScores[hole.hole_number] || {};
      if (grossScore !== null) {
        mergedPlayerScores[hole.hole_number][player.id] = grossScore;
      }
    }
  }

  const { error: deleteError } = await supabase
    .from('hole_scores')
    .delete()
    .eq('scorecard_id', scorecardId);
  if (deleteError) throw deleteError;

  const dotsByPlayer = Object.fromEntries(teamPlayers.map((player) => [
    player.id,
    dotsForHandicap(bestBallPlayerHandicap(player, holes.length), holes)
  ]));

  const teamRows = [];

  for (const hole of holes) {
    const holePlayerRows = [];
    for (const player of teamPlayers) {
      const grossScore = normalizeGrossScore(mergedPlayerScores[hole.hole_number]?.[player.id]);
      if (grossScore === null) continue;
      const dots = dotsByPlayer[player.id]?.[hole.hole_number] || 0;
      const row = {
        player_id: player.id,
        gross_score: grossScore,
        net_score: grossScore - dots,
        dots
      };
      holePlayerRows.push(row);
    }

    if (holePlayerRows.length) {
      teamRows.push({
        scorecard_id: scorecardId,
        hole_number: hole.hole_number,
        gross_score: Math.min(...holePlayerRows.map((row) => row.gross_score)),
        net_score: Math.min(...holePlayerRows.map((row) => row.net_score)),
        notes: JSON.stringify({ playerScores: holePlayerRows }),
        updated_at: now
      });
    }
  }

  if (teamRows.length) {
    const { error } = await supabase.from('hole_scores').insert(teamRows);
    if (error) throw error;
  }
}

async function refreshScorecardTotal(supabase, scorecardId) {
  const { data: scorecard, error: scorecardError } = await supabase
    .from('scorecards')
    .select(`
      id,
      event_id,
      team_id,
      event_id
    `)
    .eq('id', scorecardId)
    .single();

  if (scorecardError) throw scorecardError;

  const detail = await eventDetail(supabase, scorecard.event_id);
  const team = detail.teams.find((row) => row.id === scorecard.team_id);
  const gameType = normalizeGameType(detail.event?.game_type);
  const holes = normalizeHoles(detail.holes);

  const { data: holeScores, error: holeError } = await supabase
    .from('hole_scores')
    .select('hole_number, gross_score, notes')
    .eq('scorecard_id', scorecardId);

  if (holeError) throw holeError;

  const teamScores = Object.fromEntries((holeScores || []).map((score) => [score.hole_number, score.gross_score]));
  const playerScores = {};
  for (const score of holeScores || []) {
    const parsed = parseNotes(score.notes);
    for (const playerScore of parsed.playerScores || []) {
      playerScores[score.hole_number] = {
        ...(playerScores[score.hole_number] || {}),
        [playerScore.player_id]: playerScore.gross_score
      };
    }
  }

  const totals = calculateScorecardTotals({
    gameType,
    holes,
    teamPlayers: team?.players || [],
    teamScores,
    playerScores
  });

  const totalUpdate = {
    playing_handicap: totals.playingHandicap,
    gross_total: totals.grossTotal,
    net_total: totals.netTotal,
    updated_at: new Date().toISOString()
  };
  const { error: updateError } = await supabase
    .from('scorecards')
    .update(totalUpdate)
    .eq('id', scorecardId);

  if (!updateError) return;

  if (!isMissingColumnError(updateError, 'playing_handicap')) {
    throw updateError;
  }

  const legacyTotalUpdate = { ...totalUpdate };
  delete legacyTotalUpdate.playing_handicap;
  const { error: legacyUpdateError } = await supabase
    .from('scorecards')
    .update(legacyTotalUpdate)
    .eq('id', scorecardId);

  if (legacyUpdateError) throw legacyUpdateError;
}

function normalizeTeamScores(scores) {
  if (Array.isArray(scores)) {
    return Object.fromEntries(scores.map((score) => [Number(score.holeNumber), score.grossScore]));
  }
  return scores || {};
}

function normalizePlayerScores(scores) {
  return scores && typeof scores === 'object' ? scores : {};
}

function normalizeGrossScore(value) {
  if (value === null || value === '' || typeof value === 'undefined') return null;
  const score = Number(value);
  if (!Number.isInteger(score) || score < 1 || score > 20) {
    throw new Error('Gross scores must be whole numbers from 1 to 20');
  }
  return score;
}

function parseNotes(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function isScopedToAnotherHole(saveScope, holeNumber) {
  return saveScope?.autoSave &&
    Number.isFinite(saveScope.changedHoleNumber) &&
    Number(saveScope.changedHoleNumber) !== Number(holeNumber);
}

function isMissingColumnError(error, columnName) {
  return String(error?.message || '').includes(`'${columnName}' column`);
}
