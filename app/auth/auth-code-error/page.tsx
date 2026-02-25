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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl">
        <h1 className="text-2xl font-bold">Google sign-in failed</h1>
        <p className="mt-2 text-sm text-slate-400">
          The OAuth callback could not exchange the authorization code for a session.
        </p>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <div className="text-slate-400">Reason</div>
          <div className="mt-1 font-medium text-slate-100">{reason}</div>
          {message && (
            <>
              <div className="mt-3 text-slate-400">Message</div>
              <div className="mt-1 font-medium text-slate-100 break-words">{message}</div>
            </>
          )}
        </div>

        <div className="mt-6 text-sm text-slate-400">
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
            className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}
