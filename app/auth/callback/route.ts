import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getAppBaseUrl } from '@/lib/app-url'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const appBaseUrl = getAppBaseUrl()

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const oauthError = searchParams.get('error')
  const oauthErrorDescription = searchParams.get('error_description')
  const oauthErrorCode = searchParams.get('error_code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (oauthError) {
    const errorUrl = new URL('/auth/auth-code-error', appBaseUrl)
    errorUrl.searchParams.set('reason', 'oauth_provider_error')
    const message = [oauthError, oauthErrorCode, oauthErrorDescription]
      .filter(Boolean)
      .join(' | ')
    errorUrl.searchParams.set('message', message || 'Unknown OAuth error')
    return NextResponse.redirect(errorUrl)
  }

  if (code) {
    const response = NextResponse.redirect(new URL(next, appBaseUrl))
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set({ name, value: '', ...options })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return response
    }

    const errorUrl = new URL('/auth/auth-code-error', appBaseUrl)
    errorUrl.searchParams.set('reason', 'oauth_exchange_failed')
    errorUrl.searchParams.set('message', error.message ?? 'Unknown error')
    return NextResponse.redirect(errorUrl)
  }

  // Return the user to an error page with instructions
  const errorUrl = new URL('/auth/auth-code-error', appBaseUrl)
  errorUrl.searchParams.set('reason', 'missing_code')
  return NextResponse.redirect(errorUrl)
}
