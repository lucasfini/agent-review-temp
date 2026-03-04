# Cloudflare R2 Migration Plan
**Goal:** Migrate AudioRepurpose off Supabase Storage onto Cloudflare R2 to completely bypass Supabase's strict egress quota limits ($0 bandwidth egress on R2).

## 1. Required Packages
Since R2 uses the exact same API as Amazon S3, we will use the official AWS SDK v3.

Run this to install the required packages:
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## 2. Infrastructure Setup (`lib/r2.ts`)
Create a new file `lib/r2.ts` to export the initialized standard S3 client tied to your existing R2 environment variables.

```typescript
import { S3Client } from '@aws-sdk/client-s3';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'audiorepurpose';
```

## 3. Server-Side Uploads Modification
We need to swap every instance of `supabaseAdmin.storage.from('audio-files').upload(...)` with a PutObject command via the AWS SDK.

### Locations to Check:
- `app/api/upload/route.ts` (Handles direct uploads)
- `app/api/upload/finalize/route.ts` (Handles chunked/assembled uploads)
- `app/api/upload/url/route.ts` (Handles YouTube/URL downloads and storage)
- `app/api/integrations/zoom/webhook/route.ts` (if Zoom recordings sink to storage)

**Old Upload Method:**
```typescript
await supabaseAdmin.storage
  .from('audio-files')
  .upload(`${projectId}/${fileName}`, fileBuffer);
```

**New Upload Method:**
```typescript
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';

await r2Client.send(new PutObjectCommand({
  Bucket: BUCKET_NAME,
  Key: `${projectId}/${fileName}`,
  Body: fileBuffer,
  ContentType: fileType,
}));
```

## 4. Frontend Audio Playback (Pre-Signed URLs)
The biggest egress burner is the frontend Dashboard requesting audio files from Supabase. We must modify the frontend components to fetch temporary playback links from R2 instead.

### Location to Change:
- `app/dashboard/projects/page.tsx` (Inside `useEffect` fetching `audioUrl`)

**Old URL Fetch:**
```typescript
const { data } = await supabase.storage
  .from('audio-files')
  .createSignedUrl(`${selectedProject.id}/${selectedProject.audio_file_name}`, 3600);
setAudioUrl(data.signedUrl);
```

**Because clients cannot hold AWS secret keys safely, we must create a proxy API route:**
1. Create `app/api/projects/[projectId]/audio-url/route.ts`
2. Have the frontend `fetch('/api/projects/.../audio-url')` to get the URL.

**The New API Route Implementation:**
```typescript
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, BUCKET_NAME } from '@/lib/r2';

// ... auth check ...

const command = new GetObjectCommand({
  Bucket: BUCKET_NAME,
  Key: `${projectId}/${project.audio_file_name}`,
});

// Generate 1-hour signed URL from R2
const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
return NextResponse.json({ signedUrl });
```

## 5. Deleting Audio Files (Optional)
If a user deletes a project in `app/api/projects/[id]/route.ts` or `app/api/narrative-coverage/delete/route.ts`, ensure S3 object deletion is used to clear space.

```typescript
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

await r2Client.send(new DeleteObjectCommand({
  Bucket: BUCKET_NAME,
  Key: `${projectId}/${fileName}`,
}));
```

## Acceptance Steps
1. Attempt an upload flow on localhost using the `.env.local` R2 keys.
2. Confirm the file appears in the Cloudflare R2 Dashboard.
3. Open the project in the UI and confirm the `audioUrl` plays successfully from the Cloudflare R2 pre-signed endpoint.
4. Verify Supabase "Storage Egress" stays at 0 bytes during UI playback.
