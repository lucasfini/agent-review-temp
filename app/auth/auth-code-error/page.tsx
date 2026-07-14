import Link from 'next/link'

type AuthCodeErrorPageProps = {
  searchParams?: Promise<{
    reason?: string
    message?: string
  }>
}

export default async function AuthCodeErrorPage({ searchParams }: AuthCodeErrorPageProps) {
  const resolved = await searchParams
  const reason = resolved?.reason ?? 'unknown'
  const message = resolved?.message

  return (
    <div className="min-h-screen bg-white text-slate-900 flex items-center justify-center px-6 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-slate-50 p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900/60">
        <h1 className="text-2xl font-bold">Google sign-in failed</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          The OAuth callback could not exchange the authorization code for a session.
        </p>

        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950/60">
          <div className="text-slate-500 dark:text-slate-400">Reason</div>
          <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">{reason}</div>
          {message && (
            <>
              <div className="mt-3 text-slate-500 dark:text-slate-400">Message</div>
              <div className="mt-1 font-medium text-slate-900 break-words dark:text-slate-100">{message}</div>
            </>
          )}
        </div>

        <div className="mt-6 text-sm text-slate-600 dark:text-slate-400">
          Check that your Google OAuth client and Supabase redirect URLs are configured correctly.
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Back to login
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}
