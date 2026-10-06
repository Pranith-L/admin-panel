import { supabase } from '../config/supabase.js';

const STORAGE_KEY = 'cs_status_overrides';
const BROADCAST_CHANNEL_NAME = 'cs_realtime_sync';
const STATUS_OVERRIDE_TTL_MS = 12 * 60 * 60 * 1000;

function isFreshOverride(entry) {
  if (!entry || !entry.updated_at) return true;
  const ts = Date.parse(entry.updated_at);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts <= STATUS_OVERRIDE_TTL_MS;
}

// BroadcastChannel for cross-tab realtime synchronization
let broadcastChannel = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  } catch {
    broadcastChannel = null;
  }
}

/**
 * Retrieve persistent status overrides from localStorage.
 */
export function getStatusOverrides() {
  if (typeof window === 'undefined') return { registrations: {}, payments: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { registrations: {}, payments: {} };
    const parsed = JSON.parse(raw);

    return {
      registrations: Object.fromEntries(
        Object.entries(parsed.registrations || {}).filter(([, value]) => isFreshOverride(value))
      ),
      payments: Object.fromEntries(
        Object.entries(parsed.payments || {}).filter(([, value]) => isFreshOverride(value))
      ),
    };
  } catch {
    return { registrations: {}, payments: {} };
  }
}

export function normalizePaymentStatus(paymentLike) {
  const payment = Array.isArray(paymentLike) ? paymentLike.find(Boolean) : paymentLike;
  const raw = payment?.status || payment?.payment_status || paymentLike?.status || paymentLike?.payment_status;
  return String(raw || '').toUpperCase();
}

export function normalizeRegistrationStatus(record = {}) {
  const { registrations: regOverrides, payments: payOverrides } = getStatusOverrides();
  const regId = record.id || record.registration_id || record.registration_code;
  const regOverride = regOverrides[regId] || regOverrides[record.registration_code];
  const payOverride = payOverrides[regId] || payOverrides[record.registration_code];

  if (regOverride?.status) return String(regOverride.status).toUpperCase();
  if (payOverride?.status) return String(payOverride.status).toUpperCase();

  const paymentStatus = normalizePaymentStatus(record.payments);
  const rawStatus = String(record.status || '').toUpperCase();

  if (paymentStatus === 'VERIFIED' || paymentStatus === 'CONFIRMED') return 'VERIFIED';
  if (paymentStatus === 'REJECTED' || paymentStatus === 'CANCELLED') return 'REJECTED';
  if (['PENDING', 'PAYMENT_PENDING', 'PENDING_VERIFICATION', 'UNDER_REVIEW'].includes(paymentStatus)) {
    return 'PAYMENT_PENDING';
  }

  if (rawStatus === 'VERIFIED' || rawStatus === 'CONFIRMED') return 'VERIFIED';
  if (rawStatus === 'REJECTED' || rawStatus === 'CANCELLED') return 'REJECTED';
  if (rawStatus === 'PAYMENT_PENDING' || rawStatus === 'PENDING') return 'PAYMENT_PENDING';

  return rawStatus || 'PENDING';
}

/**
 * Save and broadcast a registration and payment status update.
 */
export function saveStatusOverride(registrationId, regStatus, paymentStatus, meta = {}) {
  if (!registrationId) return;

  const current = getStatusOverrides();
  const timestamp = new Date().toISOString();

  if (regStatus) {
    current.registrations[registrationId] = {
      status: regStatus,
      updated_at: timestamp,
      ...meta,
    };
  }

  if (paymentStatus) {
    current.payments[registrationId] = {
      status: paymentStatus,
      updated_at: timestamp,
      ...meta,
    };
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.warn('Could not persist status override to localStorage:', err);
  }

  const payload = {
    registrationId,
    regStatus,
    paymentStatus,
    meta,
    timestamp: Date.now(),
  };

  // 1. Dispatch custom events on current window
  if (typeof window !== 'undefined') {
    if (regStatus) {
      window.dispatchEvent(
        new CustomEvent('cs:registration-updated', { detail: payload })
      );
    }
    if (paymentStatus) {
      window.dispatchEvent(
        new CustomEvent('cs:payment-updated', { detail: payload })
      );
    }
  }

  // 2. Broadcast to other tabs via BroadcastChannel
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(payload);
    } catch {
      // ignore
    }
  }
}

/**
 * Apply status overrides to an array of registration records.
 */
export function applyRegistrationOverrides(registrations = []) {
  const { registrations: regOverrides, payments: payOverrides } = getStatusOverrides();
  if (!Object.keys(regOverrides).length && !Object.keys(payOverrides).length) {
    return registrations.map((r) => ({
      ...r,
      status: normalizeRegistrationStatus(r),
      payments: Array.isArray(r.payments)
        ? r.payments.map((p) => ({
            ...p,
            status: normalizePaymentStatus(p) || p.status,
          }))
        : r.payments && typeof r.payments === 'object'
          ? { ...r.payments, status: normalizePaymentStatus(r.payments) || r.payments.status }
          : r.payments,
    }));
  }

  return registrations.map((r) => {
    const regId = r.id || r.registration_id;
    const override = regOverrides[regId] || regOverrides[r.registration_code];
    const payOverride = payOverrides[regId] || payOverrides[r.registration_code];

    let newStatus = normalizeRegistrationStatus(r);
    if (override?.status) {
      newStatus = override.status;
    }

    let updatedPayments = r.payments;
    if (Array.isArray(updatedPayments)) {
      updatedPayments = updatedPayments.map((p) => {
        const nextStatus = payOverride?.status || normalizePaymentStatus(p) || p.status;
        return { ...p, status: nextStatus };
      });
    } else if (updatedPayments && typeof updatedPayments === 'object') {
      updatedPayments = {
        ...updatedPayments,
        status: payOverride?.status || normalizePaymentStatus(updatedPayments) || updatedPayments.status,
      };
    } else if (payOverride?.status) {
      updatedPayments = { status: payOverride.status };
    }

    return {
      ...r,
      status: newStatus,
      payments: updatedPayments,
    };
  });
}

