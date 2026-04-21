"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { supabase } from '@/lib/supabase/client';
import BrandLogo from '@/components/site/BrandLogo';
import { Lock, Eye, EyeOff, CheckCircle, ArrowRight, AlertCircle } from 'lucide-react';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  // Recovery session states
  const [isReady, setIsReady] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const router = useRouter();

  useEffect(() => {
    // Track whether a valid recovery session was established, to prevent
    // the expiry timeout from firing after the session arrives.
    let settled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        settled = true;
        setIsReady(true);
      }
    });

    // In case the auth state change already fired before this effect ran
    // (e.g., Supabase processed the URL hash synchronously), check immediately.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !settled) {
        settled = true;
        setIsReady(true);
      }
    });

    // If no recovery session is established after 5 seconds the link is
    // expired or was already used. Show a clear error rather than a blank page.
    const timeout = setTimeout(() => {
      if (!settled) setLinkExpired(true);
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => setMounted(true), []);

  const logoTheme = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setIsLoading(false);
      return;
    }

    setIsSuccess(true);

    // Sign out so the user starts a clean session with their new password.
    await supabase.auth.signOut();
    setTimeout(() => router.push('/auth/login'), 3000);
  };

  // ── Loading state ───────────────────────────────────────────────────────────
  if (!isReady && !linkExpired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-950 px-4">
        <div className="flex flex-col items-center gap-4">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Verifying reset link…</p>
        </div>
      </div>
    );
  }

  // ── Expired / invalid link ──────────────────────────────────────────────────
  if (linkExpired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-950 px-4">
        <div className="max-w-sm w-full text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">Link expired</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
            This password reset link has expired or already been used.
            Request a new one below.
          </p>
          <Link
            href="/auth/reset-password"
            className="inline-flex w-full items-center justify-center bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:inline-flex sm:w-auto rounded-xl"
          >
            Request new link
          </Link>
          <p className="mt-4">
            <Link href="/auth/login" className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300">
              <ArrowRight className="h-3.5 w-3.5 rotate-180" />
              Back to login
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Success state ───────────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-950 px-4">
        <div className="max-w-sm w-full text-center">
          <CheckCircle className="h-16 w-16 text-green-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">Password updated</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
            Your password has been changed successfully.
            Redirecting you to login…
          </p>
          <Link
            href="/auth/login"
            className="inline-flex w-full items-center justify-center bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:inline-flex sm:w-auto rounded-xl"
          >
            Sign in now
          </Link>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-950 px-4">
      <div className="max-w-sm w-full">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size="md" theme={logoTheme} className="mb-6" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Set a new password</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5">
            Choose a strong password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* New password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              New password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full pl-10 pr-11 py-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-500 transition-shadow"
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Confirm new password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full pl-10 pr-11 py-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-500 transition-shadow"
                placeholder="Repeat your new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-xl p-3.5">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Updating password…
              </span>
            ) : (
              'Update password'
            )}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          <Link href="/auth/login" className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300">
            <ArrowRight className="h-3.5 w-3.5 rotate-180" />
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
