import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import '../../components/common/Sidebar.css';
import { useAuth } from '../../context/AuthContext';
import useCoordinatorAssignedEvents from '../../hooks/useCoordinatorAssignedEvents';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Users2,
  UserCheck,
  Megaphone,
  Mail,
  FileSpreadsheet,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  Diamond,
  ExternalLink,
} from 'lucide-react';

export default function CoordinatorLayout() {
  const { coordinatorProfile, user, isCoordinatorLoading, coordinatorLogout, getCoordinatorClientInstance } =
    useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const coordinatorId = coordinatorProfile?.email || coordinatorProfile?.id || user?.id || null;
  const { assignedEvents, primaryEventName, eventsLoading } = useCoordinatorAssignedEvents(
    getCoordinatorClientInstance(),
    coordinatorId
  );

  const navigate = useNavigate();

  if (isCoordinatorLoading) {
    return (
      <div className="min-h-screen bg-[#060814] flex items-center justify-center text-brand-cyan font-heading text-lg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-brand-cyan border-t-transparent rounded-full animate-spin"></div>
          <span>Authenticating Coordinator...</span>
        </div>
      </div>
    );
  }

  if (!coordinatorProfile) {
    return <Navigate to="/coordinator/login" replace />;
  }

  async function handleLogout() {
    await coordinatorLogout();
    navigate('/coordinator/login');
  }

  const navLinks = [
    { to: '/coordinator/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/coordinator/participants', label: 'Participants', icon: Users },
    { to: '/coordinator/payments', label: 'Payments', icon: CreditCard },
    { to: '/coordinator/teams', label: 'Teams', icon: Users2 },
    { to: '/coordinator/attendance', label: 'Attendance Scanner', icon: UserCheck },
    { to: '/coordinator/emails', label: 'Emails', icon: Mail },
    { to: '/coordinator/reports', label: 'Reports', icon: FileSpreadsheet },
  ];

  const coordName = coordinatorProfile.name || coordinatorProfile.email?.split('@')[0] || 'Coordinator';
  const initial = coordName.charAt(0).toUpperCase();
  const assignedEventNames = assignedEvents.map((evt) => evt.name).filter(Boolean);

  return (
    <div className="cs-shell bg-[#060814] text-slate-100 font-sans">
      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="cs-drawer-backdrop lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Fixed Vertical Navigation Sidebar */}
      <aside
        className={`cs-sidebar cs-sidebar-drawer ${sidebarOpen ? 'cs-drawer-open' : ''} fixed top-0 bottom-0 left-0 z-50 backdrop-blur-2xl flex flex-col`}
        aria-label="Coordinator navigation"
      >
        {/* Brand Block */}
        <div className="cs-brand">
          <Link to="/coordinator/dashboard" className="cs-brand-link group">
            <div className="cs-brand-logo">
              <img src="/assets/cybersentinel_crest_logo.jpg" alt="Cyber Sentinel 2K26" />
            </div>

            <div className="cs-brand-text">
              <span className="cs-brand-name">CYBERSENTINEL</span>
              <span className="cs-brand-role">COORDINATOR</span>
            </div>
          </Link>

          {/* Mobile Close Button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden cs-icon-button"
            style={{ width: '36px', height: '36px', flexShrink: 0 }}
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="cs-sidebar-nav cs-sidebar-pattern">
          <div className="cs-sidebar-nav-group">Command Deck</div>
          {navLinks.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/coordinator/dashboard'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `cs-sidebar-nav-item cs-nav-module ${isActive ? 'active' : ''}`}
              >
                <Icon className="cs-nav-icon" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Identity, Portal Hub Link & Logout */}
        <div className="cs-sidebar-footer">
          <div className="cs-coord-id cs-nav-module">
            <span className="cs-coord-avatar">{initial}</span>
            <span className="cs-coord-meta">
              <span className="cs-coord-name">{coordName}</span>
              <span className="cs-coord-role">Coordinator</span>
            </span>
          </div>

          <Link to="/" target="_blank" className="cs-sidebar-nav-item cs-nav-module w-full">
            <ExternalLink className="cs-nav-icon" />
            <span>Public Portal</span>
          </Link>

          <button onClick={handleLogout} className="cs-sidebar-nav-item cs-nav-module cs-nav-danger w-full">
            <LogOut className="cs-nav-icon" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area: begins strictly after the sidebar */}
      <div className="cs-main">
        {/* Top Header — left: command node, center: assigned event, right: secure access */}
        <header className="cs-topbar">
          <div className="cs-topbar-left">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden cs-icon-button"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Cyber Sentinel Command Node Indicator */}
            <div className="cs-command-node">
              <span className="cs-pulse-dot" aria-hidden="true"></span>
              <span className="cs-command-label">
                <span className="cs-command-prefix">CYBERSENTINEL // </span>COMMAND NODE
              </span>
            </div>
          </div>

          {/* Dynamic assigned event name for the logged-in coordinator */}
          <div className="cs-topbar-center">
            <div
              className="cs-event-title"
              title={
                assignedEventNames.length
                  ? `Assigned: ${assignedEventNames.join(', ')}`
                  : 'No event assigned yet'
              }
            >
              <span className="cs-event-rule" aria-hidden="true"></span>
              <Diamond className="cs-event-diamond w-3.5 h-3.5" aria-hidden="true" />
              <span className="cs-event-title-text">
                {eventsLoading ? 'Syncing Scope' : primaryEventName || 'Unassigned Scope'}
              </span>
              {assignedEvents.length > 1 && (
                <span className="cs-event-count">+{assignedEvents.length - 1}</span>
              )}
              <Diamond className="cs-event-diamond w-3.5 h-3.5" aria-hidden="true" />
              <span className="cs-event-rule cs-event-rule-right" aria-hidden="true"></span>
            </div>
          </div>

          {/* Security status badge only — no clock, no empty container */}
          <div className="cs-topbar-right">
            <span className="cs-secure-badge">
              <ShieldCheck className="w-4 h-4" />
              <span>Secure Access</span>
            </span>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="cs-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
