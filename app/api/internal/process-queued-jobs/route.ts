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

        // Find projects that have queued generation jobs
        const { data: queuedJobs, error: fetchError } = await (supabaseAdmin as any)
            .from('project_generation_jobs')
            .select('project_id')
            .eq('status', 'queued')
            .order('created_at', { ascending: true });

        if (fetchError) {
            throw fetchError;
        }

        // Find uploaded projects whose transcription work was deferred.
        const { data: processingProjects, error: projectsError } = await (supabaseAdmin as any)
            .from('projects')
            .select('id, metadata')
            .eq('status', 'processing')
            .order('updated_at', { ascending: true })
            .limit(50);

        if (projectsError) {
            throw projectsError;
        }

        const transcriptionProjects = (processingProjects || [])
            .filter((project: any) => project?.metadata?.transcription_queue?.status === 'queued')
            .filter((project: any) => project.metadata.transcription_queue.projectId && project.metadata.transcription_queue.fileName);

        if ((!queuedJobs || queuedJobs.length === 0) && transcriptionProjects.length === 0) {
            return NextResponse.json({ success: true, message: 'No queued jobs found' });
        }

        // Get unique project IDs for generation.
        const projectIds = Array.from(new Set((queuedJobs || []).map((j: any) => j.project_id)));
        const baseUrl = getInternalAppBaseUrl();
        const internalJobToken = getInternalJobToken();
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (internalJobToken) {
            headers['x-internal-job-token'] = internalJobToken;
        }

        console.log(
            `[PROCESS-QUEUED] Found ${projectIds.length} projects with queued generation jobs ` +
            `and ${transcriptionProjects.length} queued transcription jobs. Triggering processing...`
        );

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

        for (const project of transcriptionProjects) {
            const queued = project.metadata.transcription_queue;
            scheduleBackgroundTask(
                fetch(`${baseUrl}/api/transcribe`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        projectId: queued.projectId,
                        fileName: queued.fileName,
                        fingerprint: queued.fingerprint,
                        performanceLevel: queued.performanceLevel,
                        analysisOptions: queued.analysisOptions,
                        diarizationProvider: queued.diarizationProvider || 'assemblyai',
                        speakerCount: queued.speakerCount,
                    }),
                }).catch((error) => {
                    console.error(`[PROCESS-QUEUED] Failed to trigger transcription ${project.id}:`, error);
                })
            );
        }

        return NextResponse.json({ 
            success: true, 
            triggeredProjects: projectIds.length,
            triggeredTranscriptions: transcriptionProjects.length,
            totalQueuedJobs: queuedJobs?.length || 0
        });

    } catch (error) {
        console.error('[PROCESS-QUEUED] Fatal error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
