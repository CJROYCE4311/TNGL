import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(appDir, '..', '..');
const csvDir = resolve(projectDir, 'csv_tables');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  })
);

const eventDate = args.get('event-date');
const format = args.get('format') || 'scramble';
const holeCount = Number(args.get('holes') || 9);
const status = args.get('status') || 'draft';

if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
  throw new Error('Usage: npm run seed:sql -- --event-date=2026-05-21 --format=scramble --holes=9 --status=open');
}

if (!['scramble', 'best_ball'].includes(format)) {
  throw new Error('--format must be scramble or best_ball');
}

const courses = readCsv('courses.csv');
const leagues = readCsv('leagues.csv');
const players = readCsv('players.csv');
const teeRatings = readCsv('tee_ratings.csv');
const handicaps = readCsv('player_handicaps.csv');
const teams = readCsv(format === 'scramble' ? 'scramble_teams.csv' : 'best_ball_teams.csv');
const teamPlayers = readCsv(format === 'scramble' ? 'scramble_team_players.csv' : 'best_ball_team_players.csv');
const league = leagues[0];
const course = courses.find((row) => row.course_id === league.course_id) || courses[0];

const sql = [];
line('-- Generated seed SQL for Thursday League scoring app.');
line(`-- Source: csv_tables, format=${format}, event_date=${eventDate}`);
line('begin;');

for (const row of courses) {
  line(`insert into courses (external_course_id, course_name) values (${q(row.course_id)}, ${q(row.course_name)}) on conflict (external_course_id) do update set course_name = excluded.course_name;`);
}

line(`insert into league_events (external_league_id, league_name, event_date, format, course_id, course_name, hole_count, status)`);
line(`select ${q(league.league_id)}, ${q(league.league_name)}, ${q(eventDate)}::date, ${q(format)}, c.id, ${q(course.course_name)}, ${holeCount}, ${q(status)}`);
line(`from courses c where c.external_course_id = ${q(course.course_id)}`);
line('on conflict (event_date, format) do update set external_league_id = excluded.external_league_id, league_name = excluded.league_name, course_id = excluded.course_id, course_name = excluded.course_name, hole_count = excluded.hole_count, status = excluded.status, updated_at = now();');

for (const row of players) {
  line(`insert into players (external_player_id, display_name, normalized_name, gender, home_club) values (${q(row.player_id)}, ${q(row.player_name)}, ${q(row.normalized_name)}, ${q(row.gender)}, ${q(row.home_club)}) on conflict (external_player_id) do update set display_name = excluded.display_name, normalized_name = excluded.normalized_name, gender = excluded.gender, home_club = excluded.home_club;`);
}

for (const row of teeRatings) {
  line(`insert into tee_ratings (external_tee_rating_id, course_id, gender, tee, course_rating, slope, is_men_league_tee, is_women_league_tee)`);
  line(`select ${q(row.tee_rating_id)}, c.id, ${q(row.gender)}, ${q(row.tee)}, ${num(row.course_rating)}, ${num(row.slope)}, ${bool(row.is_men_league_tee)}, ${bool(row.is_women_league_tee)}`);
  line(`from courses c where c.external_course_id = ${q(row.course_id)}`);
  line('on conflict (external_tee_rating_id) do update set gender = excluded.gender, tee = excluded.tee, course_rating = excluded.course_rating, slope = excluded.slope, is_men_league_tee = excluded.is_men_league_tee, is_women_league_tee = excluded.is_women_league_tee;');
}

for (const row of handicaps) {
  line(`insert into player_handicaps (external_player_handicap_id, player_id, external_league_id, effective_date, league_tee, tee_rating_id, handicap_index, course_rating, slope, course_handicap_100, best_ball_handicap_95, notes)`);
  line(`select ${q(row.player_handicap_id)}, p.id, ${q(row.league_id)}, ${q(row.effective_date)}::date, ${q(row.league_tee)}, tr.id, ${num(row.handicap_index)}, ${num(row.course_rating)}, ${num(row.slope)}, ${num(row.course_handicap_100)}, ${num(row.best_ball_handicap_95)}, ${q(row.notes)}`);
  line(`from players p left join tee_ratings tr on tr.external_tee_rating_id = ${q(row.tee_rating_id)} where p.external_player_id = ${q(row.player_id)}`);
  line('on conflict (external_player_handicap_id) do update set handicap_index = excluded.handicap_index, course_handicap_100 = excluded.course_handicap_100, best_ball_handicap_95 = excluded.best_ball_handicap_95, notes = excluded.notes;');
}

for (const row of teams) {
  const externalTeamId = row.scramble_team_id || row.best_ball_team_id;
  const teamName = row.team_name || `Team ${row.team_number}`;
  const isActive = row.is_active;
  const handicap = row.team_handicap || '';
  const sourceRow = row.source_row || '';
  line(`insert into teams (external_team_id, event_id, team_name, is_active, team_handicap, source_format, source_row)`);
  line(`select ${q(externalTeamId)}, e.id, ${q(teamName)}, ${bool(isActive)}, ${num(handicap)}, ${q(format)}, ${num(sourceRow)}`);
  line(`from league_events e where e.event_date = ${q(eventDate)}::date and e.format = ${q(format)}`);
  line('on conflict (event_id, external_team_id) do update set team_name = excluded.team_name, is_active = excluded.is_active, team_handicap = excluded.team_handicap, source_format = excluded.source_format, source_row = excluded.source_row;');
}

for (const row of teamPlayers) {
  const externalTeamId = row.scramble_team_id || row.best_ball_team_id;
  const position = row.spot_order || row.position;
  const playingHandicap = row.front_9_handicap || row.player_strokes || row.best_ball_handicap_95 || '';
  line(`insert into team_players (team_id, player_id, position, assigned_role, course_handicap_100, playing_handicap)`);
  line(`select t.id, p.id, ${num(position)}, ${q(row.assigned_role)}, ${num(row.course_handicap_100)}, ${num(playingHandicap)}`);
  line(`from teams t join league_events e on e.id = t.event_id join players p on p.external_player_id = ${q(row.player_id)}`);
  line(`where e.event_date = ${q(eventDate)}::date and e.format = ${q(format)} and t.external_team_id = ${q(externalTeamId)}`);
  line('on conflict (team_id, player_id) do update set position = excluded.position, assigned_role = excluded.assigned_role, course_handicap_100 = excluded.course_handicap_100, playing_handicap = excluded.playing_handicap;');
}

line('commit;');
console.log(sql.join('\n'));

function line(value) {
  sql.push(value);
}

function readCsv(name) {
  const text = readFileSync(resolve(csvDir, name), 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCsv(text);
  const headers = rows.shift();
  return rows
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows;
}

function q(value) {
  if (value === undefined || value === null || value === '') return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function num(value) {
  if (value === undefined || value === null || value === '') return 'null';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : 'null';
}

function bool(value) {
  return ['true', 't', '1', 'yes'].includes(String(value).toLowerCase()) ? 'true' : 'false';
}
