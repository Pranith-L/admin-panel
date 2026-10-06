/**
 * Canonical event catalogue — the single source of truth for the app.
 *
 * The donut charts used to merge this hardcoded list with the `events` table.
 * The two used different codes for the same event (`CC` vs `CO` for
 * Connections, `US` vs `UN` for Unsaid, ...), so `dedupeByCode` kept both and
 * every duplicated event rendered as a second slice. Nothing here is merged
 * with the database any more: the catalogue decides WHICH events appear, the
 * database only supplies the registration counts.
 *
 * `dbAliases` lists spellings already present in the `events` table so a
 * catalogue entry still resolves to its database row.
 */

/** Official technical (Day 1) lineup. */
export const DAY1_EVENTS = [
  { code: 'PP', name: 'Paper Presentation', day: 'DAY_1', dbAliases: [] },
  { code: 'US', name: 'Unsaid', day: 'DAY_1', dbAliases: [] },
  { code: 'CCD', name: 'Cipher Coding', day: 'DAY_1', dbAliases: [] },
  { code: 'WB', name: 'Weblica', day: 'DAY_1', dbAliases: [] },
  { code: 'XC', name: 'Xcoders', day: 'DAY_1', dbAliases: ['X Coders', 'X-Coders'] },
];

/** Official non-technical (Day 2) lineup. */
export const DAY2_EVENTS = [
  { code: 'SL', name: 'Spotlight', day: 'DAY_2', dbAliases: ['Spot Light', 'Stage Play'] },
  { code: 'CC', name: 'Connections', day: 'DAY_2', dbAliases: ['Connection'] },
  { code: 'FB', name: 'Find the BGM', day: 'DAY_2', dbAliases: ['Find the BGM '] },
  { code: 'MS', name: 'Mixed Signals', day: 'DAY_2', dbAliases: ['Mystic Signals'] },
  { code: 'LL', name: 'Lost in Lyrics', day: 'DAY_2', dbAliases: [] },
];

export const CATALOG_DAY1 = DAY1_EVENTS;
export const CATALOG_DAY2 = DAY2_EVENTS;
export const OFFICIAL_EVENTS = [...DAY1_EVENTS, ...DAY2_EVENTS];

/** Free Fire is a premium special event, tracked separately from the line-up. */
export const FREE_FIRE_EVENT_CODE = 'EP';
export const FREE_FIRE_EVENT_ID = '01524e69-6f8d-42b7-933e-6f4121681402';
export const FREE_FIRE_EVENT_NAME = 'Esports(Free Fire)';

/** Fallback only, used when the `special_events` table returns nothing. */
export const SPECIAL_EVENTS = [
  { id: FREE_FIRE_EVENT_ID, code: FREE_FIRE_EVENT_CODE, name: FREE_FIRE_EVENT_NAME, fee: 170 },
  { id: 'f1420ddb-a778-4cd7-a93e-0e5e984af5c4', code: 'GD', name: 'Group Dance', fee: 500 },
  {
    id: '3546a79b-ca1b-4d3b-8f04-bdd71b9bd9d9',
    code: 'TC',
    name: 'Thiruvizha Corner(Food Stall)',
    fee: 590,
  },
];

/** Case- and whitespace-insensitive comparison key. */
export const normaliseEventName = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Every string that identifies a catalogue event in the database: its code,
 * its official name and any recorded spelling variants.
 */
function eventIdentityKeys(event) {
  return [event.code, event.name, ...(event.dbAliases || [])]
    .filter(Boolean)
    .map(normaliseEventName);
}

/**
 * Resolve a catalogue event to the matching row from the `events` table.
 * Matches on code first, then on name / alias, so "Xcoders" still finds the
 * database row stored as "X Coders".
 */
export function resolveDatabaseEvent(catalogueEvent, dbEvents = []) {
  if (!catalogueEvent) return null;

  const code = normaliseEventName(catalogueEvent.code);
  const catalogueDay = normaliseEventName(catalogueEvent.day);
  const sameDayEvents = dbEvents.filter((db) => {
    const databaseDay = normaliseEventName(db?.day);
    return !databaseDay || !catalogueDay || databaseDay === catalogueDay || databaseDay === 'both' || databaseDay === 'all';
  });
  const byCode = sameDayEvents.find((db) => normaliseEventName(db?.code) === code);
  if (byCode) return byCode;

  const keys = eventIdentityKeys(catalogueEvent);
  const byName = (events) =>
    events.find((db) => {
      const dbName = normaliseEventName(db?.name);
      const dbCode = normaliseEventName(db?.code);
      return dbName ? keys.includes(dbName) : dbCode ? keys.includes(dbCode) : false;
    });

  return byName(sameDayEvents) || byName(dbEvents) || null;
}

