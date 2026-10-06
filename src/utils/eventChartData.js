export function getChartRegistrationSource({ allEventParticipants = [], participants = [], allDbEvents = [] }) {
  if (Array.isArray(allEventParticipants) && allEventParticipants.length > 0) {
    return allEventParticipants;
  }

  // A coordinator can read the event catalogue even when the global
  // registration query is blocked by row-level permissions. In that case the
  // assigned participant list is still valid chart data; returning an empty
  // list made production donuts render as zero despite visible registrations.
  return Array.isArray(participants) ? participants : [];
}
