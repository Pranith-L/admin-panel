import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AdminDashboard.css';
import { useToast } from '../../context/ToastContext';
import {
  getDashboardSummary,
  getDashboardRegistrations,
  getAdminRegistrationFees,
  updateAdminRegistrationFee,
  getAdminSpecialEvents,
  createAdminSpecialEvent,
  updateAdminSpecialEventFee,
  getEvents,
} from '../../services/adminService';
import { subscribeToRealtimeUpdates } from '../../utils/statusStore';
import RegistrationsBarChart from '../../components/charts/RegistrationsBarChart';
import EventDonutChart from '../../components/charts/EventDonutChart';
import {
  buildRegistrationTrend,
  getRegistrationStatusCounts,
  getTrackCounts,
  percentageOf,
} from '../../utils/dashboardMetrics';
import { formatCurrency } from '../../utils/helpers';
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
  Save,
  Plus,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';

export default function AdminDashboard() {
  const { addToast } = useToast();

  const [summary, setSummary] = useState(null);
  const [fees, setFees] = useState({ DAY_1: 0, DAY_2: 0 });
  const [specialEvents, setSpecialEvents] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartView, setChartView] = useState('TECH_BREAKDOWN'); // 'TECH_BREAKDOWN' | 'NON_TECH_BREAKDOWN' | 'TOTAL_BREAKDOWN' | 'SPECIAL_BREAKDOWN'

  // New special event state
  const [newEventCode, setNewEventCode] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [newEventFee, setNewEventFee] = useState('');
  const [isSavingFee, setIsSavingFee] = useState(false);

  async function loadData() {
    setIsLoading(true);
    try {
      const [sumData, feeData, specialData, registrationData, eventsData] = await Promise.all([
        getDashboardSummary().catch(() => null),
        getAdminRegistrationFees().catch(() => ({ DAY_1: 0, DAY_2: 0 })),
        getAdminSpecialEvents().catch(() => []),
        getDashboardRegistrations(),
        getEvents().catch(() => []),
      ]);

      if (sumData) setSummary(sumData);
      setFees(feeData);
      setSpecialEvents(specialData);
      setRegistrations(registrationData);
      if (eventsData) setAllEvents(eventsData);
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to load dashboard metrics.', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToRealtimeUpdates(() => {
      loadData();
    });
    return () => unsubscribe();
  }, []);

  async function handleSaveFees(e) {
    e.preventDefault();
    setIsSavingFee(true);
    try {
      await Promise.all([
        updateAdminRegistrationFee('DAY_1', fees.DAY_1),
        updateAdminRegistrationFee('DAY_2', fees.DAY_2),
      ]);
      addToast('Registration fees updated successfully.', 'success');
    } catch (err) {
      addToast(err.message || 'Fee update failed', 'error');
    } finally {
      setIsSavingFee(false);
    }
  }

  async function handleAddSpecialEvent(e) {
    e.preventDefault();
    if (!newEventCode.trim() || !newEventName.trim()) return;

    try {
      await createAdminSpecialEvent(newEventCode, newEventName, newEventFee);
      addToast(`Created ${newEventCode} successfully.`, 'success');
      setNewEventCode('');
      setNewEventName('');
      setNewEventFee('');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to create special event', 'error');
    }
  }

  async function handleUpdateSpecialFee(id, fee) {
    try {
      await updateAdminSpecialEventFee(id, fee);
      addToast('Special event fee updated.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to update special fee', 'error');
    }
  }

  // Values are derived from the same registration rows that feed the charts.
  // The database view is retained as a lightweight primary source for the
  // cards, while the row aggregation is a truthful fallback if that view has
  // not been deployed yet.
  const regSum = summary?.registrationSummary || summary?.registrations || {};
  const paySum = summary?.paymentSummary || summary?.payments || {};
  const statusCounts = getRegistrationStatusCounts(registrations);
  const trackCounts = getTrackCounts(registrations);

  const totalRegistrations = Number(regSum.total_registrations ?? statusCounts.total);
  const verifiedCount = Number(regSum.confirmed_registrations ?? statusCounts.verified);
  const pendingCount = Number(regSum.payment_pending ?? statusCounts.pending);
  const rejectedCount = Number(paySum.rejected_payments ?? statusCounts.rejected);

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

  const registrationTrend = buildRegistrationTrend(registrations);

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

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="h-4 w-28 rounded-full bg-slate-700/70" />
            <div className="h-10 w-44 rounded-xl bg-slate-700/80" />
            <div className="h-4 w-64 rounded-lg bg-slate-700/60" />
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-11 w-56 rounded-xl bg-slate-700/70" />
            <div className="h-11 w-11 rounded-xl bg-slate-700/70" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
              <div className="h-12 w-12 rounded-2xl bg-slate-700/70" />
              <div className="mt-6 h-12 w-28 rounded-xl bg-slate-700/70" />
              <div className="mt-3 h-5 w-32 rounded-lg bg-slate-700/60" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-[360px] rounded-2xl border border-white/10 bg-slate-900/60" />
          <div className="lg:col-span-5 h-[360px] rounded-2xl border border-white/10 bg-slate-900/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Header Matching Mockup */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold uppercase tracking-wider mb-2 shadow-[0_0_12px_rgba(0,240,255,0.2)]">
            <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-pulse"></span>
            CYBERSENTINEL 2K26 NATIONAL SYMPOSIUM
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black font-heading text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm sm:text-base text-slate-300 mt-1.5 font-semibold">
            Overview of registrations and event management
          </p>
        </div>

        {/* Date Range Picker Pill Matching Mockup */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#0c102a] border border-violet-500/35 text-sm font-mono font-bold text-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-brand-purple" />
            <span>Sep 01, 2026 - Sep 30, 2026</span>
          </div>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-[#0c102a] border border-violet-500/35 text-slate-300 hover:text-white transition-colors"
            title="Refresh Metrics"
            style={{ background: '#0c102a' }}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4 Stat Cards Matching Mockup with Ultra-Legible Typography */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Registrations */}
        <Link to="/admin/registrations" className="cyber-card-purple block group transition-all p-5 sm:p-6 rounded-2xl">
          <div className="w-13 h-13 p-3 rounded-2xl bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-purple-300 shadow-[0_0_18px_rgba(168,85,247,0.3)] group-hover:scale-105 transition-transform inline-flex">
            <Users className="w-6 h-6" />
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-4xl sm:text-5xl lg:text-6xl font-black font-heading text-white tracking-tight leading-none">
                {totalRegistrations.toLocaleString()}
              </span>
              <span className="inline-flex items-center text-xs sm:text-sm font-black text-emerald-400 font-mono px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40">
                +12%
              </span>
            </div>
            <div className="text-base sm:text-lg text-slate-200 mt-3 font-extrabold group-hover:text-white transition-colors">
              Total Registrations
            </div>
          </div>
        </Link>

        {/* Verified */}
        <Link to="/admin/registrations" className="cyber-card-emerald block group transition-all p-5 sm:p-6 rounded-2xl">
          <div className="w-13 h-13 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.3)] group-hover:scale-105 transition-transform inline-flex">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-4xl sm:text-5xl lg:text-6xl font-black font-heading text-white tracking-tight leading-none">
                {verifiedCount.toLocaleString()}
              </span>
              <span className="inline-flex items-center text-xs sm:text-sm font-black text-emerald-400 font-mono px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40">
                +8%
              </span>
            </div>
            <div className="text-base sm:text-lg text-slate-200 mt-3 font-extrabold group-hover:text-white transition-colors">
              Verified
            </div>
          </div>
        </Link>

        {/* Pending */}
        <Link to="/admin/payments" className="cyber-card-amber block group transition-all p-5 sm:p-6 rounded-2xl">
          <div className="w-13 h-13 p-3 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.3)] group-hover:scale-105 transition-transform inline-flex">
            <Hourglass className="w-6 h-6" />
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-4xl sm:text-5xl lg:text-6xl font-black font-heading text-white tracking-tight leading-none">
                {pendingCount.toLocaleString()}
              </span>
              <span className="inline-flex items-center text-xs sm:text-sm font-black text-rose-400 font-mono px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40">
                -4%
              </span>
            </div>
            <div className="text-base sm:text-lg text-slate-200 mt-3 font-extrabold group-hover:text-white transition-colors">
              Pending
            </div>
          </div>
        </Link>

        {/* Rejected */}
        <Link to="/admin/payments" className="cyber-card-pink block group transition-all p-5 sm:p-6 rounded-2xl">
          <div className="w-13 h-13 p-3 rounded-2xl bg-pink-500/20 border border-pink-500/50 flex items-center justify-center text-pink-300 shadow-[0_0_18px_rgba(236,72,153,0.3)] group-hover:scale-105 transition-transform inline-flex">
            <XCircle className="w-6 h-6" />
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-4xl sm:text-5xl lg:text-6xl font-black font-heading text-white tracking-tight leading-none">
                {rejectedCount.toLocaleString()}
              </span>
              <span className="inline-flex items-center text-xs sm:text-sm font-black text-rose-400 font-mono px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40">
                -2%
              </span>
            </div>
            <div className="text-base sm:text-lg text-slate-200 mt-3 font-extrabold group-hover:text-white transition-colors">
              Rejected
            </div>
          </div>
        </Link>
      </div>

      {/* Main Charts Row Matching Mockup */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Registrations Overview (Bar Chart) */}
        <div className="lg:col-span-7 cyber-chart-card flex flex-col justify-between">
          <RegistrationsBarChart data={registrationTrend} />
        </div>

        {/* Right: Registrations by Event (Donut Chart) */}
        <div className="lg:col-span-5 cyber-chart-card flex flex-col justify-between">
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

      {/* Management Cards (Registration Fees & Special Events) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Base Registration Fees */}
        <div className="cyber-chart-card space-y-5">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold font-heading text-white">
              Registration Base Fees
            </h3>
            <p className="text-sm sm:text-base text-slate-300 mt-1 font-medium">
              Set official symposium entry fee amounts for Day 1 and Day 2 participants.
            </p>
          </div>

          <form onSubmit={handleSaveFees} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Day 1 Fee (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={fees.DAY_1}
                  onChange={(e) => setFees({ ...fees, DAY_1: Number(e.target.value) })}
                  className="cyber-input w-full text-base font-mono py-2.5 px-3.5"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Day 2 Fee (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={fees.DAY_2}
                  onChange={(e) => setFees({ ...fees, DAY_2: Number(e.target.value) })}
                  className="cyber-input w-full text-base font-mono py-2.5 px-3.5"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingFee}
                className="btn-primary text-sm font-bold py-2.5 px-6 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingFee ? 'Saving...' : 'Save Base Fees'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Special Events Catalog */}
        <div className="cyber-chart-card space-y-5">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold font-heading text-white">
              Special Events & Workshops
            </h3>
            <p className="text-sm sm:text-base text-slate-300 mt-1 font-medium">
              Configure add-on masterclasses and premium gaming tracks with standalone fees.
            </p>
          </div>

          {/* Quick Add Form */}
          <form onSubmit={handleAddSpecialEvent} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <input
              type="text"
              required
              placeholder="Code (e.g. AI-LAB)"
              value={newEventCode}
              onChange={(e) => setNewEventCode(e.target.value)}
              className="cyber-input text-sm py-2 px-3 font-mono"
            />
            <input
              type="text"
              required
              placeholder="Title"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              className="cyber-input text-sm py-2 px-3 font-semibold"
            />
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                placeholder="₹ Fee"
                value={newEventFee}
                onChange={(e) => setNewEventFee(e.target.value)}
                className="cyber-input text-sm font-mono py-2 px-3 w-24"
              />
              <button
                type="submit"
                className="btn-secondary text-sm px-4 flex items-center justify-center shrink-0 text-brand-cyan font-bold"
                title="Add Special Track"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Special Events List */}
          <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
            {specialEvents.length > 0 ? (
              specialEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-violet-500/25 text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-brand-cyan font-bold text-xs bg-brand-cyan/15 border border-brand-cyan/40 px-2 py-0.5 rounded-md">
                      {evt.code}
                    </span>
                    <span className="text-slate-100 font-bold">{evt.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-emerald-400 text-sm">
                      {formatCurrency(evt.fee || 0)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-slate-400 text-sm font-medium">
                No special events created yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
