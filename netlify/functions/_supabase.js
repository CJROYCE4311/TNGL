import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

export function text(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      ...extraHeaders
    },
    body
  };
}

export function handleOptions(event) {
  if (event.httpMethod !== 'OPTIONS') return null;
  return text(204, '');
}

export function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  const missing = [];
  if (!url) missing.push('SUPABASE_URL or VITE_SUPABASE_URL');
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) throw new Error(`Missing Supabase service environment variables: ${missing.join(', ')}`);
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function anonClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const missing = [];
  if (!url) missing.push('SUPABASE_URL or VITE_SUPABASE_URL');
  if (!key) missing.push('SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY');
  if (missing.length) throw new Error(`Missing Supabase anon environment variables: ${missing.join(', ')}`);
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function requireUser(event) {
  const auth = event.headers.authorization || event.headers.Authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { error: json(401, { error: 'Sign in required' }) };

  const { data, error } = await anonClient().auth.getUser(token);
  if (error || !data.user) return { error: json(401, { error: 'Invalid session' }) };

  return {
    user: data.user,
    isAdmin: isAdminEmail(data.user.email)
  };
}

export function requireAdmin(authContext) {
  if (!authContext.isAdmin) return json(403, { error: 'Admin access required' });
  return null;
}

export function isAdminEmail(email) {
  const admins = (process.env.LEAGUE_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && admins.includes(email.toLowerCase()));
}

export function parseJson(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export function assertUuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')) {
    throw new Error(`${label} is required`);
  }
}

export function scorecardSelect() {
  return `
    id,
    event_id,
    team_id,
    status,
    gross_total,
    net_total,
    submitted_at,
    hole_scores (
      hole_number,
      gross_score,
      net_score,
      notes
    )
  `;
}
