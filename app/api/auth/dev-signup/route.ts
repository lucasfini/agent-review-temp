import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { isValidEmail, PASSWORD_MIN_LENGTH } from '@/lib/auth/validation';

const isDevConfirmedSignupEnabled = () =>
  process.env.NODE_ENV !== 'production'
  && (
    process.env.ENABLE_DEV_CONFIRMED_SIGNUP === 'true'
    || process.env.NEXT_PUBLIC_ENABLE_DEV_CONFIRMED_SIGNUP === 'true'
  );

const authConfig = () => ({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
});

export async function POST(request: Request) {
  if (!isDevConfirmedSignupEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey } = authConfig();
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: 'Dev confirmed signup requires Supabase URL, anon key, and service role key.' },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const userMetadata = {
    ...(name ? { full_name: name } : {}),
    terms_accepted_at: now,
    privacy_accepted_at: now,
    onboarding_status: 'profile_pending',
  };

  const supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  const supabaseAuth = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: signedIn, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signedIn.session) {
    return NextResponse.json(
      { error: signInError?.message || 'Confirmed user was created, but sign-in failed.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    user: signedIn.user || created.user,
    session: signedIn.session,
  });
}
