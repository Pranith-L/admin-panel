import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Mail,
  Copy,
  Check,
  ExternalLink,
  Download,
  Users,
  QrCode,
  ShieldCheck,
  Calendar,
  MapPin,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import { Modal } from './Modal';
import { useToast } from '../../context/ToastContext';
import { buildTeamConfirmationGmailLink } from '../../utils/helpers';

export function TeamEmailModal({ isOpen, onClose, team }) {
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [memberQrUrls, setMemberQrUrls] = useState({});
  const [generatingQr, setGeneratingQr] = useState(true);

  const members = team?.team_members || [];
  const leader = members.find((m) => m.role === 'LEADER') || members[0] || {};
  const leaderEmail = leader.email || team?.team_leader_email || '';
  const leaderName = leader.name || team?.team_leader_name || 'Team Leader';
  const teamName = team?.team_name || 'Team';
  const teamCode = team?.team_code || '—';
  const eventName = team?.event_name || team?.event_code || 'Registered Event';
  const eventDay = team?.event_day || team?.day || 'Day 1 / Day 2';
  const venue = team?.venue || 'Main Auditorium & Labs, Vel Tech High Tech Campus';

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cybersentinel.in';

  // Generate high quality QR code data URLs for each team member
  useEffect(() => {
    if (!isOpen || !members.length) {
      setMemberQrUrls({});
      return;
    }

    let isMounted = true;
    setGeneratingQr(true);

    async function generateAllQrs() {
      const urls = {};
      for (const m of members) {
        const qrContent = m.cs_id || `${teamCode}-${m.name}`;
        try {
          const dataUrl = await QRCode.toDataURL(qrContent, {
            width: 320,
            margin: 2,
            color: {
              dark: '#050b18',
              light: '#ffffff',
            },
            errorCorrectionLevel: 'M',
          });
          urls[m.cs_id || m.name] = dataUrl;
        } catch (err) {
          console.error(`Failed to generate QR for ${m.name}:`, err);
        }
      }
      if (isMounted) {
        setMemberQrUrls(urls);
        setGeneratingQr(false);
      }
    }

    generateAllQrs();
    return () => {
      isMounted = false;
    };
  }, [isOpen, team]);

  if (!team) return null;

  // Build Rich HTML for direct pasting into Gmail/Outlook with inline QR images
  const buildRichHtmlEmail = () => {
    const memberRows = members
      .map((m, idx) => {
        const roleStr = m.role === 'LEADER' ? '👑 TEAM LEADER' : `MEMBER ${idx + 1}`;
        const nameStr = m.name || 'Participant';
        const codeStr = m.cs_id || 'N/A';
        const qrDataUrl = memberQrUrls[codeStr || nameStr] || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(codeStr)}`;
        const passUrl = codeStr !== 'N/A' ? `${baseUrl}/check?code=${encodeURIComponent(codeStr)}` : '#';

        return `
          <div style="background:#0a1226; border:1px solid #1e293b; border-radius:12px; padding:18px; margin-bottom:18px; text-align:center;">
            <div style="display:inline-block; background:${m.role === 'LEADER' ? '#7000ff' : '#00f0ff'}; color:#ffffff; font-weight:bold; font-size:11px; padding:3px 10px; border-radius:20px; text-transform:uppercase; margin-bottom:8px;">
              ${roleStr}
            </div>
            <h3 style="color:#ffffff; margin:4px 0 6px 0; font-size:18px; font-weight:bold;">${nameStr}</h3>
            <p style="color:#94a3b8; margin:0 0 12px 0; font-size:14px; font-family:monospace;">Registration ID: <strong style="color:#00f0ff;">${codeStr}</strong></p>
            
            <!-- DIRECT EMBEDDED QR CODE IMAGE -->
            <div style="background:#ffffff; padding:12px; border-radius:10px; display:inline-block; margin:8px auto; box-shadow:0 4px 12px rgba(0,0,0,0.3);">
              <img src="${qrDataUrl}" width="160" height="160" alt="QR Pass for ${nameStr}" style="display:block; border:none;" />
            </div>

            <p style="color:#64748b; font-size:12px; margin:8px 0 0 0;">
              Entry Pass Link: <a href="${passUrl}" style="color:#38bdf8; text-decoration:none;">${passUrl}</a>
            </p>
          </div>
        `;
      })
      .join('');

    return `
      <div style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width:680px; margin:0 auto; background:#040814; color:#f8fafc; border:1px solid #1e293b; border-radius:16px; overflow:hidden;">
        <!-- Header Banner -->
        <div style="background:linear-gradient(135deg, #070d1f 0%, #17113a 50%, #081a2e 100%); padding:28px 24px; text-align:center; border-bottom:2px solid #00f0ff;">
          <h1 style="color:#00f0ff; margin:0 0 6px 0; font-size:24px; letter-spacing:1px; text-transform:uppercase;">CYBERSENTINEL 2K26</h1>
          <p style="color:#94a3b8; margin:0; font-size:13px; font-weight:500;">National Level Technical Symposium | Vel Tech High Tech College</p>
          <div style="margin-top:14px; display:inline-block; background:rgba(0,240,255,0.15); border:1px solid #00f0ff; color:#00f0ff; font-weight:bold; font-size:12px; padding:5px 14px; border-radius:30px;">
            OFFICIAL REGISTRATION ACKNOWLEDGMENT & PASSES
          </div>
        </div>

        <!-- Body Content -->
        <div style="padding:28px 24px;">
          <h2 style="color:#ffffff; font-size:20px; margin:0 0 12px 0;">Dear ${leaderName} & Team "${teamName}",</h2>
          <p style="color:#cbd5e1; font-size:15px; line-height:1.6; margin:0 0 20px 0;">
            Congratulations! We are pleased to formally acknowledge and confirm that your team has successfully registered for the competition <strong style="color:#00f0ff;">"${eventName}"</strong> at CyberSentinel 2K26.
          </p>

          <!-- Team Details Box -->
          <div style="background:#091024; border:1px solid #1d2d50; border-radius:12px; padding:18px; margin-bottom:24px;">
            <h3 style="color:#38bdf8; font-size:15px; margin:0 0 12px 0; text-transform:uppercase; letter-spacing:0.5px;">📋 Official Registration Summary</h3>
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <tr>
                <td style="color:#94a3b8; padding:5px 0; width:40%;">Event / Competition:</td>
                <td style="color:#ffffff; font-weight:bold; padding:5px 0;">${eventName} (${eventDay})</td>
              </tr>
              <tr>
                <td style="color:#94a3b8; padding:5px 0;">Team Name:</td>
                <td style="color:#ffffff; font-weight:bold; padding:5px 0;">${teamName}</td>
              </tr>
              <tr>
                <td style="color:#94a3b8; padding:5px 0;">Official Team Code:</td>
                <td style="color:#00f0ff; font-family:monospace; font-weight:bold; padding:5px 0;">#${teamCode}</td>
              </tr>
              <tr>
                <td style="color:#94a3b8; padding:5px 0;">Team Leader:</td>
                <td style="color:#ffffff; font-weight:bold; padding:5px 0;">${leaderName} (${leaderEmail})</td>
              </tr>
              <tr>
                <td style="color:#94a3b8; padding:5px 0;">Total Registered Members:</td>
                <td style="color:#ffffff; font-weight:bold; padding:5px 0;">${members.length} / ${team?.max_members || members.length || 4}</td>
              </tr>
              <tr>
                <td style="color:#94a3b8; padding:5px 0;">Registration Status:</td>
                <td style="color:#10b981; font-weight:bold; padding:5px 0;">CONFIRMED & VERIFIED ✅</td>
              </tr>
              <tr>
                <td style="color:#94a3b8; padding:5px 0;">Venue:</td>
                <td style="color:#ffffff; font-weight:bold; padding:5px 0;">${venue}</td>
              </tr>
            </table>
          </div>

          <!-- Member QR Passes Section -->
          <h3 style="color:#00f0ff; font-size:16px; margin:0 0 14px 0; text-transform:uppercase; letter-spacing:0.5px;">
            🎟️ Official Digital Entry QR Passes for Team Members
          </h3>
          <p style="color:#94a3b8; font-size:13px; margin:0 0 16px 0;">
            Every team member must present their unique digital QR pass at the entrance registration desk and competition arena.
          </p>

          ${memberRows}

          <!-- Guidelines Box -->
          <div style="background:#070d1d; border-left:4px solid #f59e0b; padding:16px 18px; margin:24px 0; border-radius:0 10px 10px 0;">
            <h4 style="color:#f59e0b; font-size:14px; margin:0 0 8px 0; text-transform:uppercase;">📌 Mandatory Symposium Day Instructions:</h4>
            <ol style="color:#cbd5e1; font-size:13px; line-height:1.6; margin:0; padding-left:18px;">
              <li><strong>Check-in & Badge:</strong> Scan your digital QR pass at the entrance registration desk to collect your physical delegate pass and food coupon.</li>
              <li><strong>College ID:</strong> All participants must carry their original College Identity Card.</li>
              <li><strong>Reporting Time:</strong> All team members must report to the campus auditorium by <strong>8:30 AM IST</strong> for briefing.</li>
              <li><strong>Team Attendance:</strong> All members must be present together for team verification before rounds begin.</li>
            </ol>
          </div>

          <p style="color:#cbd5e1; font-size:14px; line-height:1.6;">
            We look forward to seeing your team demonstrate excellence at CyberSentinel 2K26. If you have any questions, feel free to reply directly to this email.
          </p>

          <div style="margin-top:28px; padding-top:18px; border-top:1px solid #1e293b; color:#94a3b8; font-size:13px;">
            <p style="margin:0 0 4px 0; color:#ffffff; font-weight:bold;">CyberSentinel 2K26 Organizing Committee</p>
            <p style="margin:0 0 2px 0;">Department of Computer Science & Engineering</p>
            <p style="margin:0;">Vel Tech High Tech Dr. Rangarajan Dr. Sakunthala Engineering College, Avadi, Chennai - 600062</p>
          </div>
        </div>
      </div>
    `;
  };

  // Plain text email string for fallback and Gmail URL
  const buildPlainTextEmail = () => {
    const memberText = members
      .map((m, idx) => {
        const roleStr = m.role === 'LEADER' ? '👑 TEAM LEADER' : `MEMBER ${idx + 1}`;
        const nameStr = m.name || 'Participant';
        const codeStr = m.cs_id || 'N/A';
        const qrImageUrl = codeStr !== 'N/A'
          ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(codeStr)}`
          : 'N/A';
        const passUrl = codeStr !== 'N/A' ? `${baseUrl}/check?code=${encodeURIComponent(codeStr)}` : 'N/A';

        return [
          `------------------------------------------------------------`,
          `👤 ${idx + 1}. ${nameStr.toUpperCase()} [${roleStr}]`,
          `   • Registration Code: ${codeStr}`,
          `   • Direct QR Code Image: ${qrImageUrl}`,
          `   • Digital Pass URL: ${passUrl}`,
          `------------------------------------------------------------`,
        ].join('\n');
      })
      .join('\n\n');

    return [
      `================================================================================`,
      `CYBERSENTINEL 2K26 — NATIONAL LEVEL TECHNICAL SYMPOSIUM`,
      `Department of Computer Science and Engineering`,
      `Vel Tech High Tech Dr. Rangarajan Dr. Sakunthala Engineering College`,
      `================================================================================`,
      '',
      `OFFICIAL REGISTRATION ACKNOWLEDGMENT & CONFIRMATION`,
      '',
      `Dear ${leaderName} & Team "${teamName}",`,
      '',
      `We are pleased to formally acknowledge and confirm that your team has successfully registered for the competition "${eventName}" at CyberSentinel 2K26!`,
      '',
      `Your team registration is officially verified and confirmed in our symposium registry. Below are the complete team details, event schedule, and digital entry QR passes for all team members.`,
      '',
      `📋 TEAM & EVENT DETAILS:`,
      `• Event / Competition: ${eventName} (${eventDay})`,
      `• Team Name: ${teamName}`,
      `• Official Team Code: #${teamCode}`,
      `• Team Leader: ${leaderName} (${leaderEmail})`,
      `• Registered Members: ${members.length} / ${team?.max_members || members.length || 4}`,
      `• Registration Status: CONFIRMED & VERIFIED ✅`,
      `• Venue: ${venue}`,
      '',
      `🎟️ OFFICIAL DIGITAL ENTRY QR PASSES (ALL MEMBERS):`,
      `Each team member must present their QR pass for gate entry and event check-in:`,
      '',
      memberText,
      '',
      `📌 MANDATORY SYMPOSIUM GUIDELINES & INSTRUCTIONS:`,
      `1. GATE ENTRY & VERIFICATION: Present your digital QR pass (on mobile or printed) at the entrance registration desk to collect your delegate badge and food coupon.`,
      `2. COLLEGE ID MANDATORY: Every team member must carry their valid College Identity Card.`,
      `3. REPORTING TIME: All team members are requested to report to the campus auditorium by 8:30 AM IST for team verification and event briefing.`,
      `4. TEAM COORDINATION: The team leader is responsible for coordinating all team members throughout the rounds and evaluations.`,
      `5. CODE OF CONDUCT: Fair play and professional conduct are mandatory. The organizing committee's decision is final.`,
      '',
      `📞 NEED ASSISTANCE?`,
      `• Helpdesk: Registration Arena, Campus Auditorium`,
      `• Official Portal: ${baseUrl}`,
      `• Email: contact@cybersentinel.in`,
      '',
      `We look forward to seeing your team excel at CyberSentinel 2K26!`,
      '',
      `Warm regards,`,
      `Organizing Committee — CyberSentinel 2K26`,
      `Department of Computer Science & Engineering`,
      `Vel Tech High Tech Dr. Rangarajan Dr. Sakunthala Engineering College`,
      `Avadi, Chennai - 600062`,
    ].join('\n');
  };

  const copyRichEmail = async () => {
    try {
      const richHtml = buildRichHtmlEmail();
      const plainText = buildPlainTextEmail();

      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html': new Blob([richHtml], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      addToast({
        title: 'Email Copied with QR Codes!',
        message: 'Formatted team acknowledgment with QR code images copied! You can paste (Ctrl+V / Cmd+V) directly into Gmail.',
        type: 'success',
      });
    } catch (err) {
      console.warn('Clipboard write error:', err);
      try {
        await navigator.clipboard.writeText(buildPlainTextEmail());
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
        addToast({
          title: 'Email Text Copied',
          message: 'Team acknowledgment copied to clipboard.',
          type: 'success',
        });
      } catch (clipErr) {
        addToast({
          title: 'Copy Failed',
          message: 'Could not access clipboard. Please copy manually from the preview.',
          type: 'error',
        });
      }
    }
  };

  const handleCopyAndOpenGmail = async () => {
    await copyRichEmail();
    const gmailUrl = buildTeamConfirmationGmailLink(team);
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadQr = (codeStr, nameStr) => {
    const dataUrl = memberQrUrls[codeStr || nameStr];
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `CyberSentinel_QR_${codeStr || nameStr}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    addToast({
      title: 'QR Code Downloaded',
      message: `Downloaded QR pass for ${nameStr}.`,
      type: 'success',
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Team Email & QR Passes: ${teamName} (#${teamCode})`}
      maxWidth="780px"
    >
      <div className="space-y-6 text-left">
        {/* Recipient & Subject Header Bar */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Recipient:</span>
              <span className="text-sm font-bold text-white truncate">{leaderEmail || 'No email provided'}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-brand-cyan border border-cyan-500/40 font-semibold">
                👑 Team Leader
              </span>
            </div>
            <div className="text-xs text-slate-300 truncate">
              <span className="text-slate-400 font-semibold">Subject: </span>
              CyberSentinel 2K26 — Official Team Registration Acknowledgment & Entry QR Passes: {teamName} ({eventName})
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyAndOpenGmail}
              className="btn-primary text-xs font-bold py-2 px-3.5 flex items-center gap-1.5 shadow-glow"
              title="Copies formatted email with QR code images and opens Gmail compose"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy & Open Gmail'}</span>
            </button>

            <a
              href={buildTeamConfirmationGmailLink(team)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs font-bold py-2 px-3 flex items-center gap-1.5 text-slate-200"
              title="Open Gmail compose directly"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Gmail</span>
            </a>
          </div>
        </div>

        {/* Tip Box */}
        <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-start gap-2.5 text-xs text-cyan-200">
          <Info className="w-4 h-4 text-brand-cyan shrink-0 mt-0.5" />
          <span>
            <strong>Direct QR Code Pasting:</strong> Clicking <strong>"Copy & Open Gmail"</strong> puts the full acknowledgment letter with the <strong>actual visual QR code images</strong> directly on your clipboard. When Gmail opens, simply press <strong>Ctrl+V (or Cmd+V)</strong> to paste the QR codes right into your email!
          </span>
        </div>

        {/* Visual Team Pass & QR Cards Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-wider text-brand-cyan flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Team Members & Scannable QR Passes ({members.length})
            </h4>
            <span className="text-xs text-slate-400 font-medium">
              Event: <strong className="text-white">{eventName}</strong>
            </span>
          </div>

          {generatingQr ? (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 text-center text-slate-400 text-sm">
              Generating scannable QR passes...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {members.map((m, idx) => {
                const isLeader = m.role === 'LEADER';
                const codeStr = m.cs_id || 'N/A';
                const qrUrl = memberQrUrls[codeStr || m.name];

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border transition-all ${
                      isLeader
                        ? 'bg-purple-950/20 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                        : 'bg-white/[0.03] border-white/10 hover:border-cyan-500/40'
                    } flex flex-col justify-between`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isLeader
                              ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {isLeader ? '👑 Team Leader' : `Member ${idx + 1}`}
                        </span>
                        <span className="font-mono text-xs font-bold text-brand-cyan">
                          {codeStr}
                        </span>
                      </div>

                      <h5 className="text-base font-bold text-white mb-1">{m.name}</h5>
                      {m.email && <p className="text-xs text-slate-400 truncate mb-3">{m.email}</p>}

                      {/* Rendered Visual QR Code */}
                      <div className="my-2 p-2 bg-white rounded-xl inline-block mx-auto shadow-md">
                        {qrUrl ? (
                          <img
                            src={qrUrl}
                            alt={`QR for ${m.name}`}
                            className="w-32 h-32 block mx-auto object-contain"
                          />
                        ) : (
                          <div className="w-32 h-32 flex items-center justify-center text-xs text-slate-500">
                            Loading QR...
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/10 mt-3 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400 font-mono">
                        Pass: {codeStr}
                      </span>
                      {qrUrl && (
                        <button
                          type="button"
                          onClick={() => handleDownloadQr(codeStr, m.name)}
                          className="text-xs text-brand-cyan hover:underline flex items-center gap-1 font-bold"
                          title="Download PNG QR pass"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Full Formatted Letter Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Acknowledgment Message Preview
            </h4>
            <button
              type="button"
              onClick={copyRichEmail}
              className="text-xs text-brand-cyan hover:underline flex items-center gap-1 font-semibold"
            >
              <Copy className="w-3 h-3" />
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Formatted Text'}</span>
            </button>
          </div>

          <div className="p-4 rounded-xl bg-black/50 border border-white/10 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
            {buildPlainTextEmail()}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            All passes are verified and linked to CyberSentinel 2K26 gate attendance scanner.
          </span>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs font-bold py-2.5 px-4"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleCopyAndOpenGmail}
              className="btn-primary text-xs font-bold py-2.5 px-5 flex items-center gap-2 shadow-glow"
            >
              <Mail className="w-4 h-4" />
              <span>Copy Email & Open Gmail</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default TeamEmailModal;
