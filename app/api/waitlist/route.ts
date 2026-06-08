import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { checkPublicFormRateLimit } from '@/lib/public-form-rate-limit'

function clientIpFrom(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown'
  }
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name } = body

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()
    const ipLimit = await checkPublicFormRateLimit({
      route: 'waitlist',
      kind: 'ip',
      value: clientIpFrom(request),
    })
    const emailLimit = await checkPublicFormRateLimit({
      route: 'waitlist',
      kind: 'email',
      value: normalizedEmail,
    })
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many waitlist submissions. Please try again later.',
          retryAfterSeconds: Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds),
        },
        { status: 429 }
      )
    }

    // Insert into Supabase
    const { data, error } = await supabase
      .from('waitlist')
      .insert([
        {
          email: normalizedEmail,
          name: name?.trim() || null,
        },
      ] as any)
      .select()

    if (error) {
      // Handle duplicate email error
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This email is already on the waitlist' },
          { status: 409 }
        )
      }

      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to join waitlist. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: 'Successfully joined the waitlist!',
        data: data?.[0]
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
