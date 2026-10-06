import { useCallback, useEffect, useRef, useState } from 'react';
import { getCoordinatorAssignedEvents } from '../services/coordinatorService';

const CACHE_TTL_MS = 15000;
const cache = new Map();

/**
 * Single source of truth for the authenticated coordinator's assigned events.
 * Used by the command-deck header (assigned event title) and by the dashboard
 * roster / statistics so both always reflect the same coordinator scope.
 */
export default function useCoordinatorAssignedEvents(client, coordinatorId, coordinatorProfile = null) {
  const clientRef = useRef(client);
  clientRef.current = client;

  const cacheKey = coordinatorProfile?.email || coordinatorId || null;
  const cachedEntry = cacheKey ? cache.get(cacheKey) : null;

  const [normalEvents, setNormalEvents] = useState(cachedEntry ? cachedEntry.normalEvents : []);
  const [specialEvents, setSpecialEvents] = useState(cachedEntry ? cachedEntry.specialEvents : []);
  const [eventsLoading, setEventsLoading] = useState(!cachedEntry);

  const load = useCallback(
    async (force = false) => {
      if (!coordinatorId && !coordinatorProfile) {
        setNormalEvents([]);
        setSpecialEvents([]);
        setEventsLoading(false);
        return { normalEvents: [], specialEvents: [] };
      }

      const key = coordinatorProfile?.email || coordinatorId;
      const cached = cache.get(key);
      if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
        setNormalEvents(cached.normalEvents);
        setSpecialEvents(cached.specialEvents);
        setEventsLoading(false);
        return { normalEvents: cached.normalEvents, specialEvents: cached.specialEvents };
      }

      setEventsLoading(true);
      try {
        const result = await getCoordinatorAssignedEvents(clientRef.current, coordinatorId, coordinatorProfile);
        const nextNormal = result.normalEvents || [];
        const nextSpecial = result.specialEvents || [];
        cache.set(key, { at: Date.now(), normalEvents: nextNormal, specialEvents: nextSpecial });
        setNormalEvents(nextNormal);
        setSpecialEvents(nextSpecial);
        return { normalEvents: nextNormal, specialEvents: nextSpecial };
      } catch (err) {
        console.warn('Could not load assigned coordinator events:', err);
        const fallback = cache.get(key);
        const safeNormal = fallback ? fallback.normalEvents : [];
        const safeSpecial = fallback ? fallback.specialEvents : [];
        setNormalEvents(safeNormal);
        setSpecialEvents(safeSpecial);
        return { normalEvents: safeNormal, specialEvents: safeSpecial };
      } finally {
        setEventsLoading(false);
      }
    },
    [coordinatorId, coordinatorProfile]
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
