import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SaveExportPayload = {
  filename: string;
  format: 'json' | 'pdf';
  contentBase64: string;
};

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as SaveExportPayload;
    if (!payload?.filename || !payload?.format || !payload?.contentBase64) {
      return NextResponse.json({ error: 'Missing payload fields' }, { status: 400 });
    }

    const safeName = sanitizeFilename(payload.filename);
    const targetDir =
      payload.format === 'pdf'
        ? path.join(process.cwd(), 'docs', 'pdfs')
        : path.join(process.cwd(), 'docs', 'jsons');

    await fs.mkdir(targetDir, { recursive: true });

    const targetPath = path.join(targetDir, safeName);
    const fileBuffer = Buffer.from(payload.contentBase64, 'base64');
    await fs.writeFile(targetPath, fileBuffer);

    return NextResponse.json({ success: true, path: targetPath });
  } catch (error: any) {
    console.error('[EXPORT] Failed to save export locally:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to save export locally' },
      { status: 500 }
    );
  }
}
