import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { sendContactEmail } from '@/lib/contact-mailer';
import { checkPublicFormRateLimit } from '@/lib/public-form-rate-limit';

async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

function clientIpFrom(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);

    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const payload = {
      user_id: user?.id || null,
      email: user?.email || email,
      category: typeof body.category === 'string' ? body.category : 'general',
      severity: typeof body.severity === 'string' ? body.severity : 'normal',
      affected_page: typeof body.affectedPage === 'string' ? body.affectedPage.trim() || null : null,
      service_area: typeof body.serviceArea === 'string' ? body.serviceArea.trim() || null : null,
      project_title: typeof body.projectTitle === 'string' ? body.projectTitle.trim() || null : null,
      subject: typeof body.subject === 'string' ? body.subject.trim() : '',
      message: typeof body.message === 'string' ? body.message.trim() : '',
      screenshot_url: typeof body.screenshotUrl === 'string' ? body.screenshotUrl.trim() || null : null,
    };

    if (!payload.email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    if (!payload.subject || !payload.message) {
      return NextResponse.json({ error: 'Subject and message are required.' }, { status: 400 });
    }

    const ipLimit = await checkPublicFormRateLimit({
      route: 'contact',
      kind: 'ip',
      value: clientIpFrom(request),
    });
    const emailLimit = await checkPublicFormRateLimit({
      route: 'contact',
      kind: 'email',
      value: payload.email,
    });
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many support requests. Please try again later.',
          retryAfterSeconds: Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds),
        },
        { status: 429 }
      );
    }

    const { error } = await supabaseAdmin
      .from('contact_requests')
      .insert(payload);

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to submit support request' }, { status: 500 });
    }

    let emailDelivered = false;
    let emailWarning: string | null = null;

    try {
      const result = await sendContactEmail({
        requesterEmail: payload.email,
        category: payload.category,
        severity: payload.severity,
        affectedPage: payload.affected_page,
        serviceArea: payload.service_area,
        projectTitle: payload.project_title,
        subject: payload.subject,
        message: payload.message,
        screenshotUrl: payload.screenshot_url,
      });
      emailDelivered = result.delivered;
      if (!result.delivered) {
        emailWarning = result.reason;
      }
    } catch (emailError) {
      console.error('[CONTACT API] Email delivery failed:', emailError);
      emailWarning = 'Your request was saved, but email delivery to support failed.';
    }

    return NextResponse.json({ success: true, emailDelivered, emailWarning });
  } catch (error) {
    console.error('[CONTACT API] POST failed:', error);
    return NextResponse.json({ error: 'Failed to submit support request' }, { status: 500 });
  }
}
