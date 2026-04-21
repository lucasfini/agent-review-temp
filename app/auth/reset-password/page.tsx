"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { supabase } from '@/lib/supabase/client';
import BrandLogo from '@/components/site/BrandLogo';
import { Mail, ArrowRight, CheckCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const logoTheme = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    setIsSuccess(true);
    setIsLoading(false);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-950 px-4">
        <div className="max-w-sm w-full text-center">
          <CheckCircle className="h-16 w-16 text-green-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">Check your email</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
            We&apos;ve sent a password reset link to <strong className="text-slate-700 dark:text-slate-200">{email}</strong>.
            Click it to set a new password.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex w-full items-center justify-center bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:inline-flex sm:w-auto rounded-xl"
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-950 px-4">
      <div className="max-w-sm w-full">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size="md" theme={logoTheme} className="mb-6" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Reset your password</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-500 transition-shadow"
                placeholder="you@example.com"
              />
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
                Sending link…
              </span>
            ) : (
              'Send reset link'
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
