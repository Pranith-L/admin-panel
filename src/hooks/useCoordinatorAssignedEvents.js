import { useCallback, useEffect, useRef, useState } from 'react';
import { getCoordinatorAssignedEvents } from '../services/coordinatorService';

const CACHE_TTL_MS = 15000;
const cache = new Map();

/**
 * Single source of truth for the authenticated coordinator's assigned events.
 * Used by the command-deck header (assigned event title) and by the dashboard
 * roster / statistics so both always reflect the same coordinator scope.
 */
export default function useCoordinatorAssignedEvents(client, coordinatorId) {
  const clientRef = useRef(client);
  clientRef.current = client;

  const cachedEntry = coordinatorId ? cache.get(coordinatorId) : null;

  const [normalEvents, setNormalEvents] = useState(cachedEntry ? cachedEntry.normalEvents : []);
  const [specialEvents, setSpecialEvents] = useState(cachedEntry ? cachedEntry.specialEvents : []);
  const [eventsLoading, setEventsLoading] = useState(!cachedEntry);

  const load = useCallback(
    async (force = false) => {
      if (!coordinatorId) {
        setNormalEvents([]);
        setSpecialEvents([]);
        setEventsLoading(false);
        return { normalEvents: [], specialEvents: [] };
      }

      const cached = cache.get(coordinatorId);
      if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
        setNormalEvents(cached.normalEvents);
        setSpecialEvents(cached.specialEvents);
        setEventsLoading(false);
        return { normalEvents: cached.normalEvents, specialEvents: cached.specialEvents };
      }

      setEventsLoading(true);
      try {
        const result = await getCoordinatorAssignedEvents(clientRef.current, coordinatorId);
        const nextNormal = result.normalEvents || [];
        const nextSpecial = result.specialEvents || [];
        cache.set(coordinatorId, { at: Date.now(), normalEvents: nextNormal, specialEvents: nextSpecial });
        setNormalEvents(nextNormal);
        setSpecialEvents(nextSpecial);
        return { normalEvents: nextNormal, specialEvents: nextSpecial };
      } catch (err) {
        console.warn('Could not load assigned coordinator events:', err);
        const fallback = cache.get(coordinatorId);
        const safeNormal = fallback ? fallback.normalEvents : [];
        const safeSpecial = fallback ? fallback.specialEvents : [];
        setNormalEvents(safeNormal);
        setSpecialEvents(safeSpecial);
        return { normalEvents: safeNormal, specialEvents: safeSpecial };
      } finally {
        setEventsLoading(false);
      }
    },
    [coordinatorId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const refreshEvents = useCallback(() => load(true), [load]);

  const assignedEvents = [...normalEvents, ...specialEvents];
  const primaryEvent = assignedEvents[0] || null;

  return {
    normalEvents,
    specialEvents,
    assignedEvents,
    primaryEvent,
    primaryEventName: primaryEvent?.name || '',
    eventsLoading,
    refreshEvents,
  };
}
