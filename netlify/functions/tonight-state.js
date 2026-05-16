import { handleOptions, json, parseJson, serviceClient } from './_supabase.js';

const stateId = 'default';
const maxStateBytes = 64_000;

export async function handler(event) {
  const options = handleOptions(event);
  if (options) return options;

  try {
    if (event.httpMethod === 'GET') return getTonightState();
    if (event.httpMethod === 'POST') return saveTonightState(event);
    return json(405, { error: 'Method not allowed' });
  } catch (error) {
    return json(500, { error: error.message });
  }
}

async function getTonightState() {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('tonight_states')
    .select('state, updated_at')
    .eq('id', stateId)
    .maybeSingle();

  if (error) throw error;
  return json(200, {
    state: data?.state || null,
    updatedAt: data?.updated_at || null
  });
}

async function saveTonightState(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = parseJson(event);
  const state = normalizeState(body.state);
  const now = new Date().toISOString();
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('tonight_states')
    .upsert({ id: stateId, state, updated_at: now }, { onConflict: 'id' })
    .select('state, updated_at')
    .single();

  if (error) throw error;
  return json(200, {
    state: data.state,
    updatedAt: data.updated_at
  });
}

function normalizeState(state) {
  if (!state || typeof state !== 'object') throw new Error('state is required');
  if (JSON.stringify(state).length > maxStateBytes) throw new Error('state is too large');
  if (typeof state.version !== 'string') throw new Error('state.version is required');
  if (!Array.isArray(state.couples)) throw new Error('state.couples must be an array');
  if (!state.scores || typeof state.scores !== 'object' || Array.isArray(state.scores)) {
    throw new Error('state.scores must be an object');
  }
  if (!state.submitted || typeof state.submitted !== 'object' || Array.isArray(state.submitted)) {
    throw new Error('state.submitted must be an object');
  }

  return {
    version: state.version,
    couples: state.couples.map((couple) => ({
      id: String(couple.id || ''),
      name: String(couple.name || ''),
      players: Array.isArray(couple.players) ? couple.players.map((player) => String(player)) : [],
      checkedIn: Boolean(couple.checkedIn),
      group: normalizeGroup(couple.group)
    })),
    scores: normalizeScores(state.scores),
    submitted: Object.fromEntries(
      Object.entries(state.submitted).map(([coupleId, submitted]) => [coupleId, Boolean(submitted)])
    )
  };
}

function normalizeGroup(value) {
  if (value === '' || value === null || typeof value === 'undefined') return '';
  const group = Number(value);
  return Number.isInteger(group) && group > 0 ? group : '';
}

function normalizeScores(scores) {
  return Object.fromEntries(
    Object.entries(scores).map(([coupleId, scoreByHole]) => [
      coupleId,
      Object.fromEntries(
        Object.entries(isPlainObject(scoreByHole) ? scoreByHole : {}).map(([holeNumber, score]) => [
          holeNumber,
          String(score || '').replace(/[^\d]/g, '').slice(0, 2)
        ])
      )
    ])
  );
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
