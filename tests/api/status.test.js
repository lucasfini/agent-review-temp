import { NextRequest } from 'next/server';
import { GET } from '../../app/api/projects/[id]/status/route';

jest.mock('@/lib/api/route-auth', () => {
  class RouteAccessError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
      this.name = 'RouteAccessError';
    }
  }

  return {
    RouteAccessError,
    requireProjectOwner: jest.fn(),
  };
});

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

const { requireProjectOwner, RouteAccessError } = require('@/lib/api/route-auth');
const { supabaseAdmin } = require('@/lib/supabase/server');

function createRequest(projectId = 'project-1') {
  return new NextRequest(`http://localhost:3000/api/projects/${projectId}/status`, {
    headers: { Authorization: 'Bearer token-1' },
  });
}

function mockProjectStatusQuery(projectResult, outputResult = { count: 0, error: null }) {
  supabaseAdmin.from.mockImplementation((table) => {
    if (table === 'projects') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue(projectResult),
          })),
        })),
      };
    }

    if (table === 'outputs') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue(outputResult),
        })),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });
}

describe('/api/projects/[id]/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireProjectOwner.mockResolvedValue({
      user: { id: 'user-1' },
      project: { id: 'project-1', user_id: 'user-1', organization_id: 'org-1' },
      accessMode: 'legacy_owner',
    });
  });

  it('returns 400 when project ID is missing', async () => {
    const response = await GET(createRequest(''), { params: Promise.resolve({ id: '' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Project ID is required');
    expect(requireProjectOwner).not.toHaveBeenCalled();
  });

  it('returns shared auth errors before reading status details', async () => {
    requireProjectOwner.mockRejectedValueOnce(new RouteAccessError(401, 'Unauthorized'));

    const response = await GET(createRequest(), { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns project status and skips output counts for in-progress projects', async () => {
    mockProjectStatusQuery({
      data: {
        id: 'project-1',
        user_id: 'user-1',
        status: 'processing',
        processing_stage: 'transcribing',
        processing_progress: 42,
        processing_message: 'Transcribing audio...',
        stage_started_at: '2026-06-24T10:00:00.000Z',
        performance_level: 'repurpose_pack',
        transcription_text: null,
        processing_time_seconds: null,
        created_at: '2026-06-24T09:59:00.000Z',
        updated_at: '2026-06-24T10:00:00.000Z',
      },
      error: null,
    });

    const response = await GET(createRequest(), { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: 'processing',
      progress: 60,
      processing_stage: 'transcribing',
      processing_progress: 42,
      outputs_generated: 0,
    });
    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1);
  });

  it('returns output counts for completed projects', async () => {
    mockProjectStatusQuery({
      data: {
        id: 'project-1',
        user_id: 'user-1',
        status: 'completed',
        processing_stage: 'complete',
        processing_progress: 100,
        processing_message: null,
        stage_started_at: null,
        performance_level: 'content_kit',
        transcription_text: 'Done',
        processing_time_seconds: 45,
        created_at: '2026-06-24T09:59:00.000Z',
        updated_at: '2026-06-24T10:05:00.000Z',
      },
      error: null,
    }, { count: 12, error: null });

    const response = await GET(createRequest(), { params: Promise.resolve({ id: 'project-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      status: 'completed',
      progress: 100,
      transcription_text: 'Done',
      processing_time: 45,
      outputs_generated: 12,
    });
    expect(supabaseAdmin.from).toHaveBeenCalledWith('outputs');
  });

  it('returns 404 when the project cannot be read after auth', async () => {
    mockProjectStatusQuery({
      data: null,
      error: { message: 'Project not found' },
    });

    const response = await GET(createRequest(), { params: Promise.resolve({ id: 'missing-project' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Project not found');
  });
});