/**
 * Count how many registration rows selected each catalogue event.
 *
 * A selection row is attributed to at most one catalogue event, so a
 * registration is never counted twice, and selections pointing at events that
 * are not part of the official line-up are ignored instead of being dumped
 * into the first slice.
 *
 * @param {Array} catalogueEvents Official line-up to attribute selections to.
 * @param {Array} selections    `selected_event_registrations` rows.
 * @param {Array} dbEvents      Rows from the `events` table, for id/code matching.
 * @returns {{ counts: Map<string, number>, total: number, attributed: number }}
 */
export function countSelectionsByEvent(catalogueEvents = [], selections = [], dbEvents = []) {
  const resolved = catalogueEvents.map((event) => {
    const dbEvent = resolveDatabaseEvent(event, dbEvents);
    return {
      event,
      dbEvent,
      keys: new Set([
        ...eventIdentityKeys(event),
        ...(dbEvent ? [normaliseEventName(dbEvent.id), normaliseEventName(dbEvent.code), normaliseEventName(dbEvent.name)] : []),
      ]),
    };
  });

  const counts = new Map(catalogueEvents.map((event) => [event.code, 0]));
  let total = 0;
  let attributed = 0;

  for (const selection of selections || []) {
    if (!selection) continue;

    const candidate = selection.events || selection.special_events || selection;
    const keys = [
      candidate?.id,
      candidate?.event_id,
      candidate?.code,
      candidate?.name,
    ]
      .filter(Boolean)
      .map(normaliseEventName);
    if (!keys.length) continue;

    const match = resolved.find((entry) => entry.keys.size && keys.some((key) => entry.keys.has(key)));
    if (!match) continue;

    counts.set(match.event.code, (counts.get(match.event.code) || 0) + 1);
    total += 1;
    attributed += 1;
  }

  return { counts, total, attributed };
}

/** Build chart segments (count + percentage + colour) for a catalogue slice. */
export function buildSegments(catalogueEvents = [], counts = new Map(), total = 0, colours = []) {
  const denominator = Number(total) || 0;

  return catalogueEvents.map((event, index) => {
    const count = counts.get(event.code) || 0;
    return {
      code: event.code,
      label: event.name,
      count,
      percentage: denominator > 0 ? Math.round((count / denominator) * 100) : 0,
      color: colours[index % colours.length] || '#38bdf8',
    };
  });
}

export function getTechEvents() {
  return DAY1_EVENTS;
}

export function getNonTechEvents() {
  return DAY2_EVENTS;
}

/** Day-level comparison segments for the combined chart. */
export function getDaySegments(counts = {}, total = 0, colours = []) {
  const rows = [
    { code: 'DAY_1', name: 'Day 1 · Technical', day: 'DAY_1' },
    { code: 'DAY_2', name: 'Day 2 · Non-Technical', day: 'DAY_2' },
  ];
  const denominator = Number(total) || 0;

  return rows.map((row, index) => ({
    code: row.code,
    label: row.name,
    count: counts[row.day] || 0,
    percentage: denominator > 0 ? Math.round(((counts[row.day] || 0) / denominator) * 100) : 0,
    color: colours[index % colours.length] || '#38bdf8',
  }));
}

/** Resolve the special-event list, falling back only when the table is empty. */
export function getSpecialEvents(specialEvents = []) {
  const source = specialEvents.length ? specialEvents : SPECIAL_EVENTS;

  const byCode = new Map();
  for (const event of source) {
    const code = String(event?.code ?? '').trim().toUpperCase();
    if (code && !byCode.has(code)) byCode.set(code, event);
  }

  return [...byCode.values()].map((event) => ({
    ...event,
    fee: Number(event?.fee ?? 0) || 0,
    status: event?.status || 'ACTIVE',
  }));
}

/** The Free Fire special-event row, whatever the table happens to call it. */
export function findFreeFireEvent(specialEvents = []) {
  const list = getSpecialEvents(specialEvents);
  return (
    list.find((event) => String(event?.code ?? '').trim().toUpperCase() === FREE_FIRE_EVENT_CODE) ||
    list.find((event) => normaliseEventName(event?.name).includes('free fire')) ||
    { id: FREE_FIRE_EVENT_ID, code: FREE_FIRE_EVENT_CODE, name: FREE_FIRE_EVENT_NAME, fee: 170 }
  );
}
