import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';
// Depending on how many files need scanning, this could take a bit
export const maxDuration = 300;

export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || '';

        // First verify who is making the request using their JWT
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.email === process.env.DEMO_EMAIL || user.email === 'admin@audiorepurpose.com') {
            return NextResponse.json({ error: 'System accounts cannot be deleted' }, { status: 403 });
        }

        // 1. Fetch all projects to find R2 prefixes
        const { data: projects, error: projectsError } = await supabaseAdmin
            .from('projects')
            .select('id')
            .eq('user_id', user.id);

        if (projectsError) {
            console.error('Error fetching projects for deletion:', projectsError);
            // We continue since we still want to delete the user account if possible
        }

        // 2. Delete objects in R2 for each project
        if (projects && projects.length > 0) {
            for (const project of projects) {
                let isTruncated = true;
                let continuationToken: string | undefined;

                while (isTruncated) {
                    try {
                        const listCommand = new ListObjectsV2Command({
                            Bucket: BUCKET_NAME,
                            Prefix: `${project.id}/`,
                            ContinuationToken: continuationToken,
                        });

                        const listedObjects = await r2Client.send(listCommand);

                        if (listedObjects.Contents && listedObjects.Contents.length > 0) {
                            const deleteCommand = new DeleteObjectsCommand({
                                Bucket: BUCKET_NAME,
                                Delete: {
                                    Objects: listedObjects.Contents.map(obj => ({ Key: obj.Key })),
                                    Quiet: true,
                                },
                            });

                            await r2Client.send(deleteCommand);
                        }

                        isTruncated = listedObjects.IsTruncated || false;
                        continuationToken = listedObjects.NextContinuationToken;
                    } catch (r2Error) {
                        console.error(`Failed to delete R2 objects for project ${project.id}:`, r2Error);
                        break; // Break inner loop, continue to next project
                    }
                }
            }
        }

        const projectIds = (projects || []).map(p => p.id);

        const tryDelete = async (
            table: string,
            column: string,
            value: string | string[]
        ) => {
            let query = supabaseAdmin.from(table).delete();
            if (Array.isArray(value)) {
                if (value.length === 0) return;
                query = query.in(column, value);
            } else {
                query = query.eq(column, value);
            }
            const { error } = await query;
            if (error) {
                console.warn(`Delete cleanup warning for ${table}:`, error.message);
            }
        };

        // 3. Delete project-bound data explicitly for safety (covers missing cascades)
        await tryDelete('generation_progress', 'project_id', projectIds);
        await tryDelete('insights', 'project_id', projectIds);
        await tryDelete('narrative_coverage_snapshots', 'project_id', projectIds);
        await tryDelete('outputs', 'project_id', projectIds);

        // 4. Delete user-bound data explicitly for safety (covers missing cascades)
        await tryDelete('integration_imports', 'user_id', user.id);
        await tryDelete('integration_connections', 'user_id', user.id);
        await tryDelete('narrative_goals', 'user_id', user.id);
        await tryDelete('usage_events', 'user_id', user.id);
        await tryDelete('credit_transactions', 'user_id', user.id);
        await tryDelete('account_credits', 'user_id', user.id);

        // 5. Explicitly delete projects first to avoid FK constraint issues if CASCADE missing
        await supabaseAdmin
            .from('projects')
            .delete()
            .eq('user_id', user.id);

        // 6. Finally, delete the Supabase Auth user
        const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

        if (deleteUserError) {
            throw deleteUserError;
        }

        return NextResponse.json({ success: true, message: 'Account and associated data deleted successfully' });
    } catch (error: any) {
        console.error('Account deletion final error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fully delete account' }, { status: 500 });
    }
}
