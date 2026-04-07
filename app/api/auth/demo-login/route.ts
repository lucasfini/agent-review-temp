import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { DEMO_EMAIL } from '@/lib/demo-mode';

export async function POST() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) {
    return NextResponse.json(
      { error: 'Demo account is not configured' },
      { status: 503 }
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password,
  });

  if (error) {
    return NextResponse.json(
      { error: 'Unable to access the demo account' },
      { status: 401 }
    );
  }

  return NextResponse.json({ success: true });
}
