import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getCoordinatorAssignedEvents,
  getCoordinatorTeams,
} from '../../services/coordinatorService';
import StatusBadge from '../../components/ui/StatusBadge';
import DetailsModal from '../../components/common/DetailsModal';
import { buildTeamConfirmationGmailLink } from '../../utils/helpers';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Crown,
  Layers,
  ShieldCheck,
  Phone,
  Mail,
  User,
} from 'lucide-react';

export default function CoordinatorTeams() {
  const { user, coordinatorProfile, getCoordinatorClientInstance } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teams, setTeams] = useState([]);
  const [assignedEvents, setAssignedEvents] = useState([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [eventFilter, setEventFilter] = useState('ALL');
  const [selectedTeam, setSelectedTeam] = useState(null);

  const client = getCoordinatorClientInstance();

  const loadData = async () => {
    try {
      setRefreshing(true);
      const coordId = user?.id || coordinatorProfile?.id;
      let normalEvents = [];
      if (coordId) {
        try {
          const eventsData = await getCoordinatorAssignedEvents(client, coordId);
          normalEvents = eventsData.normalEvents || [];
        } catch (evErr) {
          console.warn('Coordinator teams events error:', evErr);
        }
      }
      setAssignedEvents(normalEvents);

      const allTeams = await getCoordinatorTeams(client).catch(() => []);
      setTeams(allTeams || []);
    } catch (err) {
      console.warn('Coordinator teams error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const assignedEventIds = useMemo(() => {
    return new Set(assignedEvents.map((e) => e.id));
  }, [assignedEvents]);

  const assignedEventCodes = useMemo(() => {
    return new Set(assignedEvents.map((e) => (e.code || '').toUpperCase()));
  }, [assignedEvents]);

  const filtered = useMemo(() => {
    return teams.filter((t) => {
      // Must belong to one of the coordinator's assigned events unless coordinator has no specific event filter
      if (assignedEventIds.size > 0) {
        const matchesById = t.event_id && assignedEventIds.has(t.event_id);
        const matchesByCode = t.event_code && assignedEventCodes.has((t.event_code || '').toUpperCase());
        if (!matchesById && !matchesByCode) {
          return false;
        }
      }

      const q = search.trim().toLowerCase();
      const code = (t.team_code || '').toLowerCase();
      const name = (t.team_name || '').toLowerCase();
      const leaderCode = (t.team_leader_registration_code || '').toLowerCase();
      const leaderName = (t.team_leader_name || '').toLowerCase();

      const memberMatch = (t.team_members || []).some(
        (m) =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.cs_id || '').toLowerCase().includes(q)
      );

      const matchesSearch =
        !q ||
        code.includes(q) ||
        name.includes(q) ||
        leaderCode.includes(q) ||
        leaderName.includes(q) ||
        memberMatch;

      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchesEvent =
        eventFilter === 'ALL' ||
        t.event_id === eventFilter ||
        (t.event_code || '').toUpperCase() === (eventFilter || '').toUpperCase();

      return matchesSearch && matchesStatus && matchesEvent;
    });
  }, [teams, assignedEventIds, assignedEventCodes, search, statusFilter, eventFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-cyan" />
            Assigned Event Teams
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Formed teams, leaders, and member rosters participating in your assigned events.
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

      {/* Filters Toolbar */}
      <div className="glass-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search team code, name, leader..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="cyber-input pl-10 text-sm w-full"
            />
          </div>

          {/* Status */}
          <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="cyber-input pl-10 text-sm w-full"
            >
              <option value="ALL">All Statuses</option>
              <option value="FORMING">Forming</option>
              <option value="LOCKED">Locked</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          {/* Event Filter */}
          <div className="relative">
            <Layers className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="cyber-input pl-10 text-sm w-full"
            >
              <option value="ALL">All Assigned Events</option>
              {assignedEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.code} · {ev.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
          <span>Showing {filtered.length} of {teams.length} teams</span>
          {(search || statusFilter !== 'ALL' || eventFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
                setEventFilter('ALL');
              }}
              className="text-brand-cyan hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Teams Grid / Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-brand-cyan" />
            <span>Loading teams...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No teams found for the selected events.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="cyber-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '150px' }}>Team Info</th>
                  <th style={{ minWidth: '150px' }}>Event</th>
                  <th style={{ minWidth: '320px' }}>Team Participants (Phone & Email)</th>
                  <th style={{ minWidth: '100px' }}>Members</th>
                  <th style={{ minWidth: '110px' }}>Status</th>
                  <th className="text-right" style={{ minWidth: '90px' }}>Roster</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((team) => {
                  const memberCount = team.member_count || team.current_members || (team.team_members || []).length;
                  const maxMembers = team.max_members || '—';

                  return (
                    <tr key={team.id}>
                      <td>
                        <div className="font-semibold text-white text-base">{team.team_name}</div>
                        <div className="font-mono text-xs text-brand-cyan mt-0.5">
                          #{team.team_code}
                        </div>
                      </td>
                      <td>
                        <span className="badge-outline text-xs">
                          {team.event_name || team.event_id || '—'}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-col gap-2">
                          {team.team_members && team.team_members.length > 0 ? (
                            team.team_members.map((m, idx) => (
                              <div
                                key={idx}
                                className={`p-2 rounded-lg ${
                                  m.role === 'LEADER'
                                    ? 'bg-cyan-950/40 border border-cyan-500/30'
                                    : 'bg-white/5 border border-white/10'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  {m.role === 'LEADER' ? (
                                    <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  ) : (
                                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  )}
                                  <strong className="text-white text-sm">{m.name || 'Participant'}</strong>
                                  <span
                                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                      m.role === 'LEADER'
                                        ? 'bg-amber-500/20 text-amber-300'
                                        : 'bg-slate-700/40 text-slate-300'
                                    }`}
                                  >
                                    {m.role || 'MEMBER'}
                                  </span>
                                  {m.cs_id && (
                                    <span className="font-mono text-xs text-[#00f0ff]">
                                      ({m.cs_id})
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
                                  {m.phone && (
                                    <a
                                      href={`tel:${m.phone}`}
                                      className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                                      title="Call phone"
                                    >
                                      <Phone className="w-3 h-3" />
                                      <span>{m.phone}</span>
                                    </a>
                                  )}
                                  {m.email && (
                                    <a
                                      href={`mailto:${m.email}`}
                                      className="inline-flex items-center gap-1 text-purple-300 hover:underline"
                                      title="Send email"
                                    >
                                      <Mail className="w-3 h-3" />
                                      <span>{m.email}</span>
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-slate-400">
                              {team.team_leader_registration_code
                                ? `Leader ID: ${team.team_leader_registration_code}`
                                : 'No participants registered yet'}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-200">
                            {memberCount}/{maxMembers}
                          </span>
                          <div className="w-16 bg-cyber-dark/80 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-brand-cyan h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, (memberCount / (team.max_members || 4)) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={team.status} />
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={buildTeamConfirmationGmailLink(team)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost text-xs inline-flex items-center gap-1.5 py-1 px-2.5 text-brand-cyan hover:bg-brand-cyan/10"
                            title="Email Team Leader QR Passes"
                          >
                            <Mail className="w-3.5 h-3.5 text-brand-cyan" />
                            Email Team
                          </a>
                          <button
                            onClick={() => setSelectedTeam(team)}
                            className="btn-ghost text-xs inline-flex items-center gap-1.5 py-1 px-2.5"
                          >
                            <Eye className="w-3.5 h-3.5 text-brand-cyan" />
                            View
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

      {/* Team Details Modal */}
      {selectedTeam && (
        <DetailsModal
          isOpen={!!selectedTeam}
          onClose={() => setSelectedTeam(null)}
          title={`Team: ${selectedTeam.team_name} (#${selectedTeam.team_code})`}
          data={{
            team_code: selectedTeam.team_code,
            team_name: selectedTeam.team_name,
            event: selectedTeam.event_name || selectedTeam.event_id,
            status: selectedTeam.status,
            leader_cs_id: selectedTeam.team_leader_registration_code,
            leader_name: selectedTeam.team_leader_name || 'N/A',
            members_count: `${(selectedTeam.team_members || []).length} / ${selectedTeam.max_members || '—'}`,
            members_roster: (selectedTeam.team_members || [])
              .map((m) => `${m.role === 'LEADER' ? '👑 ' : ''}${m.name || 'Member'} (${m.cs_id || 'ID missing'})`)
              .join('; ') || 'No members joined yet',
          }}
        />
      )}
    </div>
  );
}
