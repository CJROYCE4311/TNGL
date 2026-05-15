import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { apiDownload, apiGet, apiPost } from './api';
import { hasSupabaseConfig, supabase } from './supabaseClient';
import './styles.css';

const emptyScores = {};
const tonightHoles = Array.from({ length: 9 }, (_, index) => ({ hole_number: index + 1 }));
const authRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin;
const tonightStateVersion = 'blank-foursomes-v2';
const foursomeOptions = Array.from({ length: 8 }, (_, index) => index + 1);

const tonightCouples = [
  { id: 'royce', name: 'Royce', players: ['Miki Royce', 'Christopher Royce'] },
  { id: 'pejka-doetzel', name: 'Pejka / Doetzel', players: ['Mike Pejka', 'Diana Doetzel'] },
  { id: 'kroutil', name: 'Kroutil', players: ['Richard Kroutil', 'Carrie Kroutil'] },
  { id: 'bellows', name: 'Bellows', players: ['Trevor Bellows', 'Amy Bellows'] },
  { id: 'hamilton', name: 'Hamilton', players: ['Eric Hamilton', 'Lorena Hamilton'] },
  { id: 'lamb', name: 'Lamb', players: ['Eric Lamb', 'Nicole Lamb'] },
  { id: 'culy', name: 'Culy', players: ['Craig Culy', 'Jennifer Culy'] },
  { id: 'wigder-laporta', name: 'Wigder / LaPorta', players: ['Tim Wigder', 'Amy LaPorta'] },
  { id: 'hill', name: 'Hill', players: ['Rob Hill', 'Mikki Hill'] },
  { id: 'ackley', name: 'Ackley', players: ['BJ Ackley', 'Cati Ackley'] },
  { id: 'holman-bayerle', name: 'Holman / Bayerle', players: ['Julie Holman', 'Kirby Bayerle'] },
  { id: 'solomon', name: 'Solomon', players: ['David Solomon', 'Marianne Solomon'] }
];

