import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { uploadRatelimit } from '@/lib/rate-limit';
import {
    ALLOWED_EXTENSIONS,
    ALLOWED_TYPES,
    ESTIMATED_BITRATE_BPS,
    MAX_FILE_SIZE_BYTES,
} from '@/lib/upload-constants';
import { createUploadToken } from '@/lib/upload-token';
import { getAudioExpiryDate } from '@/lib/audio-retention';
import { billingErrorResponse, requireCredits } from '@/lib/billing/middleware';
import { estimateTranscriptionCost } from '@/lib/billing/cost-map';
import { getProcessingTierForAnalysis, normalizeAnalysisOptions } from '@/lib/analysis-options';
import { createReservation, releaseReservation } from '@/lib/billing/credit';

export const runtime = 'nodejs';

const sanitizeFileName = (name: string) => {
    const normalized = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');
    const sanitized = normalized
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '');
    return sanitized || 'audio_upload';
};

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
            authHeader?.replace('Bearer ', '') || ''
        );

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.email === process.env.DEMO_EMAIL) {
            return NextResponse.json({ error: 'Demo account cannot upload' }, { status: 403 });
        }

        const { success } = await uploadRatelimit.limit(user.id);
        if (!success) {
            return NextResponse.json({ error: 'Rate limit exceeded. Too many uploads.' }, { status: 429 });
        }

        const body = await request.json();
        const { fileName, contentType, size, title, rosterSpeakers, speakerCount } = body;

        if (!fileName || !contentType || !size || !title) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (typeof fileName !== 'string' || fileName.length > 255) {
            return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
        }
        if (typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 160) {
            return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
        }
        if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
            return NextResponse.json({ error: 'Invalid file size' }, { status: 400 });
        }
        if (size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({ error: 'File exceeds 500MB upload limit' }, { status: 400 });
        }

        const normalizedType = String(contentType).toLowerCase();
        const extensionIndex = fileName.lastIndexOf('.');
        const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : '';
        if (!ALLOWED_TYPES.includes(normalizedType) && !ALLOWED_EXTENSIONS.includes(extension)) {
            return NextResponse.json({ error: 'Unsupported audio format' }, { status: 400 });
        }

        const sanitizedBaseName = sanitizeFileName(fileName);
        const estimatedDuration = Math.round(size / (ESTIMATED_BITRATE_BPS / 8));
        const analysisOptions = normalizeAnalysisOptions(body.analysisOptions);
        const processingTier = getProcessingTierForAnalysis(analysisOptions);
        const estimatedCost = estimateTranscriptionCost({
            durationSeconds: estimatedDuration,
            tier: processingTier,
            analysisOptions,
        });

        const estimatedHold = Number((estimatedCost.total * 1.15).toFixed(4));
        await requireCredits(user.id, estimatedHold);

        const reservation = await createReservation({
            userId: user.id,
            workflowType: 'upload_processing',
            amount: estimatedHold,
            metadata: {
                estimatedCost: estimatedCost.total,
                analysisOptions,
                estimatedDuration,
            },
            expiresAt: new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(),
        });

        // We cannot compute actual file hash on client easily without reading the whole file into memory.
        // Instead, we use a pseudo fingerprint for the cache key.
        const pseudoFingerprint = `${user.id}-${sanitizedBaseName}-${size}-${Date.now()}`;

        // Create project record
        let insertData: any = {
            user_id: user.id,
            title: title.trim(),
            audio_file_name: sanitizedBaseName,
            audio_file_size: size,
            audio_duration: estimatedDuration,
            audio_expires_at: getAudioExpiryDate(),
            audio_fingerprint: pseudoFingerprint,
            status: 'uploading',
            processing_stage: 'uploading',
            processing_progress: 0,
            processing_message: 'Uploading audio file...',
            stage_started_at: new Date().toISOString(),
            performance_level: processingTier,
            metadata: {
                analysis_options: analysisOptions,
                billing: {
                    uploadReservationId: reservation.id,
                    uploadEstimatedHold: estimatedHold,
                    uploadEstimatedCost: estimatedCost.total,
                },
            }
        };

        let { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .insert(insertData)
            .select()
            .single() as { data: any; error: any };

        // Handle schema backwards compat if processing_progress columns are missing
        if (projectError && projectError.message?.includes('Could not find')) {
            const legacyBase = { ...insertData };
            delete legacyBase.audio_expires_at;
            insertData = {
                ...legacyBase,
                user_id: user.id,
                title,
                audio_file_name: sanitizedBaseName,
                audio_file_size: size,
                audio_duration: estimatedDuration,
                audio_fingerprint: pseudoFingerprint,
                status: 'uploading',
                performance_level: processingTier,
                metadata: {
                    analysis_options: analysisOptions,
                    billing: {
                        uploadReservationId: reservation.id,
                        uploadEstimatedHold: estimatedHold,
                        uploadEstimatedCost: estimatedCost.total,
                    },
                }
            };

            const retry = await supabaseAdmin
                .from('projects')
                .insert(insertData)
                .select()
                .single() as { data: any; error: any };

            project = retry.data;
            projectError = retry.error;
        }

        if (projectError || !project) {
            console.error('Project creation error:', projectError);
            await releaseReservation(reservation.id, 'Released upload hold after project creation failed').catch((releaseError) => {
                console.error('Failed to release upload reservation after project creation error:', releaseError);
            });
            return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
        }

        // Save roster speakers if provided
        if (rosterSpeakers && Array.isArray(rosterSpeakers)) {
            try {
                const keywords = rosterSpeakers.map((speaker: any) => ({
                    rosterSpeakerId: speaker.id,
                    keywords: [speaker.name.toLowerCase()], // simplified
                    autoGenerated: true
                }));

                await (supabaseAdmin.from('projects') as any)
                    .update({
                        preset_speakers: rosterSpeakers,
                        speaker_keywords: keywords
                    })
                    .eq('id', project.id);
            } catch (e) {
                console.error('Failed to save roster speakers:', e);
            }
        }

        // Generate path based on project and sanitized name
        const objectKey = `${project.id}/${sanitizedBaseName}`;
        const uploadToken = createUploadToken({
            projectId: project.id,
            objectKey,
            audioFingerprint: pseudoFingerprint,
            userId: user.id,
            exp: Math.floor(Date.now() / 1000) + 3600
        });

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: objectKey,
            ContentType: normalizedType,
        });

        // 1-hour expiration should be plenty for even large uploads
        const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });

        return NextResponse.json({
            presignedUrl,
            objectKey,
            projectId: project.id,
            audioFingerprint: pseudoFingerprint,
            uploadToken
        });
    } catch (error) {
        console.error('Init upload error:', error);
        const billingResponse = billingErrorResponse(error);
        if (billingResponse.status === 402) {
            return billingResponse;
        }
        return NextResponse.json(
            { error: 'Failed to initialize upload' },
            { status: 500 }
        );
    }
}
