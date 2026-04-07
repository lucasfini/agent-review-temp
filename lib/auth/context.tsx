"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { isDemoUser } from '@/lib/demo-mode';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDemoMode: boolean;
  signUp: (email: string, password: string, name?: string) => Promise<{ data: any; error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ensureWelcomeBonus = async (activeSession: Session | null) => {
      if (!activeSession?.access_token || !activeSession.user || isDemoUser(activeSession.user)) {
        return;
      }

      try {
        await fetch('/api/billing/welcome-bonus', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeSession.access_token}`,
          },
        });
      } catch (error) {
        console.warn('[AUTH] Failed to ensure welcome bonus:', error);
      }
    };

    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      void ensureWelcomeBonus(session);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

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
          void ensureWelcomeBonus(session);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, name?: string) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          ...(name ? { full_name: name } : {}),
          terms_accepted_at: now,
          privacy_accepted_at: now,
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

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error };
  };

  const signOut = async () => {
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
