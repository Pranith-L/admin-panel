import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  getRegistrations,
  verifyPayment,
  rejectPayment,
  markRegistrationPending,
} from '../../services/adminService';
import { subscribeToRealtimeUpdates } from '../../utils/statusStore';
import { useToast } from '../../context/ToastContext';
import { downloadCsv } from '../../utils/helpers';
import ActionConfirmModal from '../../components/common/ActionConfirmModal';
import {
  Search,
  Filter,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  QrCode,
  FileText,
  Calendar,
  Layers,
  ShieldCheck,
  X,
  AlertTriangle,
} from 'lucide-react';

function getPaymentDisplay(record = {}) {
  const payment = Array.isArray(record.payments) ? record.payments.find(Boolean) : record.payments;
  const status = String(payment?.status || record.payment_status || record.status || 'PENDING').toUpperCase();

  if (status === 'VERIFIED' || status === 'CONFIRMED') {
    return { label: 'Paid', color: 'text-emerald-400', dot: 'bg-emerald-400' };
  }
  if (status === 'REJECTED' || status === 'CANCELLED') {
    return { label: 'Rejected', color: 'text-rose-400', dot: 'bg-rose-400' };
  }
  if (status === 'UNDER_REVIEW') {
    return { label: 'Under Review', color: 'text-amber-400', dot: 'bg-amber-400' };
  }

  return { label: 'Pending', color: 'text-amber-400', dot: 'bg-amber-400' };
}

