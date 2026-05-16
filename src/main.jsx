import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { apiGet, apiPost } from './api';
import leagueLogoUrl from '../branding/sg-couples-league-horizontal.svg';
import './styles.css';

const gameLabels = {
  couples_scramble: 'Couples Scramble',
  scramble: '4/5 Player Scramble',
  best_ball: 'Best Ball'
};

const gameOptions = Object.keys(gameLabels);
const defaultHoles = Array.from({ length: 9 }, (_, index) => ({
  hole_number: index + 1,
  handicap: index + 1
}));

function App() {
  const route = window.location.pathname;
  if (route === '/admin-night') return <AdminNight />;
  if (route === '/leaderboard') return <LeaderboardPage />;
  return <ScorePage />;
}

function AdminNight() {
  const [players, setPlayers] = useState([]);
  const [eventDate, setEventDate] = useState(todayIso());
  const [gameType, setGameType] = useState('couples_scramble');
  const [status, setStatus] = useState('open');
  const [teams, setTeams] = useState([]);
  const [draftTeam, setDraftTeam] = useState(() => emptyDraftTeam('couples_scramble', 1));
  const [draftCoupleKeys, setDraftCoupleKeys] = useState([]);
  const [activeEventId, setActiveEventId] = useState('');
  const [scorecardCount, setScorecardCount] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [removeBusyId, setRemoveBusyId] = useState('');

  useEffect(() => {
    loadAdmin();
  }, []);

  async function loadAdmin() {
    setError('');
    try {
      const data = await apiGet('/.netlify/functions/admin-event');
      setPlayers(data.players || []);
      setActiveEventId(data.event?.id || '');
      setScorecardCount(data.scorecards?.length || 0);
      const hasPublishedSetup = Boolean(data.teams?.length || data.scorecards?.length);
      const nextGameType = hasPublishedSetup
        ? data.event?.game_type || 'couples_scramble'
        : 'couples_scramble';
      if (data.event) {
        setEventDate(data.event.event_date || todayIso());
        setGameType(nextGameType);
        setStatus(data.event.status || 'open');
      }
      if (data.teams?.length) {
        setTeams(data.teams.map((team, index) => ({
          teamId: team.id,
          teamName: team.team_name || `Team ${index + 1}`,
          playerIds: team.players.map((player) => player.id)
        })));
        setDraftTeam(emptyDraftTeam(nextGameType, data.teams.length + 1));
        setDraftCoupleKeys([]);
      } else {
        setTeams([]);
        setDraftTeam(emptyDraftTeam(nextGameType, 1));
        setDraftCoupleKeys([]);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetScores() {
    if (!activeEventId) {
      setError('Open an event before resetting scores.');
      return;
    }

    const confirmed = window.confirm('Reset all saved scorecards and clear the leaderboard for this game?');
    if (!confirmed) return;

    setResetBusy(true);
    setError('');
    setMessage('');
    try {
      await apiPost('/.netlify/functions/admin-event', {
        action: 'resetScores',
        eventId: activeEventId
      });
      setMessage('Game scores reset. Scorecards and leaderboard are clear.');
      await loadAdmin();
    } catch (err) {
      setError(err.message);
    } finally {
      setResetBusy(false);
    }
  }

  function addDraftTeam() {
    if (gameType === 'couples_scramble') {
      if (!selectedCouples.length) {
        setError('Select one or more couples');
        return;
      }

      setError('');
      setTeams((current) => {
        const next = [
          ...current,
          ...selectedCouples.map((couple) => ({
            teamId: '',
            teamName: couple.lastName,
            playerIds: couple.players.map((player) => player.id)
          }))
        ];
        setDraftTeam(emptyDraftTeam(gameType, next.length + 1));
        setDraftCoupleKeys([]);
        return next;
      });
      return;
    }

    const sizeError = teamSizeError(gameType, draftTeam.playerIds.length);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    setError('');
    setTeams((current) => {
      const next = [
        ...current,
        {
          teamId: '',
          teamName: draftTeam.teamName || `Team ${current.length + 1}`,
          playerIds: draftTeam.playerIds
        }
      ];
      setDraftTeam(emptyDraftTeam(gameType, next.length + 1));
      return next;
    });
  }

  async function removeTeam(index) {
    const team = teams[index];
    if (team?.teamId && activeEventId) {
      const confirmed = window.confirm(`Remove ${team.teamName} from this game? Any saved scores for that team will be cleared.`);
      if (!confirmed) return;

      setRemoveBusyId(team.teamId);
      setError('');
      setMessage('');
      try {
        await apiPost('/.netlify/functions/admin-event', {
          action: 'removeTeam',
          eventId: activeEventId,
          teamId: team.teamId
        });
        setMessage(`${team.teamName} removed. Those players are available for a new team.`);
        await loadAdmin();
      } catch (err) {
        setError(err.message);
      } finally {
        setRemoveBusyId('');
      }
      return;
    }

    setTeams((current) => {
      const next = current.filter((_, teamIndex) => teamIndex !== index);
      if (!draftTeam.playerIds.length) setDraftTeam((draft) => ({
        ...draft,
        teamName: emptyDraftTeam(gameType, next.length + 1).teamName
      }));
      return next;
    });
  }

  function updateTeamName(index, teamName) {
    setTeams((current) => current.map((team, teamIndex) => (
      teamIndex === index ? { ...team, teamName } : team
    )));
  }

  function togglePlayer(index, playerId) {
    setTeams((current) => current.map((team, teamIndex) => {
      if (teamIndex !== index) return team;
      const hasPlayer = team.playerIds.includes(playerId);
      return {
        ...team,
        playerIds: hasPlayer
          ? team.playerIds.filter((id) => id !== playerId)
          : [...team.playerIds, playerId]
      };
    }));
  }

  function toggleDraftPlayer(playerId) {
    setDraftTeam((current) => {
      const hasPlayer = current.playerIds.includes(playerId);
      return {
        ...current,
        playerIds: hasPlayer
          ? current.playerIds.filter((id) => id !== playerId)
          : [...current.playerIds, playerId]
      };
    });
  }

  function toggleDraftCouple(coupleKey) {
    setError('');
    setDraftCoupleKeys((current) => (
      current.includes(coupleKey)
        ? current.filter((key) => key !== coupleKey)
        : [...current, coupleKey]
    ));
  }

  function clearDraftTeam() {
    setDraftTeam(emptyDraftTeam(gameType, teams.length + 1));
    setDraftCoupleKeys([]);
    setError('');
  }

  function changeGameType(nextGameType) {
    setGameType(nextGameType);
    setDraftTeam(emptyDraftTeam(nextGameType, teams.length + 1));
    setDraftCoupleKeys([]);
    setError('');
  }

  async function saveEvent() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!teams.length) throw new Error('Add at least one team before publishing');
      for (const team of teams) {
        const sizeError = teamSizeError(gameType, team.playerIds.length);
        if (sizeError) throw new Error(`${team.teamName}: ${sizeError}`);
      }
      await apiPost('/.netlify/functions/admin-event', {
        eventDate,
        gameType,
        status,
        teams
      });
      setMessage('Event saved and scoring is ready.');
      await loadAdmin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const assignedPlayerIds = useMemo(
    () => new Set(teams.flatMap((team) => team.playerIds)),
    [teams]
  );
  const coupleOptions = useMemo(() => buildCoupleOptions(players), [players]);
  const selectedCouples = coupleOptions.filter((couple) => (
    draftCoupleKeys.includes(couple.key) &&
    !couple.players.some((player) => assignedPlayerIds.has(player.id))
  ));
  const selectedCoupleCount = selectedCouples.length;
  const draftPlayers = gameType === 'couples_scramble'
    ? selectedCouples.flatMap((couple) => couple.players)
    : draftTeam.playerIds.map((playerId) => playerById.get(playerId)).filter(Boolean);
  const draftHandicap = calculateTeamHandicap(gameType, draftPlayers);
  const draftSizeError = gameType === 'couples_scramble'
    ? ''
    : teamSizeError(gameType, draftTeam.playerIds.length);
  const draftTeamNameValue = gameType === 'couples_scramble'
    ? selectedCoupleCount
      ? `${selectedCoupleCount} couple${selectedCoupleCount === 1 ? '' : 's'} selected`
      : ''
    : draftTeam.teamName;
  const draftPanelWarning = gameType === 'couples_scramble'
    ? selectedCoupleCount === 0
    : Boolean(draftSizeError);
  const draftPanelValue = gameType === 'couples_scramble'
    ? selectedCoupleCount
    : formatScore(draftHandicap);
  const draftPanelStatus = gameType === 'couples_scramble'
    ? selectedCoupleCount
      ? `${selectedCoupleCount} ready to add`
      : 'Select one or more couples'
    : draftSizeError || 'Ready to add';

  return (
    <main className="app-shell">
      <Header title="Admin Night" />
      <Nav active="admin" />
      {error && <p className="error banner">{error}</p>}
      {message && <p className="notice banner">{message}</p>}

      <section className="admin-grid">
        <div className="panel setup-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Setup</p>
              <h2>Tonight's Game</h2>
            </div>
            <div className="setup-actions">
              <button type="button" onClick={saveEvent} disabled={busy || resetBusy || Boolean(removeBusyId)}>
                {busy ? 'Saving...' : 'Publish Teams'}
              </button>
              <button
                type="button"
                className="danger"
                onClick={resetScores}
                disabled={resetBusy || busy || Boolean(removeBusyId) || !activeEventId || scorecardCount === 0}
              >
                {resetBusy ? 'Resetting...' : 'Reset Game'}
              </button>
            </div>
          </div>
          <p className="reset-note">{scorecardCount} saved scorecard{scorecardCount === 1 ? '' : 's'}</p>
          <div className="form-grid">
            <label>
              Date
              <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
            </label>
            <label>
              Game
              <select value={gameType} onChange={(event) => changeGameType(event.target.value)}>
                {gameOptions.map((option) => <option key={option} value={option}>{gameLabels[option]}</option>)}
              </select>
            </label>
            <label>
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="open">Open</option>
                <option value="draft">Draft</option>
                <option value="closed">Closed</option>
              </select>
            </label>
          </div>
        </div>

        <div className="panel draft-team-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Add Team</p>
              <h2>{gameType === 'couples_scramble' ? 'Pick Couples' : 'Pick Players'}</h2>
            </div>
            <strong>{teams.length} added</strong>
          </div>
          <div className="draft-team-head">
            <label>
              Team Name
              <input
                value={draftTeamNameValue}
                readOnly={gameType === 'couples_scramble'}
                onChange={(event) => setDraftTeam((current) => ({ ...current, teamName: event.target.value }))}
                placeholder={gameType === 'couples_scramble' ? 'Select couples' : undefined}
              />
            </label>
            <div className={draftPanelWarning ? 'team-rule warning' : 'team-rule'}>
              <strong>{draftPanelValue}</strong>
              <span>{draftPanelStatus}</span>
            </div>
          </div>
          {gameType === 'couples_scramble' ? (
            <div className="player-pick-grid compact">
              {coupleOptions.map((couple) => {
                const alreadyAssigned = couple.players.some((player) => assignedPlayerIds.has(player.id));
                const selected = draftCoupleKeys.includes(couple.key);
                return (
                  <label key={couple.key} className={selected ? 'pick selected' : 'pick'}>
                    <input
                      type="checkbox"
                      name="draft-couple"
                      checked={selected}
                      disabled={alreadyAssigned}
                      onChange={() => toggleDraftCouple(couple.key)}
                    />
                    <span>
                      <strong>{couple.lastName}</strong>
                      <small>
                        {alreadyAssigned
                          ? 'Already on a team'
                          : `${couple.players.map((player) => player.display_name).join(' + ')} · Hcp ${formatScore(calculateTeamHandicap(gameType, couple.players))}`}
                      </small>
                    </span>
                  </label>
                );
              })}
              {!coupleOptions.length && <p className="muted">No matching last-name couples found.</p>}
            </div>
          ) : (
            <div className="player-pick-grid compact">
              {players.map((player) => {
              const alreadyAssigned = assignedPlayerIds.has(player.id);
              const selected = draftTeam.playerIds.includes(player.id);
              const atLimit = draftTeam.playerIds.length >= maxTeamSize(gameType);
              return (
                <label key={player.id} className={selected ? 'pick selected' : 'pick'}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={(alreadyAssigned || atLimit) && !selected}
                    onChange={() => toggleDraftPlayer(player.id)}
                  />
                  <span>
                    <strong>{player.display_name}</strong>
                    <small>
                      {alreadyAssigned && !selected
                        ? 'Already on a team'
                        : atLimit && !selected
                          ? 'Team is full'
                          : `CH ${formatScore(player.course_handicap_100)} · BB ${formatScore(frontNineBestBall(player))}`}
                    </small>
                  </span>
                </label>
              );
              })}
            </div>
          )}
          <div className="builder-actions">
            <button
              type="button"
              onClick={addDraftTeam}
              disabled={gameType === 'couples_scramble' ? selectedCoupleCount === 0 : Boolean(draftSizeError)}
            >
              {gameType === 'couples_scramble' ? 'Add Teams' : 'Add the Team'}
            </button>
            <button type="button" className="ghost" onClick={clearDraftTeam}>Clear</button>
          </div>
        </div>
      </section>

      <section className="team-builder">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Teams</p>
            <h2>Added Scorecards</h2>
          </div>
        </div>
        {!teams.length && (
          <div className="panel empty-state">
            <h2>No teams added yet</h2>
            <p className="muted">Use the Add Team panel to select players, then add each team before publishing.</p>
          </div>
        )}
        {teams.map((team, index) => {
          const teamPlayers = team.playerIds.map((playerId) => playerById.get(playerId)).filter(Boolean);
          const handicap = calculateTeamHandicap(gameType, teamPlayers);
          const dots = dotsForHandicap(gameType === 'best_ball' ? 0 : handicap);
          const unavailablePlayerIds = new Set(teams.flatMap((row, teamIndex) => (
            teamIndex === index ? [] : row.playerIds
          )));
          const cardSizeError = teamSizeError(gameType, team.playerIds.length);
          return (
            <article className="panel team-card" key={team.teamId || `${team.teamName}-${index}`}>
              <div className="team-card-head">
                <input value={team.teamName} onChange={(event) => updateTeamName(index, event.target.value)} />
                <button
                  type="button"
                  className="ghost compact-button"
                  onClick={() => removeTeam(index)}
                  disabled={busy || resetBusy || Boolean(removeBusyId)}
                >
                  {removeBusyId && removeBusyId === team.teamId ? 'Removing...' : 'Remove'}
                </button>
              </div>
              <div className="team-meta">
                <strong>{gameType === 'best_ball' ? 'Player dots' : `Team handicap ${formatScore(handicap)}`}</strong>
                <span>{cardSizeError || teamSizeLabel(gameType)}</span>
              </div>
              <div className="player-pick-grid">
                {players.map((player) => {
                  const selected = team.playerIds.includes(player.id);
                  const atLimit = team.playerIds.length >= maxTeamSize(gameType);
                  const disabled = (unavailablePlayerIds.has(player.id) || atLimit) && !selected;
                  return (
                    <label key={player.id} className={selected ? 'pick selected' : 'pick'}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => togglePlayer(index, player.id)}
                      />
                      <span>
                        <strong>{player.display_name}</strong>
                        <small>
                          {unavailablePlayerIds.has(player.id) && !selected
                            ? 'Already on another team'
                            : atLimit && !selected
                              ? 'Team is full'
                              : `CH ${formatScore(player.course_handicap_100)} · BB ${formatScore(frontNineBestBall(player))}`}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
              <DotPreview dots={gameType === 'best_ball' ? null : dots} players={teamPlayers} gameType={gameType} />
            </article>
          );
        })}
      </section>
    </main>
  );
}

function ScorePage() {
  const [detail, setDetail] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamScores, setTeamScores] = useState({});
  const [playerScores, setPlayerScores] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const autoSaveTimerRef = useRef(null);
  const autoSaveSequenceRef = useRef(0);

  useEffect(() => {
    loadActive();
  }, []);

  useEffect(() => () => {
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
  }, []);

  async function loadActive() {
    setError('');
    try {
      const data = await apiGet('/.netlify/functions/active-event');
      setDetail(data);
      const nextTeamId = data.teams?.some((team) => team.id === selectedTeamId)
        ? selectedTeamId
        : data.teams?.[0]?.id || '';
      setSelectedTeamId(nextTeamId);
      hydrateScores(data, nextTeamId);
    } catch (err) {
      setError(err.message);
    }
  }

  function hydrateScores(data, teamId) {
    const card = scorecardForTeam(data?.scorecards || [], teamId);
    setTeamScores(Object.fromEntries((card?.hole_scores || []).map((score) => [score.hole_number, score.gross_score || ''])));
    const nextPlayerScores = {};
    for (const score of card?.hole_scores || []) {
      const parsed = parseNotes(score.notes);
      for (const playerScore of parsed.playerScores || []) {
        nextPlayerScores[score.hole_number] = {
          ...(nextPlayerScores[score.hole_number] || {}),
          [playerScore.player_id]: playerScore.gross_score || ''
        };
      }
    }
    setPlayerScores(nextPlayerScores);
  }

  function changeTeam(teamId) {
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    setAutoSaveStatus('');
    setSelectedTeamId(teamId);
    hydrateScores(detail, teamId);
  }

  function updateTeamScore(holeNumber, value) {
    setTeamScores((current) => {
      const cleanValue = cleanScore(value);
      const next = { ...current, [holeNumber]: cleanValue };
      scheduleAutoSave({ [holeNumber]: cleanValue }, {}, { changedHoleNumber: holeNumber });
      return next;
    });
  }

  function updatePlayerScore(holeNumber, playerId, value) {
    setPlayerScores((current) => {
      const cleanValue = cleanScore(value);
      const next = {
        ...current,
        [holeNumber]: {
          ...(current[holeNumber] || {}),
          [playerId]: cleanValue
        }
      };
      scheduleAutoSave({}, { [holeNumber]: { [playerId]: cleanValue } }, {
        changedHoleNumber: holeNumber,
        changedPlayerId: playerId
      });
      return next;
    });
  }

  function scheduleAutoSave(nextTeamScores, nextPlayerScores, saveOptions = {}) {
    if (!selectedTeamId || !detail?.event) return;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    setMessage('');
    setAutoSaveStatus('Saving...');
    const sequence = autoSaveSequenceRef.current + 1;
    autoSaveSequenceRef.current = sequence;
    autoSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const saved = await persistScore(nextTeamScores, nextPlayerScores, {
          autoSave: true,
          ...saveOptions
        });
        if (autoSaveSequenceRef.current !== sequence) return;
        updateScorecardInDetail(saved.scorecard);
        setAutoSaveStatus('Saved');
        setError('');
      } catch (err) {
        if (autoSaveSequenceRef.current !== sequence) return;
        setAutoSaveStatus('Save failed');
        setError(err.message);
      }
    }, 700);
  }

  async function persistScore(nextTeamScores = teamScores, nextPlayerScores = playerScores, saveOptions = {}) {
    return apiPost('/.netlify/functions/save-score', {
      eventId: detail.event.id,
      teamId: selectedTeamId,
      teamScores: nextTeamScores,
      playerScores: nextPlayerScores,
      ...saveOptions
    });
  }

  function updateScorecardInDetail(scorecard) {
    if (!scorecard) return;
    setDetail((current) => {
      if (!current) return current;
      const existing = current.scorecards || [];
      const hasScorecard = existing.some((card) => card.id === scorecard.id);
      return {
        ...current,
        scorecards: hasScorecard
          ? existing.map((card) => (card.id === scorecard.id ? scorecard : card))
          : [...existing, scorecard]
      };
    });
  }

  async function saveScore(submit = false) {
    if (!selectedTeamId || !detail?.event) return;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    setBusy(true);
    setError('');
    setMessage('');
    setAutoSaveStatus('');
    try {
      const saved = await persistScore();
      updateScorecardInDetail(saved.scorecard);
      if (submit) {
        await apiPost('/.netlify/functions/submit-scorecard', {
          eventId: detail.event.id,
          teamId: selectedTeamId
        });
      }
      setMessage(submit ? 'Scorecard submitted.' : 'Scores saved.');
      await loadActive();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const event = detail?.event;
  const holes = detail?.holes?.length ? detail.holes : defaultHoles;
  const team = detail?.teams?.find((row) => row.id === selectedTeamId);
  const card = scorecardForTeam(detail?.scorecards || [], selectedTeamId);
  const liveTotals = useMemo(() => calculateLiveTotals({
    gameType: event?.game_type,
    holes,
    team,
    teamScores,
    playerScores
  }), [event?.game_type, holes, team, teamScores, playerScores]);
  const summaryGross = liveTotals.grossTotal ?? card?.gross_total;
  const summaryHandicap = liveTotals.playingHandicap ?? team?.team_handicap;
  const summaryNet = liveTotals.netTotal ?? card?.net_total;

  return (
    <main className="app-shell">
      <Header title="Score Entry" />
      <Nav active="score" />
      {error && <p className="error banner">{error}</p>}
      {message && <p className="notice banner">{message}</p>}
      {!event ? (
        <section className="panel empty-state">
          <h2>No open event</h2>
          <p className="muted">Open the admin page and publish tonight's game.</p>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{gameLabels[event.game_type]}</p>
                <h2>{formatDate(event.event_date)}</h2>
              </div>
              <a className="button-link" href="/leaderboard">Leaderboard</a>
            </div>
            <label>
              Team
              <select value={selectedTeamId} onChange={(event) => changeTeam(event.target.value)}>
                {detail.teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.team_name}</option>
                ))}
              </select>
            </label>
          </section>

          {team && event.game_type === 'best_ball' ? (
            <BestBallCard
              team={team}
              holes={holes}
              scores={playerScores}
              onScore={updatePlayerScore}
            />
          ) : team ? (
            <ScrambleCard
              team={team}
              holes={holes}
              scores={teamScores}
              onScore={updateTeamScore}
            />
          ) : null}

          <section className="panel score-summary">
            <div>
              <span>Gross</span>
              <strong>{formatScore(summaryGross)}</strong>
            </div>
            <div>
              <span>Hcp</span>
              <strong>{formatScore(summaryHandicap)}</strong>
            </div>
            <div>
              <span>Net</span>
              <strong>{formatScore(summaryNet)}</strong>
            </div>
          </section>
          {autoSaveStatus && <p className="save-status">{autoSaveStatus}</p>}

          <section className="multi-card-actions">
            <button type="button" onClick={() => saveScore(false)} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            <button type="button" className="primary" onClick={() => saveScore(true)} disabled={busy}>Submit</button>
          </section>
        </>
      )}
    </main>
  );
}

