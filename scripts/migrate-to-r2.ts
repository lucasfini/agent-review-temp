import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Setup Supabase (Using Service Role Key to bypass RLS)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Setup Cloudflare R2
const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'audiorepurpose';
const SUPABASE_BUCKET = 'audio-files';

async function migrate() {
    console.log('🚀 Starting migration: Supabase Storage ➡️ Cloudflare R2');

    // 1. Fetch all projects to find their associated audio files
    const { data: projects, error: dbError } = await supabase
        .from('projects')
        .select('id, audio_file_name');

    if (dbError) {
        console.error('❌ Failed to fetch projects:', dbError.message);
        process.exit(1);
    }

    console.log(`\n📋 Found ${projects.length} potential files. Checking Supabase Storage...`);

    let successCount = 0;
    let failureCount = 0;
    let missingCount = 0;

    for (const project of projects) {
        if (!project.audio_file_name) continue;

        const filePath = `${project.id}/${project.audio_file_name}`;
        console.log(`\n📦 Processing: ${filePath}`);

        // 2. Download from Supabase
        const { data: fileData, error: downloadError } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .download(filePath);

        if (downloadError) {
            console.log(`   ⚠️ Skipping (Not found in Supabase): ${downloadError.message}`);
            missingCount++;
            continue;
        }

        // 3. Convert Blob to Node.js Buffer
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 4. Upload to Cloudflare R2
        try {
            await r2.send(
                new PutObjectCommand({
                    Bucket: R2_BUCKET,
                    Key: filePath,
                    Body: buffer,
                    ContentType: fileData.type || 'application/octet-stream',
                })
            );
            console.log(`   ✅ Successfully migrated to R2!`);
            successCount++;
        } catch (r2Error: any) {
            console.error(`   ❌ Failed to upload to R2:`, r2Error.message);
            failureCount++;
        }
    }

    console.log('\n====================================');
    console.log('🏁 Migration Complete!');
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failureCount}`);
    console.log(`⚠️ Missing (Already deleted): ${missingCount}`);
    console.log('====================================\n');
}

migrate().catch((err) => {
    console.error('Fatal Migration Error:', err);
});
