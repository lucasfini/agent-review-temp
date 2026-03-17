import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { isAdminEmail } from '@/lib/admin-access'

// Lazy-initialize so missing env vars only error at request time, not build time
let ratelimit: Ratelimit | null = null
function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  ratelimit = new Ratelimit({
    redis: new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }),
    limiter: Ratelimit.slidingWindow(20, '1 m'),
  })
  return ratelimit
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Canonicalize admin URLs to /admin/* (outside dashboard shell/sidebar)
  if (pathname === '/dashboard/admin' || pathname.startsWith('/dashboard/admin/')) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = pathname.replace('/dashboard/admin', '/admin')
    return NextResponse.redirect(redirectUrl)
  }

  // ── Rate limiting for API routes ──────────────────────────────────────────
  // Skip Stripe webhook (Stripe IPs vary and it retries legitimately)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/stripe/webhook')) {
    const limiter = getRatelimit()
    if (limiter) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
        request.headers.get('x-real-ip') ??
        '127.0.0.1'

      const { success, limit, reset, remaining } = await limiter.limit(ip)

      if (!success) {
        return new NextResponse('Too Many Requests', {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
          },
        })
      }
    }
  }

  // ── Supabase session refresh (required for Server Components) ─────────────
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  await supabase.auth.getSession()
  const { data: { user } } = await supabase.auth.getUser()

  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/user/')

  if (isProtectedRoute && !user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/auth/login'
    redirectUrl.searchParams.set('redirect_to', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Admin route guard at edge (primary authz still enforced in API/routes)
  if (pathname.startsWith('/admin') && user) {
    const isAllowedAdmin = isAdminEmail(user.email)

    if (!isAllowedAdmin) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/dashboard'
      return NextResponse.redirect(redirectUrl)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/upload (large uploads bypass middleware to avoid body cloning)
     * - common static asset extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|api/upload|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
