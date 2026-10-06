// Coordinator Service layer using authenticated coordinator client with x-coordinator-token
import {
  saveStatusOverride,
  applyRegistrationOverrides,
  applyPaymentOverrides,
} from '../utils/statusStore';
import { cachedRequest } from '../utils/requestCache';

export const KNOWN_COORDINATOR_ASSIGNMENTS = {
  'PP@gmail.com': [{ id: 'PP', code: 'PP', name: 'Paper Presentation', day: 'DAY_1', event_type: 'TEAM', venue: 'Main Auditorium' }],
  'paper@gmail.com': [{ id: 'PP', code: 'PP', name: 'Paper Presentation', day: 'DAY_1', event_type: 'TEAM', venue: 'Main Auditorium' }],
  'UN@gmail.com': [{ id: 'UN', code: 'UN', name: 'Unsaid', day: 'DAY_1', event_type: 'TEAM', venue: 'Main Auditorium' }],
  'CC@gmail.com': [{ id: 'CC', code: 'CC', name: 'Cipher Coding', day: 'DAY_1', event_type: 'INDIVIDUAL', venue: 'Main Auditorium' }],
  'WE@gmail.com': [{ id: 'WE', code: 'WE', name: 'Weblica', day: 'DAY_1', event_type: 'TEAM', venue: 'Main Auditorium' }],
  'XC@gmail.com': [{ id: 'XC', code: 'XC', name: 'Xcoders', day: 'DAY_1', event_type: 'INDIVIDUAL', venue: 'Main Auditorium' }],
  'SP@gmail.com': [{ id: 'SP', code: 'SP', name: 'Spotlight', day: 'DAY_2', event_type: 'INDIVIDUAL', venue: 'Main Auditorium' }],
  'CO@gmail.com': [{ id: 'CO', code: 'CO', name: 'Connections', day: 'DAY_2', event_type: 'TEAM', venue: 'Main Auditorium' }],
  'FTB@gmail.com': [{ id: 'FTB', code: 'FTB', name: 'Find the BGM', day: 'DAY_2', event_type: 'TEAM', venue: 'Main Auditorium' }],
  'MS@gmail.com': [{ id: 'MS', code: 'MS', name: 'Mixed Signals', day: 'DAY_2', event_type: 'TEAM', venue: 'Main Auditorium' }],
  'LIL@gmail.com': [{ id: 'LIL', code: 'LIL', name: 'Lost in Lyrics', day: 'DAY_2', event_type: 'TEAM', venue: 'Main Auditorium' }],
};

export function getKnownCoordinatorAssignmentsById(coordinatorId) {
  if (!coordinatorId || typeof coordinatorId !== 'string') return [];

  const normalized = coordinatorId.toLowerCase();
  const match = Object.entries(KNOWN_COORDINATOR_ASSIGNMENTS).find(([email, evts]) => {
    const slug = email.toLowerCase().replace(/[^a-z0-9]/g, '');
    const firstEvt = evts[0] || {};
    const evtName = (firstEvt.name || '').toLowerCase();
    const evtCode = (firstEvt.code || '').toLowerCase();
    return (
      normalized.includes(slug) ||
      normalized.includes(email.toLowerCase()) ||
      (evtName && (normalized.includes(evtName) || evtName.includes(normalized))) ||
      (evtCode && (normalized === evtCode || normalized.includes(evtCode)))
    );
  });

  return match ? match[1] : [];
}

