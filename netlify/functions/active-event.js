import { eventDetail, activeEvent } from './_event-data.js';
import { handleOptions, json, serviceClient } from './_supabase.js';

export async function handler(event) {
  const options = handleOptions(event);
  if (options) return options;

  try {
    const supabase = serviceClient();
    const leagueEvent = await activeEvent(supabase, { requireTeams: true });
    const detail = await eventDetail(supabase, leagueEvent?.id);

    return json(200, detail);
  } catch (error) {
    return json(500, { error: error.message });
  }
}
