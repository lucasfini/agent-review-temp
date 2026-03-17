import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
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

  return <>{children}</>;
}
