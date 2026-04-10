import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

import { AdminAuthError, requireAdmin } from '@/lib/admin/require-admin';

export const runtime = 'nodejs';

async function safeTailFile(filePath: string, maxLines: number) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const logsDir = path.join(process.cwd(), 'logs', 'conversations');
    const contentGenerationDir = path.join(logsDir, 'content-generation');

    const [summaryTail, rootLogFiles, contentFiles, buildLogTail] = await Promise.all([
      safeTailFile(path.join(logsDir, 'conversation-summary.csv'), 12),
      fs.readdir(logsDir).catch(() => [] as string[]),
      fs.readdir(contentGenerationDir).catch(() => [] as string[]),
      safeTailFile(path.join(process.cwd(), 'build-output.log'), 20),
    ]);

    const recentConversationFiles = rootLogFiles
      .filter((file) => file.endsWith('.json'))
      .sort()
      .slice(-8)
      .reverse();

    const recentContentFiles = contentFiles
      .filter((file) => file.endsWith('.json'))
      .sort()
      .slice(-8)
      .reverse();

    return NextResponse.json({
      success: true,
      logs: {
        summaryTail,
        recentConversationFiles,
        recentContentFiles,
        buildLogTail,
      },
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ADMIN LOGS] Error:', error);
    return NextResponse.json({ error: 'Failed to load logs' }, { status: 500 });
  }
}
