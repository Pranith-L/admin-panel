import React from 'react';

export function StatusBadge({ status = '' }) {
  if (!status) return <span className="text-slate-500">—</span>;

  const s = String(status).toUpperCase();

  if (['VERIFIED', 'ACTIVE', 'CONFIRMED', 'PRESENT', 'YES', 'READY'].includes(s)) {
    return (
      <span className="pill-verified">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]"></span>
        <span>{s === 'VERIFIED' ? 'Verified' : s.replace(/_/g, ' ')}</span>
      </span>
    );
  }

  if (['PENDING', 'PAYMENT_PENDING', 'PENDING_VERIFICATION', 'UNDER_REVIEW', 'REVIEW', 'OPEN'].includes(s)) {
    return (
      <span className="pill-pending">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]"></span>
        <span>{s.includes('PENDING') ? 'Pending' : s.replace(/_/g, ' ')}</span>
      </span>
    );
  }

  if (['REJECTED', 'FLAGGED', 'INACTIVE', 'ABSENT', 'NO', 'FULL'].includes(s)) {
    return (
      <span className="pill-rejected">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_#f87171]"></span>
        <span>{s === 'REJECTED' ? 'Rejected' : s.replace(/_/g, ' ')}</span>
      </span>
    );
  }

  return (
    <span className="badge-outline text-[11px] font-mono text-slate-300">
      {s.replace(/_/g, ' ')}
    </span>
  );
}

export default StatusBadge;
