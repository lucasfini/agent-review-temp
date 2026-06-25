import { NextRequest } from 'next/server';
import { POST } from '../../app/api/transcribe/route';

jest.mock('@/lib/api/transcribe-auth', () => ({
  resolveTranscribeRequestAuthContext: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  aiRatelimit: {
    limit: jest.fn(),
  },
}));

const { resolveTranscribeRequestAuthContext } = require('@/lib/api/transcribe-auth');
const { aiRatelimit } = require('@/lib/rate-limit');
const { RouteAccessError } = jest.requireActual('@/lib/api/route-auth');

function createRequest(body) {
  return new NextRequest('http://localhost:3000/api/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

describe('/api/transcribe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    aiRatelimit.limit.mockResolvedValue({ success: true });
  });

  it('returns 400 when projectId is missing', async () => {
    const response = await POST(createRequest({ fileName: 'uploads/test.mp3' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Missing projectId or fileName');
    expect(resolveTranscribeRequestAuthContext).not.toHaveBeenCalled();
  });

  it('returns 400 when fileName is missing', async () => {
    const response = await POST(createRequest({ projectId: 'project-1' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Missing projectId or fileName');
    expect(resolveTranscribeRequestAuthContext).not.toHaveBeenCalled();
  });

  it('returns the shared auth error for unauthorized project access', async () => {
    resolveTranscribeRequestAuthContext.mockRejectedValueOnce(new RouteAccessError(401, 'Unauthorized'));

    const response = await POST(createRequest({
      projectId: 'project-1',
      fileName: 'uploads/test.mp3',
    }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('rate limits user-initiated transcription requests before provider work starts', async () => {
    resolveTranscribeRequestAuthContext.mockResolvedValueOnce({
      isInternal: false,
      callerUserId: 'user-1',
      existingProject: {
        transcription_text: null,
        transcription_segments: null,
        speaker_data: null,
        audio_duration: 60,
        audio_file_size: 1024,
        user_id: 'user-1',
        title: 'Test upload',
        preset_speakers: null,
        metadata: {},
        performance_level: 'content_kit',
        organization_id: 'org-1',
      },
    });
    aiRatelimit.limit.mockResolvedValueOnce({ success: false });

    const response = await POST(createRequest({
      projectId: 'project-1',
      fileName: 'uploads/test.mp3',
    }));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain('Rate limit exceeded');
    expect(aiRatelimit.limit).toHaveBeenCalledWith('user-1');
  });
});