function ScrambleCard({ team, holes, scores, onScore }) {
  const handicap = calculateTeamHandicap('scramble', team.players);
  const dots = dotsForHandicap(handicap);
  return (
    <section className="panel scorecard">
      <ScorecardHead team={team} label={`Team handicap ${formatScore(handicap)}`} />
      <div className="hole-entry-grid">
        {holes.map((hole) => (
          <label key={hole.hole_number} className="hole-entry">
            <span>Hole {hole.hole_number}<small>{dotText(dots[hole.hole_number])}</small></span>
            <input inputMode="numeric" value={scores[hole.hole_number] || ''} onChange={(event) => onScore(hole.hole_number, event.target.value)} />
          </label>
        ))}
      </div>
    </section>
  );
}

function BestBallCard({ team, holes, scores, onScore }) {
  const dotsByPlayer = Object.fromEntries(team.players.map((player) => [
    player.id,
    dotsForHandicap(frontNineBestBall(player))
  ]));

  return (
    <section className="panel scorecard">
      <ScorecardHead team={team} label="Enter each player score" />
      <div className="best-ball-table">
        <div className="best-row best-head">
          <span>Hole</span>
          {team.players.map((player) => <strong key={player.id}>{shortName(player.display_name)}</strong>)}
        </div>
        {holes.map((hole) => (
          <div className="best-row" key={hole.hole_number}>
            <span>#{hole.hole_number}</span>
            {team.players.map((player) => (
              <label key={player.id}>
                <small>{dotText(dotsByPlayer[player.id]?.[hole.hole_number])}</small>
                <input
                  inputMode="numeric"
                  value={scores[hole.hole_number]?.[player.id] || ''}
                  onChange={(event) => onScore(hole.hole_number, player.id, event.target.value)}
                />
              </label>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ScorecardHead({ team, label }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{label}</p>
        <h2>{team.team_name}</h2>
        <p className="muted">{team.players.map((player) => player.display_name).join(' + ')}</p>
      </div>
    </div>
  );
}

function LeaderboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadLeaderboard();
    const interval = window.setInterval(loadLeaderboard, 5000);
    return () => window.clearInterval(interval);
  }, []);

  async function loadLeaderboard() {
    try {
      const next = await apiGet('/.netlify/functions/leaderboard');
      setData(next);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="app-shell">
      <Header title="Leaderboard" />
      <Nav active="leaderboard" />
      {error && <p className="error banner">{error}</p>}
      <section className="panel leaderboard-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{data?.event ? gameLabels[data.event.game_type] : 'Live Board'}</p>
            <h2>{data?.event ? formatDate(data.event.event_date) : 'No open event'}</h2>
          </div>
        </div>
        <div className="leaderboard-table">
          <div className="leaderboard-line leaderboard-head">
            <span>#</span><strong>Team</strong><span>Gross</span><span>Hcp</span><span>Net</span><span>Holes</span>
          </div>
          {(data?.leaderboard || []).map((row, index) => (
            <div className="leaderboard-line" key={row.team_id}>
              <span>{index + 1}</span>
              <strong>{row.team_name}<small>{row.players.join(' + ')}</small></strong>
              <span>{formatScore(row.gross_total)}</span>
              <span>{formatScore(row.playing_handicap)}</span>
              <span>{formatScore(row.net_total)}</span>
              <span>{row.holes_played}/{data?.hole_count || 9}</span>
            </div>
          ))}
          {!data?.leaderboard?.length && <p className="muted">No saved scores yet.</p>}
        </div>
      </section>
    </main>
  );
}

function Header({ title }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img className="topbar-logo" src={leagueLogoUrl} alt="SG Couples League" />
        <div>
          <p className="eyebrow">Sterling Grove</p>
          <h1>{title}</h1>
        </div>
      </div>
    </header>
  );
}

function Nav({ active }) {
  return (
    <nav className="app-nav">
      <a className={active === 'score' ? 'active' : ''} href="/score">Score</a>
      <a className={active === 'leaderboard' ? 'active' : ''} href="/leaderboard">Leaderboard</a>
      <a className={active === 'admin' ? 'active' : ''} href="/admin-night">Admin</a>
    </nav>
  );
}

function DotPreview({ dots, players, gameType }) {
  if (gameType === 'best_ball') {
    return (
      <div className="dot-preview player-dot-preview">
        {players.map((player) => {
          const playerDots = dotsForHandicap(frontNineBestBall(player));
          return (
            <div key={player.id}>
              <strong>{shortName(player.display_name)}</strong>
              {defaultHoles.map((hole) => <span key={hole.hole_number}>{dotText(playerDots[hole.hole_number])}</span>)}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="dot-preview">
      {defaultHoles.map((hole) => <span key={hole.hole_number}>{hole.hole_number}: {dotText(dots?.[hole.hole_number]) || '-'}</span>)}
    </div>
  );
}

function calculateTeamHandicap(gameType, players) {
  if (gameType === 'best_ball') return 0;
  const courseHandicaps = players
    .map((player) => Number(player.course_handicap_100))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!courseHandicaps.length) return null;
  const allocations = courseHandicaps.length === 2 ? [0.35, 0.15] : [0.25, 0.2, 0.15, 0.1, 0.1];
  const eighteen = courseHandicaps.reduce((total, handicap, index) => total + handicap * (allocations[index] || 0), 0);
  return Math.round(eighteen * 0.5);
}

function dotsForHandicap(handicap) {
  const dots = Object.fromEntries(defaultHoles.map((hole) => [hole.hole_number, 0]));
  const total = Math.max(0, Math.round(Number(handicap) || 0));
  for (let index = 0; index < total; index += 1) dots[(index % 9) + 1] += 1;
  return dots;
}

function frontNineBestBall(player) {
  const stored = Number(player.playing_handicap);
  if (Number.isFinite(stored)) return stored;
  const bestBall = Number(player.best_ball_handicap_95);
  return Number.isFinite(bestBall) ? Math.round(bestBall * 0.5) : null;
}

function scorecardForTeam(scorecards, teamId) {
  return (scorecards || []).find((card) => card.team_id === teamId);
}

function calculateLiveTotals({ gameType, holes, team, teamScores, playerScores }) {
  if (!gameType || !team) {
    return {
      playingHandicap: null,
      grossTotal: null,
      netTotal: null
    };
  }

  const normalizedHoles = holes?.length ? holes : defaultHoles;
  if (gameType === 'best_ball') {
    let grossTotal = 0;
    let netTotal = 0;
    let played = 0;
    const dotsByPlayer = Object.fromEntries((team.players || []).map((player) => [
      player.id,
      dotsForHandicap(frontNineBestBall(player))
    ]));

    for (const hole of normalizedHoles) {
      const holeScores = (team.players || [])
        .map((player) => {
          const gross = Number(playerScores?.[hole.hole_number]?.[player.id]);
          if (!Number.isFinite(gross) || gross <= 0) return null;
          const dots = dotsByPlayer[player.id]?.[hole.hole_number] || 0;
          return {
            gross,
            net: gross - dots
          };
        })
        .filter(Boolean);

      if (!holeScores.length) continue;
      grossTotal += Math.min(...holeScores.map((score) => score.gross));
      netTotal += Math.min(...holeScores.map((score) => score.net));
      played += 1;
    }

    return {
      playingHandicap: 0,
      grossTotal: played ? grossTotal : null,
      netTotal: played ? netTotal : null
    };
  }

  const playingHandicap = calculateTeamHandicap(gameType, team.players || []);
  const grossTotal = normalizedHoles.reduce((total, hole) => {
    const score = Number(teamScores?.[hole.hole_number]);
    return Number.isFinite(score) && score > 0 ? total + score : total;
  }, 0);
  const played = normalizedHoles.some((hole) => Number(teamScores?.[hole.hole_number]) > 0);

  return {
    playingHandicap,
    grossTotal: played ? grossTotal : null,
    netTotal: played && playingHandicap !== null ? grossTotal - playingHandicap : null
  };
}

function cleanScore(value) {
  return value.replace(/[^\d]/g, '').slice(0, 2);
}

function parseNotes(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function dotText(value) {
  const count = Number(value) || 0;
  return count > 0 ? '•'.repeat(count) : '';
}

function shortName(name) {
  const parts = String(name || '').split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.at(-1) : parts[0] || 'Player';
}

function teamSizeLabel(gameType) {
  if (gameType === 'couples_scramble') return 'Exactly 2 players';
  if (gameType === 'scramble') return '4 or 5 players';
  return '2 to 4 players';
}

function teamSizeError(gameType, count) {
  if (gameType === 'couples_scramble' && count !== 2) return 'Select exactly 2 players';
  if (gameType === 'scramble' && ![4, 5].includes(count)) return 'Select 4 or 5 players';
  if (gameType === 'best_ball' && (count < 2 || count > 4)) return 'Select 2 to 4 players';
  return '';
}

function emptyDraftTeam(gameType, teamNumber) {
  return {
    teamId: '',
    teamName: gameType === 'couples_scramble' ? '' : `Team ${teamNumber}`,
    playerIds: []
  };
}

function maxTeamSize(gameType) {
  if (gameType === 'couples_scramble') return 2;
  if (gameType === 'scramble') return 5;
  return 4;
}

function buildCoupleOptions(players) {
  const groups = new Map();
  for (const player of players || []) {
    const lastName = coupleLastNameForPlayer(player.display_name);
    if (!lastName) continue;
    groups.set(lastName, [...(groups.get(lastName) || []), player]);
  }

  return [...groups.entries()]
    .filter(([, groupPlayers]) => groupPlayers.length === 2)
    .map(([lastName, groupPlayers]) => ({
      key: lastName.toLowerCase(),
      lastName,
      players: [...groupPlayers].sort((a, b) => genderSort(a.gender) - genderSort(b.gender))
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

function coupleLastNameForPlayer(name) {
  const spouseName = parentheticalFullName(name);
  if (spouseName) return lastNameForPlayer(spouseName);
  return lastNameForPlayer(name);
}

function parentheticalFullName(name) {
  const match = String(name || '').match(/\(([^)]+)\)/);
  const value = match?.[1]?.trim() || '';
  return value.split(/\s+/).filter(Boolean).length >= 2 ? value : '';
}

function lastNameForPlayer(name) {
  const cleaned = String(name || '')
    .replace(/\([^)]*\)/g, '')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return (parts.at(-1) || '').replace(/[^a-zA-Z'-]/g, '');
}

function genderSort(gender) {
  return String(gender || '').toLowerCase().startsWith('men') ? 0 : 1;
}

function formatDate(value) {
  if (!value) return 'Tonight';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return '-';
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const rootElement = document.getElementById('root');
const root = window.thursdayLeagueRoot || createRoot(rootElement);
window.thursdayLeagueRoot = root;
root.render(<App />);