/**
 * Apply status overrides to an array of payment records.
 */
export function applyPaymentOverrides(payments = []) {
  const { payments: payOverrides, registrations: regOverrides } = getStatusOverrides();
  if (!Object.keys(payOverrides).length && !Object.keys(regOverrides).length) {
    return payments.map((p) => ({
      ...p,
      status: normalizePaymentStatus(p) || p.status,
      registrations: p.registrations
        ? {
            ...p.registrations,
            status: normalizeRegistrationStatus(p.registrations),
          }
        : p.registrations,
    }));
  }

  return payments.map((p) => {
    const regId = p.registration_id || p.id;
    const payOverride = payOverrides[regId] || payOverrides[p.id];
    const regOverride = regOverrides[regId] || regOverrides[p.id];

    let newStatus = normalizePaymentStatus(p) || p.status;
    let newReason = p.rejection_reason;

    if (payOverride?.status) {
      newStatus = payOverride.status;
      if (payOverride.reason) {
        newReason = payOverride.reason;
      }
    }

    let updatedRegistrations = p.registrations;
    if (updatedRegistrations && regOverride?.status) {
      updatedRegistrations = {
        ...updatedRegistrations,
        status: regOverride.status,
      };
    }

    return {
      ...p,
      status: newStatus,
      rejection_reason: newReason,
      registrations: updatedRegistrations,
    };
  });
}

/**
 * Apply status overrides to database summary metrics.
 */
export function applySummaryOverrides(regSummary, paySummary) {
  if (!regSummary && !paySummary) return { regSummary, paySummary };

  const { registrations: regOverrides, payments: payOverrides } = getStatusOverrides();
  const overrideEntries = Object.entries(regOverrides);
  if (!overrideEntries.length) return { regSummary, paySummary };

  const adjustedReg = regSummary ? { ...regSummary } : null;
  const adjustedPay = paySummary ? { ...paySummary } : null;

  overrideEntries.forEach(([_, data]) => {
    const s = String(data.status || '').toUpperCase();
    if (s === 'CONFIRMED' || s === 'VERIFIED') {
      if (adjustedReg && adjustedReg.payment_pending > 0) {
        adjustedReg.confirmed_registrations = Number(adjustedReg.confirmed_registrations || 0) + 1;
        adjustedReg.payment_pending = Math.max(0, Number(adjustedReg.payment_pending || 0) - 1);
      }
      if (adjustedPay && adjustedPay.under_review_payments > 0) {
        adjustedPay.verified_payments = Number(adjustedPay.verified_payments || 0) + 1;
        adjustedPay.under_review_payments = Math.max(0, Number(adjustedPay.under_review_payments || 0) - 1);
      }
    } else if (s === 'CANCELLED' || s === 'REJECTED') {
      if (adjustedReg && adjustedReg.payment_pending > 0) {
        adjustedReg.cancelled_registrations = Number(adjustedReg.cancelled_registrations || 0) + 1;
        adjustedReg.payment_pending = Math.max(0, Number(adjustedReg.payment_pending || 0) - 1);
      }
      if (adjustedPay && adjustedPay.under_review_payments > 0) {
        adjustedPay.rejected_payments = Number(adjustedPay.rejected_payments || 0) + 1;
        adjustedPay.under_review_payments = Math.max(0, Number(adjustedPay.under_review_payments || 0) - 1);
      }
    }
  });

  return { regSummary: adjustedReg, paySummary: adjustedPay };
}

/**
 * Unified realtime subscriber for React components.
 * Listens to:
 * 1. Window events ('cs:registration-updated', 'cs:payment-updated')
 * 2. Cross-tab BroadcastChannel
 * 3. Supabase Realtime postgres_changes channel
 */
export function subscribeToRealtimeUpdates(onUpdateCallback) {
  if (typeof window === 'undefined' || typeof onUpdateCallback !== 'function') {
    return () => {};
  }

  // 1. Local window listeners
  const handleWindowEvent = (e) => {
    onUpdateCallback(e.detail || {});
  };

  window.addEventListener('cs:registration-updated', handleWindowEvent);
  window.addEventListener('cs:payment-updated', handleWindowEvent);

  // 2. BroadcastChannel cross-tab listener
  let channelListener = null;
  if (broadcastChannel) {
    channelListener = (e) => {
      onUpdateCallback(e.data || {});
    };
    broadcastChannel.addEventListener('message', channelListener);
  }

  // 3. Supabase Realtime postgres_changes subscription
  let supabaseChannel = null;
  try {
    supabaseChannel = supabase
      .channel(`cs_realtime_${Math.random().toString(36).substring(2, 9)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registrations' },
        (payload) => {
          onUpdateCallback({ type: 'supabase_registration', payload });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        (payload) => {
          onUpdateCallback({ type: 'supabase_payment', payload });
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('Supabase Realtime subscription error:', err);
  }

  // Unsubscribe cleanup
  return () => {
    window.removeEventListener('cs:registration-updated', handleWindowEvent);
    window.removeEventListener('cs:payment-updated', handleWindowEvent);

    if (broadcastChannel && channelListener) {
      broadcastChannel.removeEventListener('message', channelListener);
    }

    if (supabaseChannel) {
      try {
        supabase.removeChannel(supabaseChannel);
      } catch {
        // ignore
      }
    }
  };
}
