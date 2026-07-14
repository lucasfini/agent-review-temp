'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SiteThemeToggle from '@/components/site/SiteThemeToggle';

const ADMIN_LINKS = [
  { label: 'Overview', href: '/admin' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Billing Ops', href: '/admin/billing-ops' },
  { label: 'Prices', href: '/admin/prices' },
  { label: 'Monitoring', href: '/admin/monitoring' },
  { label: 'Payments', href: '/admin/payments' },
];

export default function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="themeable-admin min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900 tracking-wide dark:text-slate-100">Admin</div>
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
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-600/20 dark:text-blue-300 dark:border-blue-500/30'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <SiteThemeToggle size="sm" />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
