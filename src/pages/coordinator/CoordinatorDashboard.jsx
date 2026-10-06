import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './CoordinatorDashboard.css';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useCoordinatorAssignedEvents from '../../hooks/useCoordinatorAssignedEvents';
import { getCoordinatorParticipants } from '../../services/coordinatorService';
import {
  getDashboardSummary,
  getDashboardRegistrations,
  getAdminSpecialEvents,
  getEvents,
} from '../../services/adminService';
import { applyRegistrationOverrides, subscribeToRealtimeUpdates } from '../../utils/statusStore';
import RegistrationsBarChart from '../../components/charts/RegistrationsBarChart';
import EventDonutChart from '../../components/charts/EventDonutChart';
import {
  buildRegistrationTrend,
  getRegistrationStatusCounts,
  getTrackCounts,
  percentageOf,
} from '../../utils/dashboardMetrics';
import {
  getNonTechEvents,
  countSelectionsByEvent,
  buildSegments,
} from '../../config/events';
import {
  Users,
  CheckCircle2,
  Hourglass,
  XCircle,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  QrCode,
  MapPin,
  Crosshair,
} from 'lucide-react';

export default function CoordinatorDashboard() {
  const { user, coordinatorProfile, getCoordinatorClientInstance } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [specialEvents, setSpecialEvents] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [chartView, setChartView] = useState('TECH_BREAKDOWN'); // 'TECH_BREAKDOWN' | 'NON_TECH_BREAKDOWN' | 'TOTAL_BREAKDOWN' | 'SPECIAL_BREAKDOWN'

  const client = getCoordinatorClientInstance();
  const navigate = useNavigate();
  const coordId = coordinatorProfile?.id || user?.id || null;

  // Assigned event context is shared with the command-deck header
  const {
    normalEvents: assignedEvents,
    specialEvents: assignedSpecialEvents,
    primaryEventName,
    eventsLoading,
    refreshEvents,
  } = useCoordinatorAssignedEvents(client, coordId, coordinatorProfile);

  const loadData = async () => {
    try {
      setRefreshing(true);

      const [sumData, specialData, registrationData, eventsData, { normalEvents, specialEvents: coordSpecialEvents }] = await Promise.all([
        getDashboardSummary().catch(() => null),
        getAdminSpecialEvents().catch(() => []),
        getDashboardRegistrations().catch(() => []),
        getEvents().catch(() => []),
        refreshEvents().catch(() => ({ normalEvents: [], specialEvents: [] })),
      ]);

      const partList = await getCoordinatorParticipants(client, normalEvents, coordSpecialEvents).catch(() => []);

      let resolvedRegistrations = Array.isArray(registrationData) && registrationData.length > 0 ? registrationData : [];

      if (!resolvedRegistrations.length) {
        try {
          const res = await fetch('/api/dashboard-registrations');
          if (res.ok) {
            const apiData = await res.json();
            if (Array.isArray(apiData) && apiData.length > 0) {
              resolvedRegistrations = applyRegistrationOverrides(apiData);
            }
          }
        } catch {
          // ignore
        }
      }

      if (!resolvedRegistrations.length) {
        try {
          const { data } = await client
            .from('registrations')
            .select(
              'id, registration_code, selected_day, status, created_at, payments(status), selected_event_registrations(event_id, events(id, code, name, day, event_type)), special_event_registrations(special_event_id, special_events(id, code, name))'
            )
            .order('created_at', { ascending: true });
          if (data && data.length > 0) {
            resolvedRegistrations = applyRegistrationOverrides(data);
          }
        } catch (err) {
          console.warn('Coordinator direct registrations fetch notice:', err);
        }
      }

      if (!resolvedRegistrations.length && partList.length > 0) {
        resolvedRegistrations = partList;
      }

      if (sumData) setSummary(sumData);
      setSpecialEvents(specialData || []);
      setAllEvents(eventsData && eventsData.length ? eventsData : []);
      setRegistrations(resolvedRegistrations);
      setParticipants(partList || []);
    } catch (err) {
      console.error('Could not load coordinator dashboard:', err);
      setParticipants([]);
      addToast(err.message || 'Could not load coordinator dashboard data.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToRealtimeUpdates(() => {
      loadData();
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const regSum = summary?.registrationSummary || summary?.registrations || {};
  const paySum = summary?.paymentSummary || summary?.payments || {};
  const statusCounts = getRegistrationStatusCounts(participants.length ? participants : registrations);
  const trackCounts = getTrackCounts(registrations.length ? registrations : participants);

  const totalCount = statusCounts.total;
  const verifiedCount = statusCounts.verified;
  const pendingCount = statusCounts.pending;
  const rejectedCount = statusCounts.rejected;

  const totalRegistrations = Number(regSum.total_registrations ?? statusCounts.total);

  // Each registration choice is a separate segment, so the donut is always
  // an accurate representation of database registrations (including BOTH and
  // SPECIAL registrations) without double-counting anyone.
  const countByCategory = registrations.reduce(
    (counts, regItem) => {
      const selectedDay = String(regItem?.selected_day || '').toUpperCase();
      const selectedEventRegs = regItem.selected_event_registrations || regItem.event_registrations || [];
      const specialRegs = regItem.special_event_registrations || [];

      const hasTech = selectedEventRegs.some((reg) => {
        const eventDay = String(reg?.events?.day || reg?.day || '').toUpperCase();
        return eventDay === 'DAY_1' || eventDay === 'BOTH' || eventDay === 'ALL';
      });

      const hasNonTech = selectedEventRegs.some((reg) => {
        const eventDay = String(reg?.events?.day || reg?.day || '').toUpperCase();
        return eventDay === 'DAY_2' || eventDay === 'BOTH' || eventDay === 'ALL';
      });

      if (selectedDay === 'DAY_1' || hasTech) counts.tech += 1;
      if (selectedDay === 'DAY_2' || hasNonTech) counts.nonTech += 1;
      if (selectedDay === 'BOTH' || selectedDay === 'ALL') counts.both += 1;
      if (selectedDay === 'SPECIAL' || specialRegs.length > 0) counts.special += 1;

      return counts;
    },
    { tech: 0, nonTech: 0, both: 0, special: 0 }
  );

  const day1TechCount = Math.max(Number(regSum.day_1_registrations || 0), countByCategory.tech);
  const day2NonTechCount = Math.max(Number(regSum.day_2_registrations || 0), countByCategory.nonTech);
  const bothDayCount = Math.max(Number(regSum.both_day_registrations || 0), countByCategory.both);
  const specialTracksCount = Math.max(Number(trackCounts.special || 0), countByCategory.special);

  // daySplitTotal = number of registrations that fall in at least one category bucket.
  // Using this (instead of totalRegistrations from the DB view) guarantees the donut
  // center always matches the sum of what is actually drawn on the arc.
  const daySplitTotal = registrations.filter((r) => {
    const selDay = String(r?.selected_day || '').toUpperCase();
    const evRegs = r.selected_event_registrations || r.event_registrations || [];
    const spRegs = r.special_event_registrations || [];
    return selDay || evRegs.length > 0 || spRegs.length > 0;
  }).length || totalRegistrations;

  // For the left-side bars ("Daily Registration Flow"), ONLY show registrations for the logged-in event
  const effectiveAssignedNormal = (assignedEvents && assignedEvents.length > 0)
    ? assignedEvents
    : (coordinatorProfile?.assigned_events && coordinatorProfile.assigned_events.length > 0
        ? coordinatorProfile.assigned_events
        : (coordinatorProfile?.event_name ? [{ name: coordinatorProfile.event_name, code: coordinatorProfile.event_code }] : []));
  const effectiveAssignedSpecial = assignedSpecialEvents || [];

  const loggedInEventRegistrations = (registrations || []).filter((reg) => {
    if (!effectiveAssignedNormal.length && !effectiveAssignedSpecial.length) return true;

    const evRegs = reg.selected_event_registrations || reg.event_registrations || [];
    const spRegs = reg.special_event_registrations || [];

    const matchesNormal = evRegs.some((er) => {
      const e = er.events || er;
      const eventId = String(er.event_id || e.id || '');
      const eventCode = String(e.code || '').toUpperCase();
      const eventName = String(e.name || '').toLowerCase();

      return effectiveAssignedNormal.some((ae) => {
        const aeId = String(ae.id || '');
        const aeCode = String(ae.code || '').toUpperCase();
        const aeName = String(ae.name || '').toLowerCase();
        return (aeId && aeId === eventId) || (aeCode && aeCode === eventCode) || (aeName && aeName === eventName);
      });
    });

    const matchesSpecial = spRegs.some((sr) => {
      const se = sr.special_events || sr;
      const spId = String(sr.special_event_id || se.id || '');
      const spCode = String(se.code || '').toUpperCase();
      const spName = String(se.name || '').toLowerCase();

      return effectiveAssignedSpecial.some((ase) => {
        const aseId = String(ase.id || '');
        const aseCode = String(ase.code || '').toUpperCase();
        const aseName = String(ase.name || '').toLowerCase();
        return (aseId && aseId === spId) || (aseCode && aseCode === spCode) || (aseName && aseName === spName);
      });
    });

    return matchesNormal || matchesSpecial;
  });

  const barChartRegistrations = (effectiveAssignedNormal.length || effectiveAssignedSpecial.length)
    ? (loggedInEventRegistrations.length > 0 ? loggedInEventRegistrations : participants)
    : (registrations.length ? registrations : participants);

  const registrationTrend = buildRegistrationTrend(barChartRegistrations);

  const canonicalDay1Events = [
    { id: 'PP', code: 'PP', name: 'Paper Presentation', day: 'DAY_1' },
    { id: 'UN', code: 'UN', name: 'Unsaid', day: 'DAY_1' },
    { id: 'CC', code: 'CC', name: 'Cipher Coding', day: 'DAY_1' },
    { id: 'WE', code: 'WE', name: 'Weblica', day: 'DAY_1' },
    { id: 'XC', code: 'XC', name: 'Xcoders', day: 'DAY_1' },
  ];

  const dedupeByCode = (items = []) => {
    const seen = new Map();
    items.forEach((event) => {
      const key = (event?.code || event?.id || event?.name || '').toString().trim().toUpperCase();
      if (!key || seen.has(key)) return;
      seen.set(key, {
        ...event,
        id: event?.id || key,
        code: event?.code || key,
        name: event?.name || key,
        day: event?.day || 'DAY_1',
      });
    });
    return [...seen.values()];
  };

  // Technical events list (Day 1) breakdown synced to the live app event catalog
  const systemTechEvents = dedupeByCode([
    ...allEvents,
    ...canonicalDay1Events,
  ]).filter((event) => event.day === 'DAY_1');
  const finalTechEvents = systemTechEvents.length ? systemTechEvents : canonicalDay1Events;

  const distinctColors = [
    '#00f0ff', // Electric Cyan
    '#f59e0b', // Amber Gold
    '#a855f7', // Neon Purple
    '#10b981', // Emerald Green
    '#ec4899', // Hot Pink
    '#3b82f6', // Royal Blue
    '#ff5722', // Radiant Red-Orange
    '#84cc16', // Electric Lime
  ];

  const normalizeEventValue = (value) => String(value ?? '').trim().toLowerCase();
  const eventCountKey = (event) => normalizeEventValue(event?.code || event?.id || event?.name);

  const locateEventMatch = (candidate, eventPool = finalTechEvents) => {
    if (!candidate) return null;
    const candidateKeys = [
      candidate?.id,
      candidate?.event_id,
      candidate?.code,
      candidate?.name,
      candidate?.events?.id,
      candidate?.events?.code,
      candidate?.events?.name,
      candidate?.event_name,
    ]
      .filter(Boolean)
      .map(normalizeEventValue);

    return eventPool.find((event) => {
      const eventKeys = [event?.id, event?.code, event?.name].filter(Boolean).map(normalizeEventValue);
      return eventKeys.some((key) => candidateKeys.includes(key));
    });
  };

  const eventCounts = new Map();
  finalTechEvents.forEach((ev) => eventCounts.set(eventCountKey(ev), 0));

  registrations.forEach((regItem) => {
    let matched = false;
    const selections = regItem.selected_event_registrations || regItem.event_registrations || [];
    selections.forEach((reg) => {
      if (reg?.active === false) return;
      const matchedEvent = locateEventMatch(reg.events || reg);
      if (matchedEvent) {
        const key = eventCountKey(matchedEvent);
        eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
        matched = true;
      }
    });

    if (!matched) {
      const day = regItem.event_day || regItem.registration_type || regItem.selected_day;
      if (day === 'DAY_1' || day === 'BOTH' || day === 'ALL') {
        const firstEv = finalTechEvents[0];
        if (firstEv) {
          const key = eventCountKey(firstEv);
          eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
        }
      }
    }
  });

  const totalTechRegistrations = Array.from(eventCounts.values()).reduce((a, b) => a + b, 0);

  const techSegments = finalTechEvents.map((ev, index) => {
    const count = eventCounts.get(eventCountKey(ev)) || 0;
    return {
      label: ev.name,
      count,
      percentage: percentageOf(count, totalTechRegistrations),
      color: distinctColors[index % distinctColors.length],
    };
  });

  // The display list is deliberately independent of legacy database rows.
  // Rows such as Football or a second Connections record may still exist in
  // the database, but may never become their own dashboard segment.
  const finalNonTechEvents = getNonTechEvents();
  const nonTechSelections = registrations.flatMap((registration) =>
    (registration.selected_event_registrations || registration.event_registrations || [])
      .filter((selection) => selection?.active !== false)
  );
  const { counts: nonTechCounts, total: totalNonTechRegistrations } = countSelectionsByEvent(
    finalNonTechEvents,
    nonTechSelections,
    allEvents
  );
  const nonTechSegments = buildSegments(
    finalNonTechEvents,
    nonTechCounts,
    totalNonTechRegistrations,
    distinctColors
  );

  const canonicalSpecialEvents = [
    { id: '3546a79b-ca1b-4d3b-8f04-bdd71b9bd9d9', code: 'TC', name: 'Thiruvizha Corner(Food Stall)', fee: 590 },
    { id: '01524e69-6f8d-42b7-933e-6f4121681402', code: 'EP', name: 'Esports(Free Fire)', fee: 170 },
    { id: 'f1420ddb-a778-4cd7-a93e-0e5e984af5c4', code: 'GD', name: 'Group Dance', fee: 500 },
  ];

  const allSpecialEventsCombined = dedupeByCode([
    ...(specialEvents || []),
    ...canonicalSpecialEvents,
  ]);

  const totalSegments = [
    { label: 'Tech Events', count: day1TechCount, percentage: percentageOf(day1TechCount, daySplitTotal), color: '#00f0ff' },
    { label: 'Non-Tech Events', count: day2NonTechCount, percentage: percentageOf(day2NonTechCount, daySplitTotal), color: '#f59e0b' },
    { label: 'Both Days', count: bothDayCount, percentage: percentageOf(bothDayCount, daySplitTotal), color: '#a855f7' },
    { label: 'Special Events', count: specialTracksCount, percentage: percentageOf(specialTracksCount, daySplitTotal), color: '#10b981' },
  ];

  const specialSegments = allSpecialEventsCombined.map((event, index) => {
    const matchingCount = registrations.filter((regItem) => (regItem.special_event_registrations || []).some((specialReg) => {
      const target = specialReg.special_events || specialReg;
      const targetStr = String(target?.id || target?.code || target?.name || '').toLowerCase();
      const eventStr = String(event.id || event.code || event.name || '').toLowerCase();
      return targetStr === eventStr || (event.code && targetStr.includes(event.code.toLowerCase()));
    })).length;

    return {
      label: event.name,
      count: matchingCount,
      percentage: percentageOf(matchingCount, Math.max(1, specialTracksCount || registrations.length)),
      color: distinctColors[index % distinctColors.length],
    };
  });

  const chartConfig = {
    TECH_BREAKDOWN: {
      title: 'Technical Events Distribution',
      subtitle: 'Breakdown of participants registered across technical competitions',
      segments: techSegments,
      totalCount: totalTechRegistrations,
      totalLabel: 'Total Tech',
    },
    NON_TECH_BREAKDOWN: {
      title: 'Non-Technical Events Distribution',
      subtitle: 'Breakdown of participants registered across non-technical events',
      segments: nonTechSegments,
      totalCount: totalNonTechRegistrations,
      totalLabel: 'Total Non-Tech',
    },
    TOTAL_BREAKDOWN: {
      title: 'Day Split & Event Mix',
      subtitle: 'Tech, Non-Tech, both-day and special-event comparison across the symposium',
      segments: totalSegments,
      totalCount: daySplitTotal,
      totalLabel: 'Total Reg',
    },
    SPECIAL_BREAKDOWN: {
      title: 'Special Events Distribution',
      subtitle: 'Breakdown of participants across premium workshops and special tracks',
      segments: specialSegments.length ? specialSegments : [{ label: 'No Special Event', count: 0, percentage: 0, color: '#10b981' }],
      totalCount: specialTracksCount,
      totalLabel: 'Total Special',
    },
  };

  const activeChart = chartConfig[chartView] || chartConfig.TECH_BREAKDOWN;

  if (loading || eventsLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-5">
          <div className="h-4 w-40 rounded-full bg-slate-700/80" />
          <div className="mt-3 h-8 w-72 rounded-lg bg-slate-700/80" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="h-10 w-28 rounded-xl bg-slate-700/80" />
            <div className="h-4 w-52 rounded-lg bg-slate-700/60" />
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-11 w-56 rounded-xl bg-slate-700/70" />
            <div className="h-11 w-11 rounded-xl bg-slate-700/70" />
          </div>
        </div>

        <div className="cs-stat-grid">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <div className="h-12 w-12 rounded-2xl bg-slate-700/70" />
              <div className="mt-5 h-12 w-24 rounded-xl bg-slate-700/70" />
              <div className="mt-3 h-5 w-28 rounded-lg bg-slate-700/60" />
            </div>
          ))}
        </div>

        <div className="cs-chart-grid">
          <div className="cs-span-7 h-[360px] rounded-2xl border border-white/10 bg-slate-900/60" />
          <div className="cs-span-5 h-[360px] rounded-2xl border border-white/10 bg-slate-900/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Prominent Assigned Event Banner (Step 7 requirement) */}
      <div className="cs-event-banner">
        <div className="flex items-center gap-3.5">
          <div className="cs-event-banner-badge">
            <Crosshair className="w-5 h-5 text-[#00f0ff]" />
          </div>
          <div>
            <div className="text-[11px] font-mono font-bold uppercase tracking-[0.16em] text-[#00f0ff]">
              ASSIGNED EVENT CONSOLE
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-heading text-white tracking-tight">
              {eventsLoading ? 'SYNCING SCOPE...' : (primaryEventName || 'ALL SYMPOSIUM TRACKS')}
            </h2>
          </div>
        </div>
        {assignedEvents.length > 1 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-semibold">
            +{assignedEvents.length - 1} additional event{assignedEvents.length > 2 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Page Header: title (left), date + refresh (right) */}
      <div className="cs-page-head">
        <div>
          <h1 className="cs-page-title">Dashboard</h1>
          <p className="cs-page-subtitle">Overview of registrations and event management</p>
        </div>

        {/* Date Range Picker Pill + Refresh */}
        <div className="flex items-center gap-2.5">
          <div className="cs-date-pill">
            <Calendar className="w-4 h-4 text-brand-purple" />
            <span>Sep 01, 2026 - Sep 30, 2026</span>
          </div>

          <button onClick={loadData} disabled={refreshing} className="cs-icon-button" title="Refresh Metrics">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4 Stat Cards — equal width, equal height, shared grid boundaries */}
      <div className="cs-stat-grid">
        {/* Total Registrations */}
        <Link to="/coordinator/participants" className="cyber-card-purple cs-stat-card group">
          <div className="cs-stat-icon is-purple">
            <Users className="w-6 h-6" />
          </div>
          <div style={{ marginTop: '18px' }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="cs-stat-value">{totalCount.toLocaleString()}</span>
              <span className="cs-stat-delta is-up">
                +12%
              </span>
            </div>
            <div className="cs-stat-label">Total Registrations</div>
          </div>
        </Link>

        {/* Verified */}
        <Link to="/coordinator/participants" className="cyber-card-emerald cs-stat-card group">
          <div className="cs-stat-icon is-emerald">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div style={{ marginTop: '18px' }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="cs-stat-value">{verifiedCount.toLocaleString()}</span>
              <span className="cs-stat-delta is-up">
                +8%
              </span>
            </div>
            <div className="cs-stat-label">Verified</div>
          </div>
        </Link>

        {/* Pending */}
        <Link to="/coordinator/payments" className="cyber-card-amber cs-stat-card group">
          <div className="cs-stat-icon is-amber">
            <Hourglass className="w-6 h-6" />
          </div>
          <div style={{ marginTop: '18px' }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="cs-stat-value">{pendingCount.toLocaleString()}</span>
              <span className="cs-stat-delta is-down">
                -4%
              </span>
            </div>
            <div className="cs-stat-label">Pending</div>
          </div>
        </Link>

        {/* Rejected */}
        <Link to="/coordinator/payments" className="cyber-card-pink cs-stat-card group">
          <div className="cs-stat-icon is-pink">
            <XCircle className="w-6 h-6" />
          </div>
          <div style={{ marginTop: '18px' }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="cs-stat-value">{rejectedCount.toLocaleString()}</span>
              <span className="cs-stat-delta is-down">
                -2%
              </span>
            </div>
            <div className="cs-stat-label">Rejected</div>
          </div>
        </Link>
      </div>

      {/* Main Charts Row aligned to the same grid as the stat cards */}
      <div className="cs-chart-grid">
        {/* Left: Registrations Overview Bar Chart */}
        <div className="cs-span-7 cyber-chart-card flex flex-col justify-between">
          <RegistrationsBarChart
            data={registrationTrend}
            onBarClick={() => navigate('/coordinator/participants')}
          />
        </div>

        {/* Right: Registrations by Event Donut Chart with View Toggle */}
        <div className="cs-span-5 cyber-chart-card flex flex-col justify-between">
          <EventDonutChart
            title={activeChart.title}
            subtitle={activeChart.subtitle}
            totalCount={activeChart.totalCount}
            totalLabel={activeChart.totalLabel}
            segments={activeChart.segments}
            rightElement={
              <div className="inline-flex flex-wrap items-center gap-1.5 p-1 bg-[#131024] border border-[#2e2652] rounded-xl text-xs shadow-sm">
                <button
                  type="button"
                  onClick={() => setChartView('TECH_BREAKDOWN')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    chartView === 'TECH_BREAKDOWN'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.45)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tech
                </button>
                <button
                  type="button"
                  onClick={() => setChartView('NON_TECH_BREAKDOWN')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    chartView === 'NON_TECH_BREAKDOWN'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.45)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Non-Tech
                </button>
                <button
                  type="button"
                  onClick={() => setChartView('TOTAL_BREAKDOWN')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    chartView === 'TOTAL_BREAKDOWN'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.45)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Day Split
                </button>
                <button
                  type="button"
                  onClick={() => setChartView('SPECIAL_BREAKDOWN')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    chartView === 'SPECIAL_BREAKDOWN'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.45)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Special
                </button>
              </div>
            }
          />
        </div>
      </div>

      {/* Assigned Events Roster Cards */}
      <div className="cyber-chart-card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xl sm:text-2xl font-black font-heading text-white flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-brand-cyan" />
              Your Assigned Event Responsibilities
            </h3>
            <p className="text-sm sm:text-base text-slate-300 mt-1 font-medium">
              {primaryEventName
                ? `Verification and attendance authority for ${primaryEventName}.`
                : 'Event tracks where your coordinator credentials have verification and attendance authority.'}
            </p>
          </div>

          <Link
            to="/coordinator/attendance"
            className="btn-primary text-sm font-bold py-2.5 px-5 flex items-center gap-2 self-start sm:self-auto"
          >
            <QrCode className="w-4 h-4" />
            <span>Open Event Scanner</span>
          </Link>
        </div>

        {loading || eventsLoading ? (
          <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-brand-cyan" />
            <span className="text-sm font-medium">Loading assigned tracks...</span>
          </div>
        ) : assignedEvents.length === 0 && assignedSpecialEvents.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm font-medium">
            No events are currently assigned to your coordinator profile. Please contact an administrator.
          </div>
        ) : (
          <div className="cs-roster-grid">
            {assignedEvents.map((evt) => (
              <div
                key={evt.id}
                className="p-5 rounded-2xl bg-white/[0.03] border border-violet-500/25 hover:border-brand-cyan/50 transition-all space-y-3.5 shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="badge-outline text-xs text-brand-cyan border-brand-cyan/40 font-mono font-bold px-2 py-0.5">
                      {evt.code}
                    </span>
                    <h4 className="text-base sm:text-lg font-bold text-white mt-1.5">
                      {evt.name}
                    </h4>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-slate-300 font-mono">
                    {evt.day}
                  </span>
                </div>

                <div className="text-sm text-slate-300 space-y-1.5 font-medium">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span>Venue: {evt.venue || 'Main Auditorium'}</span>
                  </div>
                  <div>
                    Track Type: <span className="text-white capitalize font-semibold">{evt.event_type?.toLowerCase() || 'Technical'}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-violet-500/20 flex items-center justify-between text-sm font-bold">
                  <Link
                    to="/coordinator/participants"
                    className="text-brand-cyan hover:underline flex items-center gap-1.5"
                  >
                    <span>View Roster</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <Link
                    to="/coordinator/attendance"
                    className="text-brand-purple hover:underline flex items-center gap-1.5"
                  >
                    <span>Scan In</span>
                  </Link>
                </div>
              </div>
            ))}

            {assignedSpecialEvents.map((sp) => (
              <div
                key={sp.id}
                className="p-4 rounded-xl bg-brand-purple/[0.04] border border-brand-purple/20 hover:border-brand-purple/40 transition-all space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="badge-outline text-[10px] text-brand-purple border-brand-purple/30 font-mono">
                      [Special] {sp.code}
                    </span>
                    <h4 className="text-sm font-bold text-white mt-1">
                      {sp.name}
                    </h4>
                  </div>
                </div>

                <div className="text-xs text-slate-400">
                  Fee: <span className="font-mono text-emerald-400 font-semibold">₹{sp.fee || 0}</span>
                </div>

                <div className="pt-2 border-t border-violet-500/20 flex items-center justify-between text-xs">
                  <Link
                    to="/coordinator/participants"
                    className="text-brand-cyan hover:underline flex items-center gap-1"
                  >
                    <span>View Roster</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
