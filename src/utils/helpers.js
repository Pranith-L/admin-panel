// Utility helper functions

export function formatCurrency(amount) {
  const num = Number(amount || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return d.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return dateString;
  }
}

export function extractQrToken(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  try {
    const url = new URL(trimmed, window.location.origin);
    const queryToken = url.searchParams.get('token');
    if (queryToken) return queryToken;
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || trimmed;
  } catch {
    const match = trimmed.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
    return match ? match[0] : trimmed;
  }
}

export function openGmailCompose(optionsOrTo = {}, subjectArg = '', bodyArg = '', bccArg = []) {
  let to = '';
  let bcc = [];
  let subject = '';
  let body = '';

  if (typeof optionsOrTo === 'object' && optionsOrTo !== null && !Array.isArray(optionsOrTo)) {
    to = optionsOrTo.to || '';
    bcc = optionsOrTo.bcc || [];
    subject = optionsOrTo.subject || '';
    body = optionsOrTo.body || '';
  } else {
    to = typeof optionsOrTo === 'string' ? optionsOrTo : '';
    subject = subjectArg || '';
    body = bodyArg || '';
    bcc = bccArg || [];
  }

  const url = new URL('https://mail.google.com/mail/');
  url.searchParams.set('view', 'cm');
  url.searchParams.set('fs', '1');
  if (to) url.searchParams.set('to', to);
  if (bcc && (Array.isArray(bcc) ? bcc.length > 0 : String(bcc).trim())) {
    url.searchParams.set('bcc', Array.isArray(bcc) ? bcc.filter(Boolean).join(',') : String(bcc).trim());
  }
  if (subject) url.searchParams.set('su', subject);
  if (body) url.searchParams.set('body', body);
  window.open(url.toString(), '_blank');
}

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
  return Promise.resolve();
}