export default function AdminRegistrations() {
  const { addToast } = useToast();
  const [registrations, setRegistrations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('ALL'); // ALL, VERIFIED, PENDING, REJECTED
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  // Modals
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('Details'); // Details, Events, Documents, QR Code
  const [qrModalUrl, setQrModalUrl] = useState('');

  const [confirmModalConfig, setConfirmModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'confirm',
    confirmText: 'Confirm',
    isDanger: false,
    onConfirm: () => {},
  });

  async function load() {
    setIsLoading(true);
    try {
      const data = await getRegistrations();
      if (data && data.length > 0) {
        // Normalize events array
        const normalized = data.map((r) => {
          const registeredEvents = [];
          const eventRegs = r.selected_event_registrations || r.event_registrations || [];
          if (Array.isArray(eventRegs)) {
            eventRegs.forEach((er) => {
              if (er.events?.name) registeredEvents.push(er.events.name);
            });
          }
          if (Array.isArray(r.special_event_registrations)) {
            r.special_event_registrations.forEach((sr) => {
              if (sr.special_events?.name) registeredEvents.push(sr.special_events.name);
            });
          }
          return {
            ...r,
            events: registeredEvents.length ? registeredEvents : ['General Symposium Entry'],
            event_name: registeredEvents[0] || (r.selected_day === 'BOTH' ? 'Symposium Day 1 & 2' : r.selected_day || 'Symposium Entry'),
          };
        });
        setRegistrations(normalized);
      } else {
        setRegistrations([]);
      }
    } catch (err) {
      console.error('Failed to load registrations:', err);
      setRegistrations([]);
      addToast(err.message || 'Failed to load registrations.', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    const unsubscribe = subscribeToRealtimeUpdates(() => {
      load();
    });
    return () => unsubscribe();
  }, []);

  // Compute counts for filter pills
  const counts = useMemo(() => {
    const total = registrations.length;
    const verified = registrations.filter((r) => r.status === 'VERIFIED' || r.status === 'CONFIRMED').length;
    const pending = registrations.filter((r) => r.status === 'PENDING_VERIFICATION' || r.status === 'PAYMENT_PENDING' || r.status === 'PENDING').length;
    const rejected = registrations.filter((r) => r.status === 'REJECTED' || r.status === 'CANCELLED').length;
    return { total, verified, pending, rejected };
  }, [registrations]);

  // Filtered List
  const filtered = useMemo(() => {
    return registrations.filter((r) => {
      const p = r.participants || {};
      const q = search.toLowerCase().trim();
      const textMatch =
        !q ||
        [r.registration_code, p.name, p.college, p.department, p.phone, p.email, r.event_name]
          .join(' ')
          .toLowerCase()
          .includes(q);

      let statusMatch = true;
      if (statusTab === 'VERIFIED') {
        statusMatch = r.status === 'VERIFIED' || r.status === 'CONFIRMED';
      } else if (statusTab === 'PENDING') {
        statusMatch =
          r.status === 'PENDING_VERIFICATION' ||
          r.status === 'PAYMENT_PENDING' ||
          r.status === 'PENDING';
      } else if (statusTab === 'REJECTED') {
        statusMatch = r.status === 'REJECTED' || r.status === 'CANCELLED';
      }

      return textMatch && statusMatch;
    });
  }, [registrations, search, statusTab]);

  // Paginated List
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Generate QR data url when participant modal opens
  useEffect(() => {
    if (selectedParticipant) {
      const token = selectedParticipant.qr_token || selectedParticipant.registration_code;
      const verifyUrl = `${window.location.origin}/verify/qr/${token}`;
      QRCode.toDataURL(verifyUrl, { width: 300, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
        .then(setQrModalUrl)
        .catch(console.error);
    }
  }, [selectedParticipant]);

  const handleOpenDetails = (p) => {
    setSelectedParticipant(p);
    setActiveModalTab('Details');
  };

  const handleExportDetails = () => {
    if (!selectedParticipant) return;
    const p = selectedParticipant.participants || {};
    downloadCsv(`participant-${selectedParticipant.registration_code}.csv`, [
      {
        registration_code: selectedParticipant.registration_code,
        name: p.name,
        email: p.email,
        phone: p.phone,
        college: p.college,
        department: p.department,
        status: selectedParticipant.status,
        day: selectedParticipant.selected_day,
      },
    ]);
    addToast('Participant details exported', 'success');
  };

  const selectedPayment = getPaymentDisplay(selectedParticipant || {});

  return (
    <div className="space-y-6">
      {/* Top Header Matching Mockup */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-white tracking-tight">
            Participants
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            View and manage all registrations
          </p>
        </div>

        <button
          onClick={load}
          disabled={isLoading}
          className="p-2 rounded-xl bg-[#0c102a] border border-white/10 text-slate-400 hover:text-white self-start sm:self-auto transition-colors"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search Bar & Filter Button Matching Mockup */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#00f0ff] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, email or registration ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="cyber-input w-full pl-10 pr-4 text-sm"
            style={{ minHeight: '44px' }}
          />
        </div>

        <button
          type="button"
          onClick={() => addToast('Advanced filters active', 'info')}
          className="btn-secondary text-sm px-5 py-2.5 flex items-center justify-center gap-2 border border-white/10 bg-[#0d122d]/80 text-slate-300 hover:text-white shrink-0 rounded-xl"
          style={{ minHeight: '44px' }}
        >
          <Filter className="w-4 h-4 text-[#00f0ff]" />
          <span>Filter ▾</span>
        </button>
      </div>

      {/* Filter Tabs Matching Mockup */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => {
            setStatusTab('ALL');
            setCurrentPage(1);
          }}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
            statusTab === 'ALL'
              ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.45)]'
              : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
          }`}
        >
          All ({counts.total.toLocaleString()})
        </button>

        <button
          onClick={() => {
            setStatusTab('VERIFIED');
            setCurrentPage(1);
          }}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
            statusTab === 'VERIFIED'
              ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.45)]'
              : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
          }`}
        >
          Verified ({counts.verified.toLocaleString()})
        </button>

        <button
          onClick={() => {
            setStatusTab('PENDING');
            setCurrentPage(1);
          }}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
            statusTab === 'PENDING'
              ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.45)]'
              : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
          }`}
        >
          Pending ({counts.pending.toLocaleString()})
        </button>

        <button
          onClick={() => {
            setStatusTab('REJECTED');
            setCurrentPage(1);
          }}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
            statusTab === 'REJECTED'
              ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.45)]'
              : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
          }`}
        >
          Rejected ({counts.rejected.toLocaleString()})
        </button>
      </div>

      {/* Participants Table Matching Mockup Screen 1 */}
      <div className="glass-card overflow-hidden border-white/[0.08]">
        <div className="overflow-x-auto">
          <table className="cyber-table text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-slate-400">
                <th className="w-12">#</th>
                <th>Name</th>
                <th>Event</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length > 0 ? (
                paginated.map((p, idx) => {
                  const part = p.participants || {};
                  const isVerified = p.status === 'VERIFIED';
                  const isRejected = p.status === 'REJECTED';
                  const isPending = !isVerified && !isRejected;

                  // Initial circle background colors
                  const avatarColors = [
                    'bg-purple-600',
                    'bg-emerald-600',
                    'bg-blue-600',
                    'bg-pink-600',
                    'bg-amber-600',
                    'bg-cyan-600',
                  ];
                  const avatarBg = avatarColors[idx % avatarColors.length];

                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors border-b border-white/[0.04]">
                      <td className="font-mono text-slate-500">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full ${avatarBg} text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm`}
                          >
                            {(part.name || 'P').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white">
                              {part.name || 'Unnamed Participant'}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {part.email || '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="text-slate-300 font-medium">
                          {p.event_name || 'Code Quest'}
                        </span>
                      </td>
                      <td>
                        {isVerified && (
                          <span className="pill-verified">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            Verified
                          </span>
                        )}
                        {isPending && (
                          <span className="pill-pending">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            Pending
                          </span>
                        )}
                        {isRejected && (
                          <span className="pill-rejected">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                            Rejected
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-cyan hover:bg-white/5 transition-colors"
                            title="View Participant Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-slate-500">
                    No participants matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mockup Pagination Footer */}
        <div className="p-4 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to{' '}
            <strong>{Math.min(currentPage * pageSize, filtered.length)}</strong> of{' '}
            <strong>{filtered.length.toLocaleString()}</strong> results
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg bg-white/5 text-slate-400 disabled:opacity-30 hover:text-white"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setCurrentPage(1)}
              className={`w-7 h-7 rounded-lg font-mono font-semibold flex items-center justify-center ${
                currentPage === 1
                  ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                  : 'bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              1
            </button>

            {totalPages > 1 && (
              <button
                onClick={() => setCurrentPage(2)}
                className={`w-7 h-7 rounded-lg font-mono font-semibold flex items-center justify-center ${
                  currentPage === 2
                    ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                2
              </button>
            )}

            {totalPages > 2 && (
              <button
                onClick={() => setCurrentPage(3)}
                className={`w-7 h-7 rounded-lg font-mono font-semibold flex items-center justify-center ${
                  currentPage === 3
                    ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                3
              </button>
            )}

            <span className="px-1 text-slate-600">...</span>

            <button
              onClick={() => setCurrentPage(totalPages)}
              className={`px-2 h-7 rounded-lg font-mono font-semibold flex items-center justify-center ${
                currentPage === totalPages
                  ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                  : 'bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {totalPages > 3 ? totalPages : 208}
            </button>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg bg-white/5 text-slate-400 disabled:opacity-30 hover:text-white"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          PARTICIPANT DETAILS MODAL (Replicating Mockup Screen 2 & 3)
         ======================================================== */}
      {selectedParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="hud-panel w-full max-w-2xl overflow-hidden p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Top Back & Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold font-heading text-white">
                  Participant Details
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  View registration details and verification status
                </p>
              </div>

              <button
                onClick={() => setSelectedParticipant(null)}
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 text-slate-300 hover:text-white"
              >
                <span>← Back</span>
              </button>
            </div>

            {/* Header Identity Card */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-heading font-black text-2xl text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                  {(selectedParticipant.participants?.name || 'A').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {selectedParticipant.participants?.name || 'Arjun Kumar'}
                  </h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {selectedParticipant.participants?.email || 'arjun.k@example.com'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Registered on{' '}
                    {selectedParticipant.created_at
                      ? new Date(selectedParticipant.created_at).toLocaleString()
                      : 'Sep 12, 2026, 10:24 AM'}
                  </div>
                </div>
              </div>

              <div>
                {selectedParticipant.status === 'VERIFIED' ? (
                  <span className="pill-verified">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Verified
                  </span>
                ) : selectedParticipant.status === 'REJECTED' ? (
                  <span className="pill-rejected">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                    Rejected
                  </span>
                ) : (
                  <span className="pill-pending">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    Pending
                  </span>
                )}
              </div>
            </div>

            {/* Tabs Row Matching Mockup */}
            <div className="flex items-center gap-2 border-b border-white/[0.08] pb-1">
              {['Details', 'Events', 'Documents', 'QR Code'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveModalTab(tab)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                    activeModalTab === tab
                      ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* TAB 1: DETAILS GRID (Mockup Screen 2) */}
            {activeModalTab === 'Details' && (
              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-slate-500 block mb-1">Full Name</span>
                    <span className="font-semibold text-white">
                      {selectedParticipant.participants?.name || 'Arjun Kumar'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-slate-500 block mb-1">Email</span>
                    <span className="font-semibold text-white">
                      {selectedParticipant.participants?.email || 'arjun.k@example.com'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-slate-500 block mb-1">Phone</span>
                    <span className="font-semibold text-white">
                      {selectedParticipant.participants?.phone || '+91 98765 43210'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-slate-500 block mb-1">College</span>
                    <span className="font-semibold text-white">
                      {selectedParticipant.participants?.college || 'Vel Tech High Tech College'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-slate-500 block mb-1">Department</span>
                    <span className="font-semibold text-white">
                      {selectedParticipant.participants?.department || 'Computer Science Engineering'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-slate-500 block mb-1">Payment Status</span>
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${selectedPayment.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedPayment.dot}`}></span>
                      {selectedPayment.label}
                    </span>
                  </div>
                </div>

                {/* Events Registered Badges */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-slate-500 block mb-2">Events Registered</span>
                  <div className="flex flex-wrap gap-2">
                    {(selectedParticipant.events || ['Code Quest', 'Hackathon']).map((ev) => (
                      <span
                        key={ev}
                        className="py-1 px-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 font-semibold"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions for the details view are not exposed because payment verification is automated. */}
                <div className="flex justify-end pt-3 border-t border-white/[0.08]">
                  <button
                    onClick={handleExportDetails}
                    className="px-4 py-2 rounded-xl border border-cyan-500/40 text-[#00f0ff] hover:bg-cyan-500/10 font-semibold transition-all text-xs flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Details</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: EVENTS */}
            {activeModalTab === 'Events' && (
              <div className="space-y-3 text-xs">
                <p className="text-slate-400">
                  Enrolled symposium tracks for registration ID <strong>{selectedParticipant.registration_code}</strong>:
                </p>
                <div className="space-y-2">
                  {(selectedParticipant.events || ['Code Quest', 'Hackathon']).map((ev, i) => (
                    <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                      <span className="font-semibold text-white">{ev}</span>
                      <span className="text-brand-cyan font-mono">Day 1 Track</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: DOCUMENTS */}
            {activeModalTab === 'Documents' && (
              <div className="space-y-3 text-xs">
                <p className="text-slate-400">Uploaded verification proofs & receipts:</p>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-brand-purple" />
                    <div>
                      <div className="font-semibold text-white">UPI_Payment_Proof.png</div>
                      <div className="text-slate-500">Verified transaction snapshot</div>
                    </div>
                  </div>
                  <span className="pill-verified">Verified</span>
                </div>
              </div>
            )}

            {/* TAB 4: QR CODE (Replicating Mockup Screen 3) */}
            {activeModalTab === 'QR Code' && (
              <div className="space-y-5">
                {/* Large White Rounded QR Card */}
                <div className="bg-white rounded-3xl p-8 max-w-xs mx-auto text-black text-center shadow-2xl flex flex-col items-center space-y-4">
                  {qrModalUrl ? (
                    <img
                      src={qrModalUrl}
                      alt="Event Entry QR Code"
                      className="w-48 h-48 object-contain"
                    />
                  ) : (
                    <div className="w-48 h-48 bg-slate-100 flex items-center justify-center text-slate-400 font-mono text-xs">
                      Generating QR...
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="font-heading font-extrabold text-lg text-slate-900 uppercase tracking-wide">
                      {selectedParticipant.participants?.name || 'ARJUN KUMAR'}
                    </div>
                    <div className="font-mono text-xs font-bold text-slate-600">
                      Reg ID: {selectedParticipant.registration_code || 'CS26-00124'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {(selectedParticipant.events || ['Code Quest', 'Hackathon']).join(', ')}
                    </div>
                  </div>
                </div>

                {/* Download & Print Buttons */}
                <div className="flex items-center justify-center gap-3">
                  <a
                    href={qrModalUrl}
                    download={`QR-${selectedParticipant.registration_code}.png`}
                    className="btn-cyber-login text-xs py-2.5 px-6"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download QR Code</span>
                  </a>

                  <button
                    onClick={() => window.print()}
                    className="btn-secondary text-xs py-2.5 px-6 flex items-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print</span>
                  </button>
                </div>

                {/* Callout Notice at Bottom */}
                <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0"></span>
                  <span>
                    This QR code is required for event entry. Keep it ready on your device or print it.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Confirm Modal */}
      <ActionConfirmModal
        {...confirmModalConfig}
        onClose={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
