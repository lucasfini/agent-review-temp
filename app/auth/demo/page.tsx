"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BrandLogo from '@/components/site/BrandLogo';

export default function DemoLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const signIn = async () => {
      const res = await fetch('/api/auth/demo-login', { method: 'POST' });

      if (!res.ok) {
        setError('Unable to access the demo account. Please try again later.');
        return;
      }

      // Ensure demo welcome modal shows on arrival
      localStorage.removeItem('demoWelcomeSeen');
      router.push('/dashboard/hub');
    };

    signIn();
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="flex items-center justify-center mb-6">
          <BrandLogo size="lg" theme="dark" />
        </div>

        {error ? (
          <div className="space-y-4">
            <p className="text-red-400 text-sm max-w-xs">{error}</p>
            <a
              href="/auth/signup"
              className="inline-block text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Sign up for free instead →
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto" />
            <p className="text-slate-400 text-sm">Loading demo account…</p>
          </div>
        )}
      </div>
    </div>
  );
}
