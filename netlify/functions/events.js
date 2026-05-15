import { handleOptions, json, requireUser, serviceClient } from './_supabase.js';

export async function handler(event) {
  const options = handleOptions(event);
  if (options) return options;

  try {
    const auth = await requireUser(event);
    if (auth.error) return auth.error;

    const supabase = serviceClient();
    const { data, error } = await supabase
      .from('league_events')
      .select('id, external_league_id, league_name, event_date, format, status, course_name, nine, hole_count')
      .in('status', ['draft', 'open', 'closed'])
      .order('event_date', { ascending: false });

    if (error) throw error;
    return json(200, { events: data || [] });
  } catch (error) {
    return json(500, { error: error.message });
  }
}
