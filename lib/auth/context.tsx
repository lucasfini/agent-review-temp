"use client";

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { isDemoUser } from '@/lib/demo-mode';

const devConfirmedSignupEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_CONFIRMED_SIGNUP === 'true';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDemoMode: boolean;
  signUp: (email: string, password: string, name?: string, nextPath?: string | null) => Promise<{ data: any; error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: (nextPath?: string | null) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const accountSetupKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const ensureAccountSetup = async (activeSession: Session | null) => {
      if (!activeSession?.access_token || !activeSession.user || isDemoUser(activeSession.user)) {
        return;
      }

      const setupKey = `${activeSession.user.id}:${activeSession.access_token}`;
      if (accountSetupKeyRef.current === setupKey) {
        return;
      }
      accountSetupKeyRef.current = setupKey;

      try {
        const authHeaders = {
          Authorization: `Bearer ${activeSession.access_token}`,
        };

        await Promise.all([
          fetch('/api/billing/welcome-bonus', {
            method: 'POST',
            headers: authHeaders,
          }),
          fetch('/api/projects/starter/ensure', {
            method: 'POST',
            headers: authHeaders,
          }),
        ]);
      } catch (error) {
        accountSetupKeyRef.current = null;
        console.warn('[AUTH] Failed to ensure account setup:', error);
      }
    };

    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      void ensureAccountSetup(session);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (!session?.user) {
          accountSetupKeyRef.current = null;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          try {
            const getCookie = (name: string) => {
              if (typeof document === 'undefined') return null;
              const value = `; ${document.cookie}`;
              const parts = value.split(`; ${name}=`);
              if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
              return null;
            };

            const pendingCookie = getCookie('signup_consents');

            // Also check localStorage just in case of laggy transition for existing users
            const pendingLocal = typeof window !== 'undefined' ? window.localStorage.getItem('signup_consents') : null;

            if (pendingCookie || pendingLocal) {
              const parsed = JSON.parse(pendingCookie ? decodeURIComponent(pendingCookie) : pendingLocal!);
              const now = new Date().toISOString();
              await supabase.auth.updateUser({
                data: {
                  terms_accepted_at: parsed.termsAcceptedAt || now,
                  privacy_accepted_at: parsed.privacyAcceptedAt || now,
                }
              });
              if (typeof document !== 'undefined') {
                document.cookie = 'signup_consents=; path=/; max-age=0; secure; samesite=lax';
              }
              if (typeof window !== 'undefined') {
                window.localStorage.removeItem('signup_consents');
              }
            }
          } catch (error) {
            console.warn('[AUTH] Failed to persist signup consents:', error);
          }
        }

        if (event === 'SIGNED_IN') {
          void ensureAccountSetup(session);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const authCallbackUrl = (nextPath?: string | null) => {
    const callback = new URL('/auth/callback', window.location.origin);
    if (nextPath && nextPath.startsWith('/')) {
      callback.searchParams.set('next', nextPath);
    }
    return callback.toString();
  };

  const signUp = async (email: string, password: string, name?: string, nextPath?: string | null) => {
    const now = new Date().toISOString();
    if (devConfirmedSignupEnabled) {
      try {
        const response = await fetch('/api/auth/dev-signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password, name }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          return {
            data: null,
            error: new Error(payload?.error || 'Failed to create confirmed development account'),
          };
        }

        if (payload?.session?.access_token && payload?.session?.refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token: payload.session.access_token,
            refresh_token: payload.session.refresh_token,
          });
          return {
            data: {
              user: data.user || payload.user,
              session: data.session || payload.session,
            },
            error,
          };
        }

        return { data: payload, error: null };
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error : new Error('Failed to create confirmed development account'),
        };
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authCallbackUrl(nextPath),
        data: {
          ...(name ? { full_name: name } : {}),
          terms_accepted_at: now,
          privacy_accepted_at: now,
          onboarding_status: 'profile_pending',
        },
      },
    });
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithGoogle = async (nextPath?: string | null) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authCallbackUrl(nextPath),
      },
    });
    return { error };
  };

  const signOut = async () => {
    accountSetupKeyRef.current = null;
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      isDemoMode: isDemoUser(user),
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
