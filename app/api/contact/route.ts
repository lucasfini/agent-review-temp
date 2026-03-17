import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const payload = {
      user_id: user.id,
      email: user.email || '',
      category: typeof body.category === 'string' ? body.category : 'general',
      severity: typeof body.severity === 'string' ? body.severity : 'normal',
      affected_page: typeof body.affectedPage === 'string' ? body.affectedPage.trim() || null : null,
      service_area: typeof body.serviceArea === 'string' ? body.serviceArea.trim() || null : null,
      project_title: typeof body.projectTitle === 'string' ? body.projectTitle.trim() || null : null,
      subject: typeof body.subject === 'string' ? body.subject.trim() : '',
      message: typeof body.message === 'string' ? body.message.trim() : '',
      screenshot_url: typeof body.screenshotUrl === 'string' ? body.screenshotUrl.trim() || null : null,
    };

    if (!payload.subject || !payload.message) {
      return NextResponse.json({ error: 'Subject and message are required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('contact_requests')
      .insert(payload);

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to submit support request' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[CONTACT API] POST failed:', error);
    return NextResponse.json({ error: 'Failed to submit support request' }, { status: 500 });
  }
}
