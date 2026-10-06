import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getCoordinatorAssignedEvents,
  getCoordinatorPayments,
} from '../../services/coordinatorService';
import { subscribeToRealtimeUpdates } from '../../utils/statusStore';
import DetailsModal from '../../components/common/DetailsModal';
import { formatCurrency, formatDate, buildPaymentConfirmationGmailLink, buildPendingPaymentGmailLink } from '../../utils/helpers';
import {
  CreditCard,
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Layers,
  Mail,
} from 'lucide-react';

export default function CoordinatorPayments() {
  const { user, coordinatorProfile, getCoordinatorClientInstance } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState([]);
  const [assignedEvents, setAssignedEvents] = useState([]);
  const [assignedSpecialEvents, setAssignedSpecialEvents] = useState([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [eventFilter, setEventFilter] = useState('ALL');

  const [selectedDetails, setSelectedDetails] = useState(null);

  const client = getCoordinatorClientInstance();

  const loadData = async () => {
    try {
      setRefreshing(true);
      const coordId = coordinatorProfile?.id || user?.id || null;
      let normalEvents = [];
      let specialEvents = [];

      if (coordId) {
        try {
          const eventsData = await getCoordinatorAssignedEvents(client, coordId);
          normalEvents = eventsData.normalEvents || [];
          specialEvents = eventsData.specialEvents || [];
        } catch (evErr) {
          console.warn('Coordinator payments events error:', evErr);
        }
      }

      setAssignedEvents(normalEvents);
      setAssignedSpecialEvents(specialEvents);

      const list = await getCoordinatorPayments(client, normalEvents, specialEvents).catch(() => []);
      setPayments(list || []);
    } catch (err) {
      console.warn('Coordinator payments error:', err);
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
  }, []);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const q = search.trim().toLowerCase();
      const transactionId = (p.transaction_id || p.utr || '').toLowerCase();
      const code = (p.registrations?.registration_code || '').toLowerCase();
      const name = (p.registrations?.participants?.name || '').toLowerCase();
      const email = (p.registrations?.participants?.email || '').toLowerCase();

      const matchesSearch = !q || transactionId.includes(q) || code.includes(q) || name.includes(q) || email.includes(q);
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;

      let matchesEvent = true;
      if (eventFilter !== 'ALL') {
        if (eventFilter.startsWith('SPECIAL:')) {
          const specId = eventFilter.replace('SPECIAL:', '');
          const hasSpec = (p.registrations?.special_event_registrations || []).some(
            (s) => s.special_events?.id === specId
          );
          matchesEvent = hasSpec;
        } else {
          const normalMatch = assignedEvents.find((e) => e.id === eventFilter);
          if (normalMatch) {
            const day = p.registrations?.selected_day;
            matchesEvent = day === 'BOTH' || day === normalMatch.day;
          }
        }
      }

      return matchesSearch && matchesStatus && matchesEvent;
    });
  }, [payments, search, statusFilter, eventFilter, assignedEvents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-brand-cyan" />
            Assigned Payments
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Review payment status and track completed transactions as they update automatically.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={refreshing}
          className="btn-secondary self-start sm:self-auto flex items-center gap-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters Toolbar with Enlarged, Prominent Input Boxes */}
      <div className="glass-card p-6 space-y-4 shadow-xl border border-violet-500/30">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Search */}
          <div className="relative">
            <Search className="w-6 h-6 text-[#00f0ff] absolute left-4.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by CS-ID, transaction ID, name, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="cyber-input pl-14 font-semibold w-full shadow-md"
              style={{ minHeight: '58px' }}
            />
          </div>

          {/* Status */}
          <div className="relative">
            <Filter className="w-6 h-6 text-[#00f0ff] absolute left-4.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="cyber-input pl-14 font-semibold w-full shadow-md cursor-pointer"
              style={{ minHeight: '58px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_VERIFICATION">Pending Verification</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Event Filter */}
          <div className="relative">
            <Layers className="w-6 h-6 text-[#00f0ff] absolute left-4.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="cyber-input pl-14 font-semibold w-full shadow-md cursor-pointer"
              style={{ minHeight: '58px' }}
            >
              <option value="ALL">All Assigned Events</option>
              {assignedEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.code} - {ev.name} ({ev.day})
                </option>
              ))}
              {assignedSpecialEvents.map((sp) => (
                <option key={sp.id} value={`SPECIAL:${sp.id}`}>
                  [Special] {sp.code} - {sp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-base font-bold text-slate-200 pt-1 px-1">
          <span>Showing {filtered.length} of {payments.length} assigned payments</span>
          {(search || statusFilter !== 'ALL' || eventFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
                setEventFilter('ALL');
              }}
              className="text-[#00f0ff] hover:underline font-extrabold text-base"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Payments Table with Bold, High-Legibility Data Rows */}
      <div className="glass-card overflow-hidden shadow-2xl border border-violet-500/30">
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-brand-cyan" />
            <span className="text-lg font-bold">Loading payments...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50 text-brand-cyan" />
            <p className="text-lg font-semibold">No payments found matching the criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="cyber-table">
              <thead>
                <tr>
                  <th className="py-5 px-6 text-sm sm:text-base font-black text-slate-100 tracking-wider uppercase">CS ID</th>
                  <th className="py-5 px-6 text-sm sm:text-base font-black text-slate-100 tracking-wider uppercase">Participant</th>
                  <th className="py-5 px-6 text-sm sm:text-base font-black text-slate-100 tracking-wider uppercase">Amount</th>
                  <th className="py-5 px-6 text-sm sm:text-base font-black text-slate-100 tracking-wider uppercase">Transaction ID</th>
                  <th className="py-5 px-6 text-sm sm:text-base font-black text-slate-100 tracking-wider uppercase">Status</th>
                  <th className="py-5 px-6 text-sm sm:text-base font-black text-slate-100 tracking-wider uppercase">Submitted</th>
                  <th className="py-5 px-6 text-sm sm:text-base font-black text-slate-100 tracking-wider uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((payment) => {
                  const reg = payment.registrations || {};
                  const part = reg.participants || {};
                  return (
                    <tr key={`${payment.registration_id}-${payment.submitted_at}`} className="hover:bg-white/[0.05] transition-colors">
                      <td className="py-5 px-6 font-mono font-black text-lg sm:text-xl text-[#00f0ff] whitespace-nowrap">
                        {reg.registration_code || '—'}
                      </td>
                      <td className="py-5 px-6">
                        <div className="font-black text-lg sm:text-xl text-white tracking-wide">{part.name || 'Unnamed'}</div>
                        <div className="text-sm sm:text-base font-semibold text-slate-300 mt-1">{part.email || '—'}</div>
                      </td>
                      <td className="py-5 px-6 font-mono font-black text-xl sm:text-2xl text-emerald-400 whitespace-nowrap">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="py-5 px-6 font-mono font-extrabold text-base sm:text-lg text-slate-100 select-all">
                        {payment.transaction_id || payment.utr || '—'}
                      </td>
                      <td className="py-5 px-6">
                        {payment.status === 'VERIFIED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                            <CheckCircle className="w-4 h-4" /> Completed
                          </span>
                        ) : payment.status === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/40">
                            <XCircle className="w-4 h-4" /> Not Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/40">
                            <Clock className="w-4 h-4" /> Pending Payment
                          </span>
                        )}
                      </td>
                      <td className="py-5 px-6 text-base font-mono font-bold text-slate-200 whitespace-nowrap">
                        {formatDate(payment.submitted_at)}
                      </td>
                      <td className="py-5 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2.5">
                          {part.email ? (
                            payment.status === 'VERIFIED' ? (
                              <a
                                href={buildPaymentConfirmationGmailLink(payment)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-400/40 px-3 py-2 text-xs font-extrabold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                                title="Send Confirmation Email & Entry Pass"
                              >
                                <Mail className="w-4 h-4" />
                                Email Pass
                              </a>
                            ) : (
                              <a
                                href={buildPendingPaymentGmailLink(payment)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 border border-amber-400/40 px-3 py-2 text-xs font-extrabold text-amber-300 hover:bg-amber-500/20 transition-colors"
                                title="Send Payment Reminder Email"
                              >
                                <Mail className="w-4 h-4" />
                                Email
                              </a>
                            )
                          ) : null}
                          <button
                            onClick={() => setSelectedDetails(payment)}
                            className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-brand-cyan/60 text-slate-300 hover:text-white transition-colors"
                            title="Details"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedDetails && (
        <DetailsModal
          isOpen={!!selectedDetails}
          onClose={() => setSelectedDetails(null)}
          title={`Payment: ${selectedDetails.registrations?.registration_code || ''}`}
          data={{
            registration_code: selectedDetails.registrations?.registration_code,
            participant_name: selectedDetails.registrations?.participants?.name,
            participant_email: selectedDetails.registrations?.participants?.email,
            college: selectedDetails.registrations?.participants?.college,
            amount: formatCurrency(selectedDetails.amount),
            transaction_id: selectedDetails.transaction_id || selectedDetails.utr,
            status: selectedDetails.status,
            submitted_at: selectedDetails.submitted_at,
            day: selectedDetails.registrations?.selected_day,
          }}
        />
      )}
    </div>
  );
}