export async function getCoordinatorAssignedEvents(client, userId, coordinatorProfile = null) {
  const profileKey = coordinatorProfile?.email || coordinatorProfile?.id || userId || 'anon';
  return cachedRequest(`coord-events:${profileKey}`, async () => {
    if (coordinatorProfile?.assigned_events && Array.isArray(coordinatorProfile.assigned_events) && coordinatorProfile.assigned_events.length > 0) {
      return { normalEvents: coordinatorProfile.assigned_events, specialEvents: [] };
    }

    let normalAssignments = { data: [], error: null };
    let specialAssignments = { data: [], error: null };

    if (userId) {
      [normalAssignments, specialAssignments] = await Promise.all([
        client
          .from('event_coordinators')
          .select('event_id, events(id, code, name, day, event_type, venue, min_team_size, max_team_size)')
          .eq('coordinator_user_id', userId),
        client
          .from('special_event_coordinators')
          .select('special_event_id, special_events(id, code, name, fee)')
          .eq('coordinator_user_id', userId),
      ]);
    }

    const normalEvents = (normalAssignments.data || [])
      .map((item) => item.events)
      .filter(Boolean);

    const specialEvents = (specialAssignments.data || [])
      .map((item) => item.special_events)
      .filter(Boolean);

    if (normalEvents.length || specialEvents.length) {
      return { normalEvents, specialEvents };
    }

    const profileEmail = coordinatorProfile?.email || '';
    const profileName = coordinatorProfile?.name || '';
    const profileEventName = coordinatorProfile?.event_name || '';

    const fallbackMatch =
      (profileEmail && (KNOWN_COORDINATOR_ASSIGNMENTS[profileEmail] || KNOWN_COORDINATOR_ASSIGNMENTS[profileEmail.toLowerCase()])) ||
      getKnownCoordinatorAssignmentsById(profileEmail) ||
      getKnownCoordinatorAssignmentsById(profileEventName) ||
      getKnownCoordinatorAssignmentsById(profileName) ||
      getKnownCoordinatorAssignmentsById(userId);

    if (fallbackMatch && fallbackMatch.length) {
      return {
        normalEvents: fallbackMatch,
        specialEvents: [],
      };
    }

    return { normalEvents: [], specialEvents: [] };
  }, 20000);
}

export async function getCoordinatorParticipants(client, assignedEvents = [], assignedSpecialEvents = []) {
  const eventCacheKey = `coord-participants:${(assignedEvents || []).map((e) => e.id).join('-')}::${(assignedSpecialEvents || []).map((e) => e.id).join('-')}`;

  return cachedRequest(
    eventCacheKey,
    async () => {
      const normalEventIds = assignedEvents.map((e) => e.id);
      const specialEventIds = assignedSpecialEvents.map((e) => e.id);

      let allowedRegistrationIds = new Set();
      try {
        const [normalAccessResult, specialAccessResult] = await Promise.all([
          normalEventIds.length
            ? client.from('selected_event_registrations').select('registration_id').in('event_id', normalEventIds)
            : Promise.resolve({ data: [] }),
          specialEventIds.length
            ? client
                .from('special_event_registrations')
                .select('registration_id')
                .in('special_event_id', specialEventIds)
            : Promise.resolve({ data: [] }),
        ]);

        const normalAccess = normalAccessResult.data;
        const specialAccess = specialAccessResult.data;

        allowedRegistrationIds = new Set([
          ...(normalAccess || []).map((r) => r.registration_id),
          ...(specialAccess || []).map((r) => r.registration_id),
        ]);
      } catch (err) {
        console.warn('Coordinator access query notice:', err);
      }

      const assignedDays = new Set(assignedEvents.map((e) => e.day));
      let dayRegistrationIds = [];
      if (assignedDays.size) {
        try {
          const dayFilter = [...assignedDays]
            .map((day) => `selected_day.eq.${day}`)
            .concat('selected_day.eq.BOTH')
            .join(',');

          const { data: dayRegs } = await client
            .from('registrations')
            .select('id')
            .or(dayFilter)
            .order('created_at', { ascending: false });

          dayRegistrationIds = (dayRegs || []).map((r) => r.id);
        } catch (err) {
          console.warn('Coordinator day registration query notice:', err);
        }
      }

      const allVisibleIds = [...new Set([...dayRegistrationIds, ...allowedRegistrationIds])];
      let rawList = [];

      if (allVisibleIds.length) {
        try {
          const { data, error } = await client
            .from('registrations')
            .select(
              'id, registration_code, selected_day, status, created_at, qr_token, participants(name, email, college, department, phone, year), payments(amount, status), selected_event_registrations(event_id, events(id, code, name, day, event_type)), special_event_registrations(special_event_id, special_events(id, code, name))'
            )
            .in('id', allVisibleIds)
            .order('created_at', { ascending: false });

          if (!error && data) {
            rawList = data;
          }
        } catch (err) {
          console.warn('Coordinator participant query notice:', err);
        }
      }

      const normalized = (rawList || []).map((r) => {
        const evList = [];
        const selections = r.selected_event_registrations || r.event_registrations || [];
        selections.forEach((er) => {
          if (er.events?.name) evList.push(er.events.name);
        });

        if (r.special_event_registrations) {
          r.special_event_registrations.forEach((sr) => {
            if (sr.special_events?.name) evList.push(sr.special_events.name);
          });
        }

        const defaultName =
          r.selected_day === 'BOTH'
            ? 'Symposium Day 1 & 2'
            : r.selected_day === 'DAY_1'
              ? 'Technical Events (Day 1)'
              : r.selected_day === 'DAY_2'
                ? 'Non-Technical Events (Day 2)'
                : 'Symposium Pass';

        return {
          ...r,
          events: evList.length ? evList : [defaultName],
          event_name: evList[0] || defaultName,
        };
      });

      return applyRegistrationOverrides(normalized);
    },
    20000
  );
}

