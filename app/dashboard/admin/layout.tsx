import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdminEmail } from '@/lib/admin-access';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Server component: no cookie writes needed for this auth check.
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect('/dashboard/hub');
  }

  const adminLinks = [
    { href: '/dashboard/admin', label: 'Control Center' },
    { href: '/dashboard/admin/users', label: 'Users' },
    { href: '/dashboard/admin/monitoring', label: 'Monitoring' },
    { href: '/dashboard/admin/data', label: 'Billing Data' },
  ];

  return (
    <div className="themeable-admin min-h-full bg-transparent">
      <div className="mx-auto max-w-7xl px-6 pt-6">
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          {adminLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
