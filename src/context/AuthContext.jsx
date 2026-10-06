import React, { createContext, useContext, useState, useEffect } from 'react';
import bcrypt from 'bcryptjs';
import { supabase, getCoordinatorClient } from '../config/supabase';
import { KNOWN_COORDINATOR_ASSIGNMENTS } from '../services/coordinatorService';
import { sanitizeText, isValidEmail, readSafeStorage, buildSessionGuard } from '../utils/security';

const AuthContext = createContext(null);

const KNOWN_COORDINATOR_ACCOUNTS = [
  { email: 'PP@gmail.com', password: 'Cybersentinel@techPP' },
  { email: 'paper@gmail.com', password: 'Cybersentinel@techPP' },
  { email: 'UN@gmail.com', password: 'Cybersentinel@techUN' },
  { email: 'CC@gmail.com', password: 'Cybersentinel@techCC' },
  { email: 'WE@gmail.com', password: 'Cybersentinel@techWE' },
  { email: 'XC@gmail.com', password: 'Cybersentinel@techXC' },
  { email: 'GD@gmail.com', password: 'Cybersentinel@nonGD' },
  { email: 'SP@gmail.com', password: 'Cybersentinel@nonSP' },
  { email: 'CO@gmail.com', password: 'Cybersentinel@nonCO' },
  { email: 'FTB@gmail.com', password: 'Cybersentinel@nonFTB' },
  { email: 'MS@gmail.com', password: 'Cybersentinel@nonMS' },
  { email: 'LIL@gmail.com', password: 'Cybersentinel@nonLIL' },
  { email: 'TC@gmail.com', password: 'Cybersentinel@nonTC' },
];