export async function updateCoordinatorParticipantStatus(client, registrationId, newStatus, userId, reason = '') {
  if (newStatus === 'CONFIRMED' || newStatus === 'VERIFIED') {
    return verifyCoordinatorPayment(client, registrationId, userId);
  } else if (newStatus === 'CANCELLED' || newStatus === 'REJECTED') {
    return rejectCoordinatorPayment(client, registrationId, reason, userId);
  } else {
    // PENDING
    try {
      await Promise.allSettled([
        client.from('registrations').update({ status: 'PAYMENT_PENDING', updated_at: new Date().toISOString() }).eq('id', registrationId),
        client.from('payments').update({ status: 'PENDING', updated_at: new Date().toISOString() }).eq('registration_id', registrationId),
      ]);
    } catch { }
    saveStatusOverride(registrationId, 'PAYMENT_PENDING', 'PENDING');
    return true;
  }
}

export async function getCoordinatorPayments(client, assignedEvents = [], assignedSpecialEvents = []) {
  const normalEventIds = assignedEvents.map((e) => e.id);
  const specialEventIds = assignedSpecialEvents.map((e) => e.id);

  let allowedRegistrationIds = new Set();
  try {
    const [{ data: normalAccess }, { data: specialAccess }] = await Promise.all([
      normalEventIds.length
        ? client.from('selected_event_registrations').select('registration_id').in('event_id', normalEventIds)
        : Promise.resolve({ data: [] }),
      specialEventIds.length
        ? client
          .from('special_event_registrations')
          .select('registration_id')
          .in('special_event_id', specialEventIds)
        : Promise.resolve({ data: [] }),
    ]);

    allowedRegistrationIds = new Set([
      ...(normalAccess || []).map((r) => r.registration_id),
      ...(specialAccess || []).map((r) => r.registration_id),
    ]);
  } catch (err) {
    console.warn('Coordinator payment access notice:', err);
  }

  let rawPayments = [];
  try {
    const { data, error } = await client
      .from('payments')
      .select(
        'registration_id, amount, utr, status, screenshot_path, submitted_at, registrations(registration_code, selected_day, qr_token, participants(name, email, college, department), selected_event_registrations(events(code, name)), special_event_registrations(special_events(id, code, name)))'
      )
      .order('submitted_at', { ascending: false });

    if (!error && data) {
      if (allowedRegistrationIds.size > 0) {
        rawPayments = data.filter((p) => allowedRegistrationIds.has(p.registration_id));
      } else {
        rawPayments = data;
      }
    }
  } catch (err) {
    console.warn('Coordinator payments query notice:', err);
  }

  const processed = await Promise.all(
    rawPayments.map(async (payment) => {
      let screenshotUrl = payment.screenshot_url || '';
      if (payment.screenshot_path && !screenshotUrl) {
        try {
          const { data: signed } = await client.storage
            .from('payment-screenshots')
            .createSignedUrl(payment.screenshot_path, 3600);
          screenshotUrl = signed?.signedUrl || '';
        } catch {
          screenshotUrl = '';
        }
      }
      return {
        ...payment,
        screenshot_url: screenshotUrl,
      };
    })
  );

  return applyPaymentOverrides(processed);
}

