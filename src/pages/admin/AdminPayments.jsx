import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getPayments } from '../../services/adminService';
import { subscribeToRealtimeUpdates } from '../../utils/statusStore';
import { DetailsModal } from '../../components/common/DetailsModal';
import { formatCurrency, buildPaymentConfirmationGmailLink, buildPendingPaymentGmailLink } from '../../utils/helpers';
import {
  Search,
  Eye,
  RefreshCw,
  Check,
  Clock,
  X,
  Mail,
} from 'lucide-react';

export function AdminPayments() {
  const { adminProfile } = useAuth();
  const { addToast } = useToast();

  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [activeDetails, setActiveDetails] = useState(null);

  async function load() {
    setIsLoading(true);
    try {
      const data = await getPayments(statusFilter);
      setPayments(data);
    } catch (err) {
      addToast({
        title: 'Payments Error',
        message: err.message,
        type: 'error',
      });
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
  }, [statusFilter]);

  const filtered = payments.filter((p) => {
    const reg = p.registrations || {};
    const part = reg.participants || {};
    return (
      !search ||
      [
        reg.registration_code,
        part.name,
        part.email,
        part.college,
        p.utr,
        p.status,
        p.event_label,
        p.special_event_label,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase().trim())
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', marginBottom: '6px' }}>Payments</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Monitor payment status and view transaction details as they are updated automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={isLoading}
          className="btn btn-secondary"
          style={{ fontSize: '0.85rem' }}
        >
          <RefreshCw size={16} className={isLoading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters Toolbar */}
      <div
        className="glass-card"
        style={{
          padding: '20px 24px',
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
          <Search size={22} color="#00f0ff" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            className="form-input"
            style={{ width: '100%', paddingLeft: '48px', minHeight: '56px', fontSize: '15px', fontWeight: 600 }}
            placeholder="Search code, participant, email, transaction ID, event..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="form-select"
          style={{ width: '230px', minHeight: '56px', fontSize: '15px', fontWeight: 600 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Payment Statuses</option>
          <option value="UNDER_REVIEW">UNDER REVIEW</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="FLAGGED">FLAGGED</option>
          <option value="PENDING">PENDING</option>
        </select>
      </div>

      {/* Payments Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ fontSize: '0.92rem', padding: '18px 22px' }}>Registration</th>
              <th style={{ fontSize: '0.92rem', padding: '18px 22px' }}>Participant</th>
              <th style={{ fontSize: '0.92rem', padding: '18px 22px' }}>Amount</th>
              <th style={{ fontSize: '0.92rem', padding: '18px 22px' }}>Transaction ID</th>
              <th style={{ fontSize: '0.92rem', padding: '18px 22px' }}>Status</th>
              <th style={{ fontSize: '0.92rem', padding: '18px 22px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                  Loading payment requests...
                </td>
              </tr>
            ) : filtered.length ? (
              filtered.map((p) => {
                const reg = p.registrations || {};
                const part = reg.participants || {};

                return (
                  <tr key={p.id || p.registration_id}>
                    <td style={{ padding: '18px 22px' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.15rem', color: '#00f0ff' }}>
                        {reg.registration_code || p.registration_id}
                      </div>
                      <div style={{ fontSize: '0.88rem', color: '#94a3b8', marginTop: '2px', fontWeight: 600 }}>
                        {p.special_event_label || p.event_label || reg.selected_day}
                      </div>
                    </td>

                    <td style={{ padding: '18px 22px' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#ffffff' }}>{part.name || 'Participant'}</div>
                      <div style={{ fontSize: '0.9rem', color: '#cbd5e1', marginTop: '2px' }}>{part.email}</div>
                    </td>

                    <td style={{ padding: '18px 22px', fontWeight: 900, fontSize: '1.25rem', color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(p.amount)}
                    </td>

                    <td style={{ padding: '18px 22px', fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: '#f1f5f9' }}>
                      {p.transaction_id || p.utr || '—'}
                    </td>

                    <td style={{ padding: '18px 22px' }}>
                      {p.status === 'VERIFIED' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '999px',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                          }}
                        >
                          <Check size={14} /> Completed
                        </span>
                      ) : p.status === 'REJECTED' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '999px',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            background: 'rgba(244, 63, 94, 0.15)',
                            color: '#f43f5e',
                            border: '1px solid rgba(244, 63, 94, 0.4)',
                          }}
                        >
                          <X size={14} /> Not Completed
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '999px',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                          }}
                        >
                          <Clock size={14} /> Pending Payment
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '18px 22px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {part.email ? (
                          p.status === 'VERIFIED' ? (
                            <a
                              href={buildPaymentConfirmationGmailLink(p)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{ padding: '9px 13px', fontSize: '0.92rem', background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.5)', color: '#34d399' }}
                              title="Send Confirmation Email & Entry Pass"
                            >
                              <Mail size={16} />
                              Email Pass
                            </a>
                          ) : (
                            <a
                              href={buildPendingPaymentGmailLink(p)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{ padding: '9px 13px', fontSize: '0.92rem', background: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.5)', color: '#fbbf24' }}
                              title="Send Payment Reminder Email"
                            >
                              <Mail size={16} />
                              Email
                            </a>
                          )
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setActiveDetails(p)}
                          className="btn btn-secondary"
                          style={{ padding: '9px 13px', fontSize: '0.92rem' }}
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-dim)' }}>
                  No payment requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Details Modal */}
      <DetailsModal
        isOpen={Boolean(activeDetails)}
        onClose={() => setActiveDetails(null)}
        title="Payment & Registration Breakdown"
        data={activeDetails}
      />

    </div>
  );
}

export default AdminPayments;