export function downloadCsv(filename, rows) {
  if (!rows || !rows.length) {
    throw new Error('No data available to export.');
  }
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(','),
    ...rows.map((row) =>
      keys.map((key) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(',')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function buildPaymentConfirmationGmailLink(payment) {
  const reg = payment.registrations || {};
  const part = reg.participants || payment.participants || {};
  const email = part.email || payment.email || '';
  const name = part.name || payment.name || 'Participant';
  const code = reg.registration_code || payment.registration_code || '—';
  const eventLabel = payment.special_event_label || payment.event_label || reg.selected_day || 'CyberSentinel 2K26';

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cybersentinel.in';
  const passLink = `${baseUrl}/check?code=${encodeURIComponent(code)}`;

  const subject = `CyberSentinel 2K26 - Payment Confirmed & Digital Entry Pass (${code})`;
  const body = [
    `Dear ${name},`,
    '',
    `We are pleased to inform you that your payment of ${formatCurrency(payment.amount || 0)} for CyberSentinel 2K26 has been verified and your registration is officially CONFIRMED!`,
    '',
    `📋 REGISTRATION DETAILS:`,
    `• Registration Code: ${code}`,
    `• Event / Track: ${eventLabel}`,
    `• Status: Verified & Confirmed`,
    `• Transaction ID / UTR: ${payment.transaction_id || payment.utr || 'Verified'}`,
    '',
    `🎟️ OFFICIAL DIGITAL ENTRY PASS LINK:`,
    `${passLink}`,
    '',
    `Please present this digital pass or QR code at the entrance gate and event check-in counters.`,
    '',
    `We look forward to seeing you at CyberSentinel 2K26!`,
    '',
    `Warm regards,`,
    `CyberSentinel 2K26 Organizing Committee`,
    `Vel Tech High Tech Dr. Rangarajan Dr. Sakunthala Engineering College`,
  ].join('\n');

  const url = new URL('https://mail.google.com/mail/');
  url.searchParams.set('view', 'cm');
  url.searchParams.set('fs', '1');
  if (email) url.searchParams.set('to', email);
  url.searchParams.set('su', subject);
  url.searchParams.set('body', body);
  return url.toString();
}

export function buildPendingPaymentGmailLink(paymentOrEmail, participantNameArg = 'Participant') {
  let email = '';
  let name = 'Participant';
  let code = '—';
  let eventLabel = 'CyberSentinel 2K26';

  if (typeof paymentOrEmail === 'object' && paymentOrEmail !== null) {
    const reg = paymentOrEmail.registrations || {};
    const part = reg.participants || paymentOrEmail.participants || {};
    email = part.email || paymentOrEmail.email || '';
    name = part.name || paymentOrEmail.name || 'Participant';
    code = reg.registration_code || paymentOrEmail.registration_code || '—';
    eventLabel = paymentOrEmail.special_event_label || paymentOrEmail.event_label || reg.selected_day || 'CyberSentinel 2K26';
  } else {
    email = String(paymentOrEmail || '');
    name = participantNameArg;
  }

  const subject = `Payment Pending - Complete Your CyberSentinel 2K26 Registration (${code})`;
  const body = [
    `Dear ${name},`,
    '',
    `Your registration payment for CyberSentinel 2K26 (${eventLabel}) is currently pending or awaiting verification.`,
    '',
    `• Registration Code: ${code}`,
    `• Event / Track: ${eventLabel}`,
    '',
    `Kindly complete your payment transaction and verify your status on the portal to reserve your official entry pass.`,
    '',
    `If you have already submitted your payment details, our admin team is reviewing your verification proof.`,
    '',
    `Warm regards,`,
    `CyberSentinel 2K26 Organizing Committee`,
    `Vel Tech High Tech College`,
  ].join('\n');

  const url = new URL('https://mail.google.com/mail/');
  url.searchParams.set('view', 'cm');
  url.searchParams.set('fs', '1');
  if (email) url.searchParams.set('to', email);
  url.searchParams.set('su', subject);
  url.searchParams.set('body', body);
  return url.toString();
}

export function buildTeamConfirmationGmailLink(team) {
  const members = team.team_members || [];
  const leader = members.find((m) => m.role === 'LEADER') || members[0] || {};
  const leaderEmail = leader.email || team.team_leader_email || '';
  const leaderName = leader.name || team.team_leader_name || 'Team Leader';
  const teamName = team.team_name || 'Team';
  const teamCode = team.team_code || '—';
  const eventName = team.event_name || team.event_code || 'Event';

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cybersentinel.in';

  const memberPassList = members
    .map((m, idx) => {
      const roleStr = m.role === 'LEADER' ? '👑 Leader' : `Member ${idx + 1}`;
      const nameStr = m.name || 'Participant';
      const codeStr = m.cs_id || 'N/A';
      const passUrl = codeStr !== 'N/A' ? `${baseUrl}/check?code=${encodeURIComponent(codeStr)}` : 'N/A';
      return `${idx + 1}. ${nameStr} (${roleStr} - ${codeStr}):\n   Pass: ${passUrl}`;
    })
    .join('\n\n');

  const subject = `CyberSentinel 2K26 - Team Confirmation & Entry QR Passes (${teamName} - #${teamCode})`;
  const body = [
    `Dear ${leaderName} & Team "${teamName}",`,
    '',
    `Congratulations! Your team "${teamName}" (Code: #${teamCode}) is officially registered and confirmed for ${eventName} at CyberSentinel 2K26!`,
    '',
    `🎟️ OFFICIAL DIGITAL ENTRY QR PASSES FOR ALL TEAM MEMBERS:`,
    '',
    memberPassList || 'Member passes available on portal.',
    '',
    `Please ensure all team members save their respective QR pass links for gate entry and event check-in.`,
    '',
    `Warm regards,`,
    `CyberSentinel 2K26 Organizing Committee`,
    `Vel Tech High Tech College`,
  ].join('\n');

  const url = new URL('https://mail.google.com/mail/');
  url.searchParams.set('view', 'cm');
  url.searchParams.set('fs', '1');
  if (leaderEmail) url.searchParams.set('to', leaderEmail);
  url.searchParams.set('su', subject);
  url.searchParams.set('body', body);
  return url.toString();
}
