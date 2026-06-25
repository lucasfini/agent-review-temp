import { NextRequest } from 'next/server';
import { POST } from '../../app/api/upload/init/route';

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    auth: {
      getUser: jest.fn(),
    },
  },
}));

jest.mock('@/lib/rate-limit', () => ({
  uploadRatelimit: {
    limit: jest.fn(),
  },
}));

jest.mock('@/lib/r2', () => ({
  r2Client: {},
  BUCKET_NAME: 'test-bucket',
}));

const { supabaseAdmin } = require('@/lib/supabase/server');
const { uploadRatelimit } = require('@/lib/rate-limit');

function createRequest(body, headers = {}) {
  return new NextRequest('http://localhost:3000/api/upload/init', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('/api/upload/init', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      error: null,
    });
    uploadRatelimit.limit.mockResolvedValue({ success: true });
  });

  it('requires an authenticated user', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid token' },
    });

    const response = await POST(createRequest({
      fileName: 'episode.mp3',
      contentType: 'audio/mpeg',
      size: 1024,
      title: 'Episode',
    }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('rejects missing upload metadata', async () => {
    const response = await POST(createRequest({}, { Authorization: 'Bearer token-1' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required fields');
  });

  it('rejects invalid file sizes before billing or storage work', async () => {
    const response = await POST(createRequest({
      fileName: 'episode.mp3',
      contentType: 'audio/mpeg',
      size: 0,
      title: 'Episode',
    }, { Authorization: 'Bearer token-1' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required fields');
  });

  it('rejects unsupported audio formats', async () => {
    const response = await POST(createRequest({
      fileName: 'notes.txt',
      contentType: 'text/plain',
      size: 1024,
      title: 'Notes',
    }, { Authorization: 'Bearer token-1' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Unsupported audio format');
  });

  it('applies the upload rate limit per user', async () => {
    uploadRatelimit.limit.mockResolvedValueOnce({ success: false });

    const response = await POST(createRequest({
      fileName: 'episode.mp3',
      contentType: 'audio/mpeg',
      size: 1024,
      title: 'Episode',
    }, { Authorization: 'Bearer token-1' }));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain('Rate limit exceeded');
    expect(uploadRatelimit.limit).toHaveBeenCalledWith('user-1');
  });
});
