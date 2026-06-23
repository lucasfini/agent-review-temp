"use client";

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { CheckCircle, Loader2, Mail, XCircle } from 'lucide-react';

import BrandLogo from '@/components/site/BrandLogo';
import { useAuth } from '@/lib/auth/context';

type AcceptState = 'idle' | 'accepting' | 'accepted' | 'error';

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
          <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              <h1 className="mt-4 text-2xl font-bold">Loading invite</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                We are preparing your workspace invite.
              </p>
            </div>
          </div>
        </main>
      }
    >
      <InvitePageContent />
    </Suspense>
  );
}

function InvitePageContent() {
  const { user, session, loading } = useAuth();
  const { resolvedTheme } = useTheme();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || searchParams.get('invite_token') || '';
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<AcceptState>('idle');
  const [message, setMessage] = useState('');
  const [workspaceRole, setWorkspaceRole] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (loading || !session?.access_token || !user || !token || state !== 'idle') return;

    const acceptInvite = async () => {
      setState('accepting');
      setMessage('');
      try {
        const response = await fetch('/api/organizations/invitations/accept', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ token }),
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to accept workspace invite');
        }
        setWorkspaceRole(payload.membership?.role || null);
        setState('accepted');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to accept workspace invite');
        setState('error');
      }
    };

    acceptInvite();
  }, [loading, session?.access_token, state, token, user]);

  const inviteParam = encodeURIComponent(token);
  const logoTheme = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-10">
          <BrandLogo size="md" theme={logoTheme} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {!token ? (
            <>
              <XCircle className="h-10 w-10 text-red-500" />
              <h1 className="mt-4 text-2xl font-bold">Invite link missing</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Open the full workspace invite link from your email.
              </p>
            </>
          ) : loading || state === 'accepting' ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              <h1 className="mt-4 text-2xl font-bold">Accepting invite</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                We are checking your signed-in account and workspace seat.
              </p>
            </>
          ) : !user ? (
            <>
              <Mail className="h-10 w-10 text-blue-600" />
              <h1 className="mt-4 text-2xl font-bold">Sign in to accept</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Use the email address that received this workspace invite.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/auth/login?invite_token=${inviteParam}`}
                  className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Sign in
                </Link>
                <Link
                  href={`/auth/signup?invite_token=${inviteParam}`}
                  className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Create account
                </Link>
              </div>
            </>
          ) : state === 'accepted' ? (
            <>
              <CheckCircle className="h-10 w-10 text-emerald-500" />
              <h1 className="mt-4 text-2xl font-bold">Workspace joined</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Your account now has {workspaceRole || 'editor'} access to this workspace.
              </p>
              <button
                type="button"
                onClick={() => router.push('/dashboard/hub')}
                className="mt-6 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Go to dashboard
              </button>
            </>
          ) : (
            <>
              <XCircle className="h-10 w-10 text-red-500" />
              <h1 className="mt-4 text-2xl font-bold">Invite not accepted</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {message || 'This invite could not be accepted.'}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setState('idle')}
                  className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Try again
                </button>
                <Link
                  href="/dashboard/settings?section=workspace"
                  className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Settings
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