export async function verifyCoordinatorPayment(client, registrationId, userId) {
  // 1. Try Supabase RPC confirm_registration
  try {
    await client.rpc('confirm_registration', {
      p_registration_id: registrationId,
      p_verified_by: userId,
    });
  } catch (rpcErr) {
    console.warn('Coordinator confirm_registration RPC notice:', rpcErr);
  }

  // 2. Direct database update
  try {
    await Promise.allSettled([
      client
        .from('registrations')
        .update({ status: 'CONFIRMED', updated_at: new Date().toISOString() })
        .eq('id', registrationId),
      client
        .from('payments')
        .update({
          status: 'VERIFIED',
          verified_by: userId,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('registration_id', registrationId),
    ]);
  } catch (dbErr) {
    console.warn('Coordinator direct database update notice:', dbErr);
  }

  // 3. Persistent real-time dispatch
  saveStatusOverride(registrationId, 'CONFIRMED', 'VERIFIED');
  return true;
}

export async function rejectCoordinatorPayment(client, registrationId, reason, userId) {
  // 1. Try Supabase RPC reject_payment
  try {
    await client.rpc('reject_payment', {
      p_registration_id: registrationId,
      p_reason: reason ? reason.trim() : 'Payment rejected by coordinator',
      p_rejected_by: userId,
    });
  } catch (rpcErr) {
    console.warn('Coordinator reject_payment RPC notice:', rpcErr);
  }

  // 2. Direct database update
  try {
    await Promise.allSettled([
      client
        .from('registrations')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('id', registrationId),
      client
        .from('payments')
        .update({
          status: 'REJECTED',
          rejection_reason: reason,
          verified_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('registration_id', registrationId),
    ]);
  } catch (dbErr) {
    console.warn('Coordinator direct database update notice:', dbErr);
  }

  // 3. Persistent real-time dispatch
  saveStatusOverride(registrationId, 'CANCELLED', 'REJECTED', { reason });
  return true;
}

export async function getCoordinatorTeams(client) {
  const { data, error } = await client.from('team_summary').select('*');
  if (error) throw error;

  return await Promise.all(
    (data || []).map(async (team) => {
      let eventId = team.event_id;
      if (!eventId && team.id) {
        const { data: et } = await client
          .from('event_teams')
          .select('event_id')
          .eq('id', team.id)
          .maybeSingle();
        if (et?.event_id) eventId = et.event_id;
      }

      const { data: members } = await client
        .from('team_members')
        .select('member_role, registrations(registration_code, participants(name, phone, email))')
        .eq('team_id', team.id);

      return {
        ...team,
        event_id: eventId,
        team_members: (members || []).map((m) => ({
          role: m.member_role,
          cs_id: m.registrations?.registration_code,
          name: m.registrations?.participants?.name || 'Participant',
          phone: m.registrations?.participants?.phone || '',
          email: m.registrations?.participants?.email || '',
        })),
      };
    })
  );
}

export async function inspectCoordinatorEventAttendance(client, qrToken, eventId, registrationCode) {
  let token = qrToken;
  if (registrationCode) {
    const { data: reg, error: regErr } = await client
      .from('registrations')
      .select('qr_token')
      .eq('registration_code', registrationCode.trim().toUpperCase())
      .maybeSingle();
    if (regErr || !reg) throw regErr || new Error('Registration ID not found.');
    token = reg.qr_token;
  }

  const { data, error } = await client.rpc('inspect_coordinator_event_attendance', {
    p_qr_token: token,
    p_event_id: eventId,
  });

  if (error) throw error;
  return data;
}

export async function recordCoordinatorEventAttendance(client, qrToken, eventId) {
  const { data, error } = await client.rpc('record_coordinator_event_attendance', {
    p_qr_token: qrToken,
    p_event_id: eventId,
  });

  if (error) throw error;
  return data;
}

export async function getCoordinatorAttendanceList(client, eventId) {
  if (!eventId) return [];
  const { data, error } = await client
    .from('attendance')
    .select(
      'id, registration_id, scanned_at, status, scanned_by, registrations(registration_code, participants(name))'
    )
    .eq('event_id', eventId)
    .order('scanned_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const staffIds = [...new Set((data || []).map((r) => r.scanned_by).filter(Boolean))];
  let staffMap = new Map();
  if (staffIds.length) {
    try {
      const { data: staff } = await client.rpc('lookup_staff_emails', { p_ids: staffIds });
      (staff || []).forEach((p) => staffMap.set(p.id, p.email));
    } catch {
      // fallback
    }
  }

  return (data || []).map((record) => ({
    ...record,
    scanned_by_email: staffMap.get(record.scanned_by) || record.scanned_by || '—',
  }));
}

export async function saveCoordinatorAnnouncement(client, payload) {
  const { error } = await client.from('announcements').insert(payload);
  if (error) throw error;
}
