export const GAME_TYPES = ['couples_scramble', 'scramble', 'best_ball'];
export const SCRAMBLE_FORMATS = ['couples_scramble', 'scramble'];

export function formatForGameType(gameType) {
  return gameType === 'best_ball' ? 'best_ball' : 'scramble';
}

export function normalizeGameType(value) {
  return GAME_TYPES.includes(value) ? value : 'couples_scramble';
}

export function defaultHoles() {
  return Array.from({ length: 9 }, (_, index) => ({
    hole_number: index + 1,
    par: null,
    handicap: index + 1,
    yards: null
  }));
}

export function normalizeHoles(holes) {
  const provided = Array.isArray(holes) ? holes : [];
  const byHole = new Map(provided.map((hole) => [Number(hole.hole_number), hole]));
  return defaultHoles().map((fallback) => ({
    ...fallback,
    ...(byHole.get(fallback.hole_number) || {}),
    hole_number: fallback.hole_number,
    handicap: Number(byHole.get(fallback.hole_number)?.handicap || fallback.handicap)
  }));
}

export function dotsForHandicap(playingHandicap, holes) {
  const handicap = Math.max(0, Math.round(Number(playingHandicap) || 0));
  const normalized = normalizeHoles(holes);
  const sorted = [...normalized].sort((a, b) => Number(a.handicap || 99) - Number(b.handicap || 99));
  const dots = Object.fromEntries(normalized.map((hole) => [hole.hole_number, 0]));

  for (let index = 0; index < handicap; index += 1) {
    const hole = sorted[index % sorted.length];
    dots[hole.hole_number] += 1;
  }

  return dots;
}

export function calculateScrambleHandicap(players, holeCount = 9) {
  const courseHandicaps = (players || [])
    .map((player) => Number(player.course_handicap_100))
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

  return Math.round(eighteenHoleHandicap * (Number(holeCount || 9) / 18));
}

export function bestBallPlayerHandicap(player, holeCount = 9) {
  const stored = Number(player.playing_handicap);
  if (Number.isFinite(stored)) return stored;

  const bestBallHandicap = Number(player.best_ball_handicap_95);
  if (!Number.isFinite(bestBallHandicap)) return null;
  return Math.round(bestBallHandicap * (Number(holeCount || 9) / 18));
}

export function calculateTeamHandicap(gameType, players, holeCount = 9) {
  if (gameType === 'best_ball') return 0;
  return calculateScrambleHandicap(players, holeCount);
}

export function validateTeamSize(gameType, playerCount) {
  if (gameType === 'couples_scramble' && playerCount !== 2) {
    throw new Error('Couples scramble teams must have exactly 2 players');
  }
  if (gameType === 'scramble' && ![4, 5].includes(playerCount)) {
    throw new Error('Scramble teams must have 4 or 5 players');
  }
  if (gameType === 'best_ball' && (playerCount < 2 || playerCount > 4)) {
    throw new Error('Best ball teams need 2 to 4 players');
  }
}

export function calculateScorecardTotals({ gameType, holes, teamPlayers, teamScores, playerScores }) {
  const normalizedHoles = normalizeHoles(holes);
  const holeCount = normalizedHoles.length;

  if (gameType === 'best_ball') {
    const playerById = new Map((teamPlayers || []).map((player) => [player.player_id || player.id, player]));
    const dotsByPlayer = Object.fromEntries(
      [...playerById.entries()].map(([playerId, player]) => [
        playerId,
        dotsForHandicap(bestBallPlayerHandicap(player, holeCount), normalizedHoles)
      ])
    );

    let grossTotal = 0;
    let netTotal = 0;
    let played = 0;

    for (const hole of normalizedHoles) {
      const playerHoleScores = Object.entries(playerScores?.[hole.hole_number] || {})
        .map(([playerId, score]) => ({
          playerId,
          gross: Number(score),
          dots: dotsByPlayer[playerId]?.[hole.hole_number] || 0
        }))
        .filter((score) => Number.isFinite(score.gross) && score.gross > 0);

      if (!playerHoleScores.length) continue;
      const bestGross = Math.min(...playerHoleScores.map((score) => score.gross));
      const bestNet = Math.min(...playerHoleScores.map((score) => score.gross - score.dots));
      grossTotal += bestGross;
      netTotal += bestNet;
      played += 1;
    }

    return {
      playingHandicap: 0,
      grossTotal: played ? grossTotal : null,
      netTotal: played ? netTotal : null,
      played
    };
  }

  const playingHandicap = calculateTeamHandicap(gameType, teamPlayers, holeCount);
  const grossTotal = normalizedHoles.reduce((total, hole) => {
    const score = Number(teamScores?.[hole.hole_number]);
    return Number.isFinite(score) && score > 0 ? total + score : total;
  }, 0);
  const played = normalizedHoles.filter((hole) => Number(teamScores?.[hole.hole_number]) > 0).length;

  return {
    playingHandicap,
    grossTotal: played ? grossTotal : null,
    netTotal: played && playingHandicap !== null ? grossTotal - playingHandicap : null,
    played
  };
}