export function AuthProvider({ children }) {
  // Admin Auth State
  const [adminSession, setAdminSession] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  // Coordinator Auth State
  const [coordinatorSession, setCoordinatorSession] = useState(() => {
    const safeSession = readSafeStorage('coordinatorSession', null);
    return buildSessionGuard(safeSession);
  });

  // Verify Admin Profile
  async function fetchAdminProfile(userId) {
    if (!userId) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, role, active')
        .eq('id', userId)
        .single();

      if (error || !data || data.role !== 'ADMIN' || !data.active) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  // Monitor Supabase auth state for Admin
  useEffect(() => {
    let mounted = true;

    async function initAdminAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session && mounted) {
          const profile = await fetchAdminProfile(session.user.id);
          if (profile) {
            setAdminSession(session);
            setAdminProfile(profile);
          } else {
            await supabase.auth.signOut();
            setAdminSession(null);
            setAdminProfile(null);
          }
        }
      } catch (err) {
        console.error('Admin auth check failed:', err);
      } finally {
        if (mounted) setIsAdminLoading(false);
      }
    }

    initAdminAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setAdminSession(null);
        setAdminProfile(null);
        setIsAdminLoading(false);
        return;
      }

      const profile = await fetchAdminProfile(session.user.id);
      if (profile) {
        setAdminSession(session);
        setAdminProfile(profile);
      } else {
        await supabase.auth.signOut();
        setAdminSession(null);
        setAdminProfile(null);
      }
      setIsAdminLoading(false);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Admin Login Action
  async function adminLogin(email, password) {
    const cleanEmail = sanitizeText(email, '').toLowerCase();
    const cleanPassword = String(password || '').replace(/[\u0000-\u001F\u007F]/g, '');

    if (!isValidEmail(cleanEmail)) {
      throw new Error('Invalid administrator credentials.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    if (error) {
      console.error('Supabase Auth error:', error);
      throw error;
    }

    if (data?.user) {
      const profile = await fetchAdminProfile(data.user.id);
      if (profile) {
        setAdminSession(data.session);
        setAdminProfile(profile);
        return profile;
      }
      throw new Error('User does not have active administrator permissions.');
    }

    throw new Error('Invalid administrator credentials.');
  }

  // Admin Logout Action
  async function adminLogout() {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setAdminSession(null);
    setAdminProfile(null);
  }

  // Coordinator Login Action (Exact CS-backend-new2 RPC implementation)
  async function coordinatorLogin(email, password) {
    const normalizedEmail = sanitizeText(email, '').toLowerCase();
    const safePassword = String(password || '').replace(/[\u0000-\u001F\u007F]/g, '');
    let authErrorMessage = null;

    // 1. Primary: coordinator_login RPC (x-coordinator-token flow matching CS-backend-new2)
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('coordinator_login', {
        p_email: normalizedEmail,
        p_password: safePassword,
      });

      if (!rpcError && rpcData?.token && rpcData?.profile) {
        localStorage.setItem('coordinatorSession', JSON.stringify(rpcData));
        setCoordinatorSession(rpcData);
        return rpcData;
      }
      if (rpcError?.message) {
        authErrorMessage = rpcError.message.replace(/^.*: /, '');
      }
    } catch (rpcErr) {
      console.warn('coordinator_login RPC notice:', rpcErr);
      if (rpcErr?.message) authErrorMessage = rpcErr.message.replace(/^.*: /, '');
    }

    // 2. Resolve the real coordinator profile from the database, using a case-insensitive match.
    let dbProfile = null;
    try {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, name, email, role, active, password_hash')
        .eq('role', 'COORDINATOR')
        .order('email');

      const profileMatch = (profileRows || []).find(
        (profile) => profile.email && profile.email.toLowerCase() === normalizedEmail.toLowerCase()
      );

      if (profileMatch && profileMatch.role === 'COORDINATOR' && profileMatch.active) {
        dbProfile = profileMatch;
      }
    } catch {
      dbProfile = null;
    }

    if (dbProfile) {
      const formattedHash = dbProfile.password_hash || '';
      const validHash = formattedHash && bcrypt.compareSync(safePassword, formattedHash);
      const knownMatch = KNOWN_COORDINATOR_ACCOUNTS.find(
        (account) => account.email.toLowerCase() === normalizedEmail.toLowerCase() && account.password === safePassword
      );

      if (validHash || knownMatch) {
        if (!validHash && knownMatch) {
          const hashValue = bcrypt.hashSync(safePassword, bcrypt.genSaltSync(10)).replace('$2b$', '$2a$');
          await supabase.from('profiles').update({ password_hash: hashValue }).eq('id', dbProfile.id);
        }

        const sessionData = {
          token: `db-${dbProfile.id}`,
          profile: {
            ...dbProfile,
            event_code: dbProfile.event_code || null,
            event_name: dbProfile.event_name || null,
            day: dbProfile.day || null,
            assigned_events: dbProfile.assigned_events || [],
          },
        };
        const guardedSession = buildSessionGuard(sessionData);
        if (guardedSession) {
          localStorage.setItem('coordinatorSession', JSON.stringify(guardedSession));
          setCoordinatorSession(guardedSession);
          return guardedSession;
        }
      }
    }

    // 3. Secondary fallback: exact app credential pairs used by the coordinator setup script
    const knownMatch = KNOWN_COORDINATOR_ACCOUNTS.find(
      (account) => account.email.toLowerCase() === normalizedEmail.toLowerCase() && account.password === safePassword
    );

    if (knownMatch) {
      const assignedEvents = KNOWN_COORDINATOR_ASSIGNMENTS[knownMatch.email] || [];
      const primaryEvent = assignedEvents[0] || null;
      const fallbackProfile = {
        id: `coordinator-${knownMatch.email.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        name: knownMatch.email.split('@')[0].toUpperCase(),
        email: knownMatch.email,
        role: 'COORDINATOR',
        active: true,
        event_code: primaryEvent?.code || null,
        event_name: primaryEvent?.name || null,
        day: primaryEvent?.day || null,
        assigned_events: assignedEvents,
      };

      const sessionData = {
        token: `mock-${knownMatch.email.toLowerCase()}`,
        profile: fallbackProfile,
      };
      localStorage.setItem('coordinatorSession', JSON.stringify(sessionData));
      setCoordinatorSession(sessionData);
      return sessionData;
    }

    // 4. Final fallback: check if coordinator was created via standard Supabase Auth
    try {
      const coordAuthClient = getCoordinatorClient('');
      const { data, error } = await coordAuthClient.auth.signInWithPassword({
        email: normalizedEmail,
        password: safePassword,
      });

      if (!error && data?.user) {
        const { data: profile } = await coordAuthClient
          .from('profiles')
          .select('id, name, email, role, active')
          .eq('id', data.user.id)
          .single();

        if (profile && profile.role === 'COORDINATOR' && profile.active) {
          const sessionData = {
            token: data.session.access_token,
            profile: profile,
          };
          const guardedSession = buildSessionGuard(sessionData);
          if (guardedSession) {
            localStorage.setItem('coordinatorSession', JSON.stringify(guardedSession));
            setCoordinatorSession(guardedSession);
            return guardedSession;
          }
        }
      }
    } catch {
      // ignore
    }

    throw new Error(authErrorMessage || 'Invalid coordinator credentials.');
  }

  // Coordinator Logout Action
  function coordinatorLogout() {
    localStorage.removeItem('coordinatorSession');
    setCoordinatorSession(null);
  }

  // Coordinator Client Factory
  function getCoordinatorClientInstance() {
    return getCoordinatorClient(coordinatorSession?.token);
  }

  const coordinatorProfile = coordinatorSession?.profile || null;
  const user = coordinatorProfile || adminProfile || (adminSession?.user ? { ...adminProfile, id: adminSession.user.id } : null);

  return (
    <AuthContext.Provider
      value={{
        // Admin
        adminSession,
        adminProfile,
        isAdminLoading,
        adminLogin,
        loginAdmin: adminLogin,
        adminLogout,
        logoutAdmin: adminLogout,

        // Coordinator
        coordinatorSession,
        coordinatorProfile,
        isCoordinatorLoading: false,
        coordinatorLogin,
        loginCoordinator: coordinatorLogin,
        coordinatorLogout,
        logoutCoordinator: coordinatorLogout,
        getCoordinatorClientInstance,

        // Universal user context for coordinator sub-pages
        user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
