'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { isAdminEmail } from '@/lib/admin-access';

const ADMIN_LINKS = [
  { label: 'Overview', href: '/admin' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Billing Ops', href: '/admin/billing-ops' },
  { label: 'Monitoring', href: '/admin/monitoring' },
  { label: 'Payments', href: '/admin/payments' },
];

export default function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    if (!isAdminEmail(user.email)) {
      router.replace('/dashboard/hub');
    }
  }, [loading, router, user]);

  if (loading || !user || !isAdminEmail(user.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-sm text-slate-400">Loading admin…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-100 tracking-wide">Admin</div>
          <nav className="flex items-center gap-2">
            {ADMIN_LINKS.map((item) => {
              const active = item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