const initialTonightState = {
  version: tonightStateVersion,
  couples: tonightCouples.map((couple) => ({
    ...couple,
    checkedIn: false,
    group: ''
  })),
  scores: {},
  submitted: {}
};

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [detail, setDetail] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [scores, setScores] = useState(emptyScores);
  const [leaderboard, setLeaderboard] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    loadEvents();
  }, [session]);

  useEffect(() => {
    if (!selectedEventId) return;
    loadEventDetail(selectedEventId);
    loadLeaderboard(selectedEventId);
  }, [selectedEventId]);

  const selectedTeam = useMemo(
    () => detail?.teams.find((team) => team.id === selectedTeamId),
    [detail, selectedTeamId]
  );

  const holes = useMemo(() => {
    if (detail?.holes?.length) return detail.holes;
    return Array.from({ length: detail?.event?.hole_count || 9 }, (_, index) => ({
      hole_number: index + 1,
      par: null
    }));
  }, [detail]);

  const totals = useMemo(() => {
    let gross = 0;
    let played = 0;
    let par = 0;
    let hasPar = false;

    for (const hole of holes) {
      const score = Number(scores[hole.hole_number]);
      if (Number.isFinite(score) && score > 0) {
        gross += score;
        played += 1;
        if (hole.par) {
          par += Number(hole.par);
          hasPar = true;
        }
      }
    }

    return {
      gross,
      played,
      toPar: hasPar ? gross - par : null,
      complete: played === holes.length
    };
  }, [holes, scores]);

  async function loadEvents() {
    setError('');
    try {
      const data = await apiGet('/.netlify/functions/events');
      setEvents(data.events);
      if (!selectedEventId && data.events.length) setSelectedEventId(data.events[0].id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadEventDetail(eventId) {
    setBusy(true);
    setError('');
    try {
      const data = await apiGet(`/.netlify/functions/event-detail?eventId=${encodeURIComponent(eventId)}`);
      setDetail(data);
      const firstTeamId = data.teams[0]?.id || '';
      const nextTeamId = selectedTeamId && data.teams.some((team) => team.id === selectedTeamId)
        ? selectedTeamId
        : firstTeamId;
      setSelectedTeamId(nextTeamId);
      setScores(scoresForTeam(data.scorecards, nextTeamId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadLeaderboard(eventId) {
    try {
      const data = await apiGet(`/.netlify/functions/leaderboard?eventId=${encodeURIComponent(eventId)}`);
      setLeaderboard(data.leaderboard);
    } catch {
      setLeaderboard([]);
    }
  }

  function handleTeamChange(teamId) {
    setSelectedTeamId(teamId);
    setScores(scoresForTeam(detail?.scorecards || [], teamId));
  }

  function updateScore(holeNumber, value) {
    const cleaned = value.replace(/[^\d]/g, '').slice(0, 2);
    setScores((current) => ({
      ...current,
      [holeNumber]: cleaned
    }));
  }

  async function saveScores() {
    setBusy(true);
    setError('');
    try {
      const payload = {
        eventId: selectedEventId,
        teamId: selectedTeamId,
        scores: holes
          .map((hole) => ({
            holeNumber: hole.hole_number,
            grossScore: Number(scores[hole.hole_number])
          }))
          .filter((score) => Number.isFinite(score.grossScore) && score.grossScore > 0)
      };
      await apiPost('/.netlify/functions/save-score', payload);
      await loadEventDetail(selectedEventId);
      await loadLeaderboard(selectedEventId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitScorecard() {
    setBusy(true);
    setError('');
    try {
      await saveScores();
      await apiPost('/.netlify/functions/submit-scorecard', {
        eventId: selectedEventId,
        teamId: selectedTeamId
      });
      await loadEventDetail(selectedEventId);
      await loadLeaderboard(selectedEventId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setError('');
    try {
      await apiDownload(
        `/.netlify/functions/export-results?eventId=${encodeURIComponent(selectedEventId)}`,
        'thursday-league-results.csv'
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function signIn(event) {
    event.preventDefault();
    setAuthMessage('');
    setError('');
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authRedirectUrl }
    });
    if (signInError) setError(signInError.message);
    else setAuthMessage('Check your email for the sign-in link.');
  }

  if (!hasSupabaseConfig) {
    return <TonightScrambleApp />;
  }

  if (!session) {
    return (
      <main className="app-shell auth-screen">
        <section className="panel narrow">
          <p className="eyebrow">Sterling Grove</p>
          <h1>Thursday League Scoring</h1>
          <form onSubmit={signIn} className="stack">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <button type="submit">Send Link</button>
          </form>
          {authMessage && <p className="notice">{authMessage}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Sterling Grove</p>
          <h1>Thursday League</h1>
        </div>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign Out</button>
      </header>

      {error && <p className="error banner">{error}</p>}

      <section className="controls">
        <label>
          Event
          <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {formatDate(event.event_date)} · {event.format}
              </option>
            ))}
          </select>
        </label>
        <label>
          Team
          <select value={selectedTeamId} onChange={(event) => handleTeamChange(event.target.value)}>
            {detail?.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.team_name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="score-layout">
        <div className="panel score-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{detail?.event?.format || 'Scoring'}</p>
              <h2>{selectedTeam?.team_name || 'Select Team'}</h2>
            </div>
            <div className="total-box">
              <span>{totals.gross || '-'}</span>
              <small>{totals.toPar === null ? `${totals.played}/${holes.length}` : toParLabel(totals.toPar)}</small>
            </div>
          </div>

          {selectedTeam?.players?.length > 0 && (
            <div className="player-list">
              {selectedTeam.players.map((player) => (
                <span key={player.id}>{player.display_name}</span>
              ))}
            </div>
          )}

          <div className="holes-grid">
            {holes.map((hole) => (
              <label key={hole.hole_number} className="hole-cell">
                <span>
                  {hole.hole_number}
                  {hole.par ? <small>Par {hole.par}</small> : null}
                </span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={scores[hole.hole_number] || ''}
                  onChange={(event) => updateScore(hole.hole_number, event.target.value)}
                />
              </label>
            ))}
          </div>

          <div className="actions">
            <button type="button" onClick={saveScores} disabled={busy || !selectedTeamId}>
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className="primary"
              onClick={submitScorecard}
              disabled={busy || !selectedTeamId || !totals.complete}
            >
              Submit
            </button>
          </div>
        </div>

        <div className="panel leaderboard-panel">
          <div className="section-heading compact">
            <h2>Leaderboard</h2>
            {selectedEventId && <button className="ghost compact-button" onClick={exportCsv}>CSV</button>}
          </div>
          <div className="leaderboard">
            <div className="leaderboard-row leaderboard-header">
              <span>#</span>
              <strong>Team</strong>
              <span>Gross</span>
              <span>Net</span>
              <small>Status</small>
            </div>
            {leaderboard.map((row, index) => (
              <div key={row.team_id} className="leaderboard-row">
                <span>{index + 1}</span>
                <strong>{row.team_name}</strong>
                <span>{row.gross_total ?? '-'}</span>
                <span>{formatScore(row.net_total)}</span>
                <small>{row.status}</small>
              </div>
            ))}
            {!leaderboard.length && <p className="muted">No submitted scores yet.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

function TonightScrambleApp() {
  const [state, setState] = useState(() => readTonightState());
  const [view, setView] = useState('score');
  const [activeGroup, setActiveGroup] = useState('');

  useEffect(() => {
    localStorage.setItem('thursdayTonightScoring', JSON.stringify(state));
  }, [state]);

  const activeCouples = state.couples.filter((couple) => couple.checkedIn);
  const groups = useMemo(() => {
    const grouped = new Map();
    for (const couple of activeCouples) {
      const group = Number(couple.group);
      if (!Number.isInteger(group) || group < 1) continue;
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(couple);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([group, couples]) => ({ group, couples }));
  }, [activeCouples]);

  useEffect(() => {
    if (groups.length && !groups.some((group) => group.group === activeGroup)) {
      setActiveGroup(groups[0].group);
    } else if (!groups.length && activeGroup) {
      setActiveGroup('');
    }
  }, [groups, activeGroup]);

  const currentGroup = groups.find((group) => group.group === activeGroup) || groups[0];
  const leaderboardRows = activeCouples
    .map((couple) => ({
      ...couple,
      total: totalForCouple(state.scores, couple.id),
      played: playedForCouple(state.scores, couple.id),
      submitted: Boolean(state.submitted[couple.id])
    }))
    .sort((a, b) => {
      if (a.played !== b.played) return b.played - a.played;
      return a.total - b.total;
    });

  function toggleCouple(coupleId) {
    setState((current) => ({
      ...current,
      couples: current.couples.map((couple) =>
        couple.id === coupleId
          ? { ...couple, checkedIn: !couple.checkedIn, group: couple.checkedIn ? '' : couple.group }
          : couple
      ),
      scores: current.couples.find((couple) => couple.id === coupleId)?.checkedIn
        ? Object.fromEntries(Object.entries(current.scores).filter(([id]) => id !== coupleId))
        : current.scores,
      submitted: current.couples.find((couple) => couple.id === coupleId)?.checkedIn
        ? Object.fromEntries(Object.entries(current.submitted).filter(([id]) => id !== coupleId))
        : current.submitted
    }));
  }

  function setCoupleGroup(coupleId, group) {
    setState((current) => ({
      ...current,
      couples: current.couples.map((couple) =>
        couple.id === coupleId ? { ...couple, group: group ? Number(group) : '' } : couple
      )
    }));
  }

  function updateTonightScore(coupleId, holeNumber, value) {
    const cleaned = value.replace(/[^\d]/g, '').slice(0, 2);
    setState((current) => ({
      ...current,
      scores: {
        ...current.scores,
        [coupleId]: {
          ...(current.scores[coupleId] || {}),
          [holeNumber]: cleaned
        }
      },
      submitted: {
        ...current.submitted,
        [coupleId]: false
      }
    }));
  }

  function submitGroup() {
    if (!currentGroup) return;
    setState((current) => ({
      ...current,
      submitted: {
        ...current.submitted,
        ...Object.fromEntries(currentGroup.couples.map((couple) => [couple.id, true]))
      }
    }));
  }

  function resetTonight() {
    setState(initialTonightState);
    setActiveGroup('');
  }

  function exportTonightCsv() {
    const columns = ['couple', 'players', 'foursome', 'played', 'total', ...tonightHoles.map((hole) => `hole_${hole.hole_number}`)];
    const rows = leaderboardRows.map((row) => [
      row.name,
      row.players.join(' / '),
      row.group,
      row.played,
      row.total || '',
      ...tonightHoles.map((hole) => state.scores[row.id]?.[hole.hole_number] || '')
    ]);
    downloadText('thursday-couples-scramble-tonight.csv', [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\n'));
  }

  return (
    <main className="tonight-shell">
      <section className="tonight-hero">
        <div className="hero-copy">
          <AnimatedLeagueLogo />
          <p className="eyebrow">Sterling Grove</p>
          <h1>Thursday Couples Scramble</h1>
          <p className="hero-subtitle">Check in only tonight's couples, assign foursomes before tee time, and keep the leaderboard moving live.</p>
          <div className="view-toggle" aria-label="View">
            <button className={view === 'score' ? 'active' : ''} onClick={() => setView('score')}>Score</button>
            <button className={view === 'leaderboard' ? 'active' : ''} onClick={() => setView('leaderboard')}>Leaderboard</button>
          </div>
        </div>
        <div className="hero-photo-stack" aria-hidden="true">
          <img src="https://www.sterlinggroveclub.com/Images/Library/SterlingGrovehole18DJI_0866.jpg" alt="" />
          <img src="https://www.sterlinggroveclub.com/Images/Library/SterlingGrovehole1DJI_0773-Edit.jpg" alt="" />
        </div>
      </section>

      <section className="tonight-stats">
        <div><strong>{activeCouples.length}</strong><span>Couples In</span></div>
        <div><strong>{groups.length}</strong><span>Assigned Foursomes</span></div>
        <div><strong>{leaderboardRows.filter((row) => row.submitted).length}</strong><span>Cards In</span></div>
      </section>

      {view === 'score' ? (
        <section className="tonight-grid">
          <RosterPanel state={state} onToggle={toggleCouple} onGroupChange={setCoupleGroup} />
          <div className="scoring-stage">
            <GroupTabs groups={groups} activeGroup={activeGroup} onChange={setActiveGroup} />
            <ScoreFoursome
              group={currentGroup}
              scores={state.scores}
              submitted={state.submitted}
              onScore={updateTonightScore}
              onSubmit={submitGroup}
            />
          </div>
        </section>
      ) : (
        <LeaderboardView rows={leaderboardRows} scores={state.scores} onExport={exportTonightCsv} onReset={resetTonight} />
      )}
    </main>
  );
}

function AnimatedLeagueLogo() {
  return (
    <div className="league-mark" aria-label="Thursday Couples League">
      <span className="mark-ring" />
      <span className="mark-ball" />
      <span className="mark-flag">T</span>
      <span className="mark-script">Couples</span>
    </div>
  );
}

function RosterPanel({ state, onToggle, onGroupChange }) {
  return (
    <aside className="tonight-panel roster-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Tonight</p>
          <h2>Couple Check-In</h2>
        </div>
      </div>
      <div className="couple-list">
        {state.couples.map((couple) => (
          <div className={couple.checkedIn ? 'couple-row checked' : 'couple-row'} key={couple.id}>
            <button className="check-button" onClick={() => onToggle(couple.id)} aria-pressed={couple.checkedIn}>
              {couple.checkedIn ? '✓' : ''}
            </button>
            <div className="couple-copy">
              <strong>{couple.name}</strong>
              <span>{couple.players.join(' + ')}</span>
            </div>
            <label className="group-picker">
              <span>Foursome</span>
              <select
                value={couple.group}
                onChange={(event) => onGroupChange(couple.id, event.target.value)}
                disabled={!couple.checkedIn}
              >
                <option value="">Blank</option>
                {foursomeOptions.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
    </aside>
  );
}

function GroupTabs({ groups, activeGroup, onChange }) {
  if (!groups.length) {
    return (
      <div className="group-tabs empty-tabs">
        <span>No foursomes assigned yet</span>
      </div>
    );
  }

  return (
    <div className="group-tabs">
      {groups.map((group) => (
        <button
          key={group.group}
          className={group.group === activeGroup ? 'active' : ''}
          onClick={() => onChange(group.group)}
        >
          {group.group}
          <span>{group.couples.length} teams</span>
        </button>
      ))}
    </div>
  );
}

function ScoreFoursome({ group, scores, submitted, onScore, onSubmit }) {
  if (!group) {
    return (
      <section className="tonight-panel empty-scorecard">
        <h2>Assign a foursome</h2>
        <p className="muted">Check in tonight's couples, then choose a foursome number to create a scorecard.</p>
      </section>
    );
  }

  return (
    <section className="tonight-panel live-card">
      <div className="scorecard-head">
        <div>
          <p className="eyebrow">Foursome {group.group}</p>
          <h2>{group.couples.map((couple) => couple.name).join(' vs ')}</h2>
        </div>
        <button className="primary" onClick={onSubmit}>Submit Foursome</button>
      </div>
      <div className="score-table">
        <div className="score-row score-header">
          <span>Hole</span>
          {group.couples.map((couple) => (
            <strong key={couple.id}>{couple.name}</strong>
          ))}
        </div>
        {tonightHoles.map((hole) => (
          <div className="score-row" key={hole.hole_number}>
            <span>
              {hole.hole_number}
              <small>Score</small>
            </span>
            {group.couples.map((couple) => (
              <input
                key={couple.id}
                inputMode="numeric"
                pattern="[0-9]*"
                value={scores[couple.id]?.[hole.hole_number] || ''}
                onChange={(event) => onScore(couple.id, hole.hole_number, event.target.value)}
                aria-label={`${couple.name} hole ${hole.hole_number}`}
              />
            ))}
          </div>
        ))}
        <div className="score-row total-row">
          <span>Total</span>
          {group.couples.map((couple) => {
            const total = totalForCouple(scores, couple.id);
            const played = playedForCouple(scores, couple.id);
            return (
              <strong key={couple.id}>
                {total || '-'}
                <small>{played}/9 {submitted[couple.id] ? 'Submitted' : ''}</small>
              </strong>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LeaderboardView({ rows, scores, onExport, onReset }) {
  return (
    <section className="leaderboard-stage">
      <div className="tonight-panel leaderboard-hero">
        <div>
          <p className="eyebrow">Live Board</p>
          <h2>Tonight's Race</h2>
        </div>
        <div className="leaderboard-actions">
          <button className="ghost" onClick={onExport}>Export CSV</button>
          <button className="danger" onClick={onReset}>Reset</button>
        </div>
      </div>
      <div className="leaderboard-cards">
        {rows.map((row, index) => (
          <article className={index === 0 && row.played ? 'leader-card leader' : 'leader-card'} key={row.id}>
            <span className="rank">{index + 1}</span>
            <div>
              <h3>{row.name}</h3>
              <p>{row.players.join(' + ')}</p>
            </div>
            <div className="leader-score">
              <strong>{row.total || '-'}</strong>
              <span>{row.played ? `${row.played}/9 holes` : 'No scores'}</span>
            </div>
            <div className="mini-holes">
              {tonightHoles.map((hole) => (
                <span key={hole.hole_number}>{scores[row.id]?.[hole.hole_number] || '·'}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function readTonightState() {
  try {
    const saved = JSON.parse(localStorage.getItem('thursdayTonightScoring'));
    if (saved?.version === tonightStateVersion && saved?.couples && saved?.scores) return saved;
  } catch {
    return initialTonightState;
  }
  return initialTonightState;
}

function totalForCouple(scores, coupleId) {
  return Object.values(scores[coupleId] || {}).reduce((sum, score) => sum + (Number(score) || 0), 0);
}

function playedForCouple(scores, coupleId) {
  return Object.values(scores[coupleId] || {}).filter((score) => Number(score) > 0).length;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const textValue = String(value ?? '');
  if (!/[",\n]/.test(textValue)) return textValue;
  return `"${textValue.replace(/"/g, '""')}"`;
}

function scoresForTeam(scorecards, teamId) {
  const scorecard = scorecards.find((card) => card.team_id === teamId);
  if (!scorecard?.hole_scores) return {};
  return Object.fromEntries(
    scorecard.hole_scores
      .filter((score) => score.gross_score)
      .map((score) => [score.hole_number, String(score.gross_score)])
  );
}

function formatDate(value) {
  if (!value) return 'Event';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return '-';
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function toParLabel(value) {
  if (value === 0) return 'E';
  return value > 0 ? `+${value}` : String(value);
}

createRoot(document.getElementById('root')).render(<App />);
