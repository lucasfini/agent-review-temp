"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { Eye, EyeOff, Mail, Lock, User, Mic, ArrowRight, FileText, Clock, Layers, CheckCircle } from 'lucide-react';

// ─── Waveform bar heights ─────────────────────────────────────────────────────
const WAVE_BARS = [18, 32, 50, 38, 60, 44, 68, 30, 54, 40, 22, 46, 58, 36, 26];

const OUTPUT_PILLS = [
  { label: 'LinkedIn Post',       color: 'bg-blue-500/20 border-blue-400/30 text-blue-200',    iconColor: 'text-blue-300',   Icon: Layers },
  { label: 'Show Notes',          color: 'bg-violet-500/20 border-violet-400/30 text-violet-200', iconColor: 'text-violet-300', Icon: FileText },
  { label: 'Timestamp Chapters',  color: 'bg-indigo-500/20 border-indigo-400/30 text-indigo-200', iconColor: 'text-indigo-300', Icon: Clock },
];

function RightPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950">
      {/* Ambient blobs */}
      <div className="absolute top-1/4 -left-16 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl pointer-events-none motion-safe:animate-float-mid" />
      <div className="absolute bottom-1/4 -right-16 w-72 h-72 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none motion-safe:animate-float-slow" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 bg-violet-600/10 rounded-full blur-2xl pointer-events-none motion-safe:animate-float-mid" />

      <div className="relative z-10 flex flex-col items-center px-14 text-center max-w-lg w-full">
        {/* Brand mark */}
        <div className="flex items-center gap-3 mb-12 motion-safe:animate-fade-up">
          <div className="h-10 w-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Mic className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">AudioRepurpose</span>
        </div>

        {/* Headline */}
        <h2 className="text-3xl font-bold text-white leading-tight mb-3 motion-safe:animate-fade-up-200">
          One recording.<br />A month of content.
        </h2>
        <p className="text-blue-200/70 text-sm mb-10 leading-relaxed motion-safe:animate-fade-up-400">
          AI that transforms your podcast into optimised content<br />for every platform — automatically.
        </p>

        {/* Glassmorphism card */}
        <div className="w-full rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl p-6 mb-8 shadow-2xl motion-safe:animate-fade-up-600">
          <div className="flex items-center gap-5">
            {/* Audio waveform */}
            <div className="flex items-end gap-[3px] flex-shrink-0 h-16">
              {WAVE_BARS.map((h, i) => (
                <div
                  key={i}
                  className={`w-[3px] rounded-full ${i % 4 === 0 ? 'motion-safe:animate-breathe' : ''}`}
                  style={{
                    height: `${h}px`,
                    background:
                      i % 3 === 0 ? 'rgba(96,165,250,0.85)'
                      : i % 3 === 1 ? 'rgba(129,140,248,0.85)'
                      : 'rgba(167,139,250,0.85)',
                  }}
                />
              ))}
            </div>

            {/* Flow arrow */}
            <div className="flex-shrink-0 flex flex-col items-center gap-1">
              <div className="h-px w-6 bg-white/25" />
              <ArrowRight className="h-4 w-4 text-white/40" />
              <div className="h-px w-6 bg-white/25" />
            </div>

            {/* Output pills */}
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {OUTPUT_PILLS.map(({ label, color, iconColor, Icon }) => (
                <div key={label} className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 ${color}`}>
                  <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${iconColor}`} />
                  <span className="text-xs font-medium truncate">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status bar */}
          <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
            </span>
            <span className="text-xs text-white/40 tracking-wide">Processing your episode…</span>
          </div>
        </div>

        {/* Value proposition */}
        <p className="text-white/80 text-base font-medium italic leading-relaxed mb-8 motion-safe:animate-fade-up-600">
          "Transform one recording into a month of content. Instantly."
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-8">
          {[['15+', 'Content types'], ['5 min', 'Per episode'], ['90%', 'Time saved']].map(([stat, label], i, arr) => (
            <div key={stat} className="flex items-center gap-8">
              <div className={`text-center motion-safe:animate-fade-in${i === 1 ? '-200' : i === 2 ? '-400' : ''}`}>
                <div className="text-2xl font-bold text-white">{stat}</div>
                <div className="text-[11px] text-blue-300/60 mt-0.5">{label}</div>
              </div>
              {i < arr.length - 1 && <div className="w-px h-8 bg-white/15" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Google icon SVG ──────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [openaiOptIn, setOpenaiOptIn] = useState(false);

  const { signUp, signInWithGoogle } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      setIsLoading(false);
      return;
    }

    const { error } = await signUp(
      email,
      password,
      name.trim() || undefined,
      { openaiDataSharingOptIn: openaiOptIn }
    );

    if (error) {
      if (error.message?.includes('email') || error.message?.includes('confirmation')) {
        router.push('/dashboard');
        return;
      }
      setError(error.message);
      setIsLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  const handleGoogle = async () => {
    setIsGoogleLoading(true);
    setError('');
    try {
      const now = new Date().toISOString();
      window.localStorage.setItem('signup_consents', JSON.stringify({
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        openaiOptIn,
        openaiOptInAt: openaiOptIn ? now : null,
      }));
    } catch (e) {
      console.warn('Failed to store signup consents:', e);
    }
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
      setIsGoogleLoading(false);
    }
  };

  // ── Email verification success screen ──────────────────────────────────────
  if (isSuccess) {
    return (
      <div className="min-h-screen flex">
        <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-8 bg-slate-950">
          <div className="max-w-sm w-full text-center">
            <CheckCircle className="h-16 w-16 text-green-400 mx-auto mb-4 motion-safe:animate-fade-up" />
            <h1 className="text-2xl font-bold text-slate-50 mb-2 motion-safe:animate-fade-up-200">Check your email</h1>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed motion-safe:animate-fade-up-400">
              We&apos;ve sent a confirmation link to <strong className="text-slate-200">{email}</strong>.
              Click it to verify your account and get started.
            </p>
            <Link
              href="/auth/login"
              className="inline-block bg-blue-600 text-white py-3 px-6 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors motion-safe:animate-fade-up-600"
            >
              Go to Login
            </Link>
          </div>
        </div>
        <RightPanel />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left: form panel ── */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 py-12 bg-slate-950 overflow-y-auto">
        <div className="mx-auto w-full max-w-sm">
          {/* Back link */}
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-10 motion-safe:animate-fade-in">
            <ArrowRight className="h-3.5 w-3.5 rotate-180" />
            Back to home
          </Link>

          {/* Heading */}
          <div className="mb-8 motion-safe:animate-fade-up-200">
            <h1 className="text-2xl font-bold text-slate-50">Create your account</h1>
            <p className="text-slate-400 text-sm mt-1.5">Start repurposing your podcasts with AI</p>
          </div>

          {/* Google OAuth button */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={isGoogleLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-slate-900 border border-slate-700 rounded-xl text-sm font-medium text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors motion-safe:animate-fade-up-400 hover:shadow-[0_0_20px_rgba(59,130,246,0.25)]"
          >
            {isGoogleLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>
          <p className="text-xs text-slate-500 text-center mt-2 motion-safe:animate-fade-up-400">
            By continuing with Google you agree to our{' '}
            <Link href="/terms" className="text-slate-400 hover:text-slate-300">Terms</Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-slate-400 hover:text-slate-300">Privacy Policy</Link>.
          </p>

          {/* OR divider */}
          <div className="flex items-center gap-3 my-6 motion-safe:animate-fade-up-400">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* Manual sign-up form */}
          <form onSubmit={handleSubmit} className="space-y-4 motion-safe:animate-fade-up-600">
            {/* Full Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="w-full pl-10 pr-4 py-3 border border-slate-700 bg-slate-900 text-slate-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-500 transition-shadow"
                  placeholder="Jane Smith"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
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
                  className="w-full pl-10 pr-4 py-3 border border-slate-700 bg-slate-900 text-slate-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-500 transition-shadow"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                Password
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
                  className="w-full pl-10 pr-11 py-3 border border-slate-700 bg-slate-900 text-slate-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-500 transition-shadow"
                  placeholder="Create a password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">At least 6 characters</p>
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1.5">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full pl-10 pr-11 py-3 border border-slate-700 bg-slate-900 text-slate-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-500 transition-shadow"
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-xl p-3.5">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              <label className="flex items-start gap-3 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500"
                />
                <span>
                  I agree to the{' '}
                  <Link href="/terms" className="text-blue-400 hover:text-blue-300">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-blue-400 hover:text-blue-300">
                    Privacy Policy
                  </Link>.
                </span>
              </label>

              <label className="flex items-start gap-3 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={openaiOptIn}
                  onChange={(e) => setOpenaiOptIn(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500"
                />
                <span>
                  Opt in to share data with OpenAI to receive free tokens. We will only share data if you opt in.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading || isGoogleLoading || !termsAccepted}
              className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating account…
                </span>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-6 motion-safe:animate-fade-in-400">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* ── Right: visual panel ── */}
      <RightPanel />
    </div>
  );
}
