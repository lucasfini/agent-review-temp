import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';
import { getInternalAppBaseUrl } from '@/lib/app-url';
import { getInternalJobToken } from '@/lib/internal-job-auth';
import { scheduleBackgroundTask } from '@/lib/background-task';

export async function GET(request: NextRequest) {
    return processJobs(request);
}

export async function POST(request: NextRequest) {
    return processJobs(request);
}

async function processJobs(request: NextRequest) {
    try {
        const isMaintenance = isAuthorizedMaintenanceRequest(request);
        if (!isMaintenance) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Find projects that have queued jobs
        const { data: queuedJobs, error: fetchError } = await (supabaseAdmin as any)
            .from('project_generation_jobs')
            .select('project_id')
            .eq('status', 'queued')
            .order('created_at', { ascending: true });

        if (fetchError) {
            throw fetchError;
        }

        if (!queuedJobs || queuedJobs.length === 0) {
            return NextResponse.json({ success: true, message: 'No queued jobs found' });
        }

        // Get unique project IDs
        const projectIds = Array.from(new Set(queuedJobs.map((j: any) => j.project_id)));
        const baseUrl = getInternalAppBaseUrl();
        const internalJobToken = getInternalJobToken();
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (internalJobToken) {
            headers['x-internal-job-token'] = internalJobToken;
        }

        console.log(`[PROCESS-QUEUED] Found ${projectIds.length} projects with queued jobs. Triggering processing...`);

        // Trigger processing for each project in background
        for (const projectId of projectIds) {
            scheduleBackgroundTask(
                fetch(`${baseUrl}/api/projects/${projectId}/generate/process`, {
                    method: 'POST',
                    headers,
                }).catch((error) => {
                    console.error(`[PROCESS-QUEUED] Failed to trigger project ${projectId}:`, error);
                })
            );
        }

        return NextResponse.json({ 
            success: true, 
            triggeredProjects: projectIds.length,
            totalQueuedJobs: queuedJobs.length
        });

    } catch (error) {
        console.error('[PROCESS-QUEUED] Fatal error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
