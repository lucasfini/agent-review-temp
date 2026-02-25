/**
 * Export utilities for downloading content in various formats
 */

import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { formatTime } from '@/lib/time-utils';
import { getSpeakerDisplayName } from '@/lib/name-extraction';

interface ExportOutput {
  id: string;
  title: string;
  content: string;
  platform: string;
  type: string;
  created_at: string;
  metadata?: {
    platform?: string;
    theme?: string;
    [key: string]: any;
  };
}

interface Chapter {
  title: string;
  start_time: number;
  end_time: number;
  description?: string;
}

interface Takeaway {
  takeaway: string;
  timestamp?: number;
}

interface SocialQuote {
  quote: string;
  speaker?: string;
  timestamp?: number;
}

interface ExportProject {
  id: string;
  title: string;
  outputs: ExportOutput[];
  // Core content fields
  transcription_text?: string;
  ai_summary?: string;
  chapters?: Chapter[];
  key_takeaways?: Takeaway[];
  social_quotes?: SocialQuote[];
  speaker_data?: any;
}

export type CoreContentType = 'transcript' | 'conversation' | 'summary' | 'chapters' | 'takeaways' | 'quotes';

export interface ExportManifestItem {
  projectId: string;
  projectTitle: string;
  selectedBlockIds: string[] | 'ALL';
  selectedCoreContent?: CoreContentType[];
}

export type ExportFormat = 'markdown' | 'pdf' | 'json' | 'plaintext';

interface SpeakerRosterEntry {
  id: string;
  name: string;
  role?: string | null;
  segmentCount: number;
  totalDuration: number;
}

/**
 * Sanitize filename for filesystem
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

/**
 * Get file extension for format
 */
function getExtension(format: ExportFormat): string {
  switch (format) {
    case 'markdown': return 'md';
    case 'json': return 'json';
    case 'plaintext': return 'txt';
    case 'pdf': return 'pdf';
    default: return 'txt';
  }
}

/**
 * Format a single output as markdown
 */
function formatAsMarkdown(output: ExportOutput, projectTitle: string): string {
  const platform = output.metadata?.platform || output.platform || output.type;
  const theme = output.metadata?.theme ? ` (${output.metadata.theme})` : '';
  const date = new Date(output.created_at).toLocaleDateString();

  return `# ${output.title}

**Project:** ${projectTitle}
**Platform:** ${platform}${theme}
**Generated:** ${date}

---

${output.content}

---
*Exported from AudioRepurpose*
`;
}

/**
 * Format a single output as plain text
 */
function formatAsPlainText(output: ExportOutput, projectTitle: string): string {
  const platform = output.metadata?.platform || output.platform || output.type;
  const date = new Date(output.created_at).toLocaleDateString();

  return `${output.title}
${'='.repeat(output.title.length)}

Project: ${projectTitle}
Platform: ${platform}
Generated: ${date}

${'-'.repeat(40)}

${output.content}

${'-'.repeat(40)}
Exported from AudioRepurpose
`;
}

/**
 * Format duration in seconds to MM:SS format
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRoleLabel(role?: string | null): string | null {
  if (!role) return null;
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseSpeakerData(project: ExportProject): any | null {
  if (!project.speaker_data) return null;
  if (typeof project.speaker_data === 'string') {
    try {
      return JSON.parse(project.speaker_data);
    } catch {
      return null;
    }
  }
  return project.speaker_data;
}

function buildSpeakerRoster(speakerData: any): SpeakerRosterEntry[] {
  if (!speakerData?.speakers) return [];
  const segments = Array.isArray(speakerData.segments) ? speakerData.segments : [];
  const totals: Record<string, { duration: number; count: number }> = {};

  for (const seg of segments) {
    const speakerId = seg.finalSpeakerId || seg.speakerId;
    if (!speakerId) continue;
    const duration = Number.isFinite(seg.endTime) && Number.isFinite(seg.startTime)
      ? Math.max(0, seg.endTime - seg.startTime)
      : 0;
    if (!totals[speakerId]) {
      totals[speakerId] = { duration: 0, count: 0 };
    }
    totals[speakerId].duration += duration;
    totals[speakerId].count += 1;
  }

  const roster = Object.entries(speakerData.speakers).map(([id, speaker]: [string, any]) => ({
    id,
    name: getSpeakerDisplayName({ ...speaker, id }),
    role: speaker?.role || null,
    segmentCount: totals[id]?.count || 0,
    totalDuration: totals[id]?.duration || 0,
  }));

  return roster.sort((a, b) => b.totalDuration - a.totalDuration);
}

function formatConversationTimestamp(startTime?: number, endTime?: number): string {
  if (!Number.isFinite(startTime)) return '[00:00]';
  const start = formatTime(startTime as number);
  const duration = Number.isFinite(endTime)
    ? Math.max(0, (endTime as number) - (startTime as number))
    : null;
  if (duration === null) return `[${start}]`;
  return `[${start} + ${duration.toFixed(1)}s]`;
}

/**
 * Format core content as markdown
 */
function formatCoreContentAsMarkdown(
  project: ExportProject,
  contentType: CoreContentType
): string | null {
  const date = new Date().toLocaleDateString();

  switch (contentType) {
    case 'transcript':
      if (!project.transcription_text) return null;
      return `# Transcript

**Project:** ${project.title}
**Exported:** ${date}

---

${project.transcription_text}

---
*Exported from AudioRepurpose*
`;

    case 'conversation':
      if (!project.speaker_data) return null;
      const speakerData = parseSpeakerData(project);
      if (!speakerData) return null;

      let conversationText = '';
      if (speakerData.segments) {
        conversationText = speakerData.segments
          .map((seg: any) => {
            const segmentSpeakerId = seg.finalSpeakerId || seg.speakerId;
            const speakerName = speakerData.speakers?.[segmentSpeakerId]
              ? getSpeakerDisplayName({ ...speakerData.speakers[segmentSpeakerId], id: segmentSpeakerId })
              : segmentSpeakerId;
            const timestamp = formatConversationTimestamp(seg.startTime, seg.endTime);
            return `**${speakerName}** ${timestamp}: ${seg.text}`;
          })
          .join('\n\n');
      }

      const roster = buildSpeakerRoster(speakerData);
      const rosterText = roster.length > 0
        ? roster
          .map((speaker) => {
            const roleLabel = formatRoleLabel(speaker.role);
            const duration = speaker.totalDuration ? ` • ${speaker.totalDuration.toFixed(1)}s` : '';
            const segments = ` • ${speaker.segmentCount} segment${speaker.segmentCount === 1 ? '' : 's'}`;
            return `- **${speaker.name}**${roleLabel ? ` — ${roleLabel}` : ''}${duration}${segments}`;
          })
          .join('\n')
        : '- No speakers available';

      return `# Conversation

**Project:** ${project.title}
**Exported:** ${date}

---

## Speakers

${rosterText}

---

## Conversation

${conversationText || project.transcription_text}

---
*Exported from AudioRepurpose*
`;

    case 'summary':
      if (!project.ai_summary) return null;
      return `# Summary

**Project:** ${project.title}
**Exported:** ${date}

---

${project.ai_summary}

---
*Exported from AudioRepurpose*
`;

    case 'chapters':
      if (!project.chapters || project.chapters.length === 0) return null;
      const chaptersText = project.chapters
        .map((ch, idx) => `## ${idx + 1}. ${ch.title}\n\n**Time:** ${formatDuration(ch.start_time)} - ${formatDuration(ch.end_time)}${ch.description ? `\n\n${ch.description}` : ''}`)
        .join('\n\n---\n\n');

      return `# Chapters

**Project:** ${project.title}
**Total Chapters:** ${project.chapters.length}
**Exported:** ${date}

---

${chaptersText}

---
*Exported from AudioRepurpose*
`;

    case 'takeaways':
      if (!project.key_takeaways || project.key_takeaways.length === 0) return null;
      const takeawaysText = project.key_takeaways
        .map((t, idx) => `${idx + 1}. ${t.takeaway}${t.timestamp ? ` *(${formatDuration(t.timestamp)})*` : ''}`)
        .join('\n\n');

      return `# Key Takeaways

**Project:** ${project.title}
**Total Takeaways:** ${project.key_takeaways.length}
**Exported:** ${date}

---

${takeawaysText}

---
*Exported from AudioRepurpose*
`;

    case 'quotes':
      if (!project.social_quotes || project.social_quotes.length === 0) return null;
      const quotesText = project.social_quotes
        .map((q, idx) => `> "${q.quote}"${q.speaker ? `\n> — ${q.speaker}` : ''}${q.timestamp ? ` *(${formatDuration(q.timestamp)})*` : ''}`)
        .join('\n\n---\n\n');

      return `# Quotes

**Project:** ${project.title}
**Total Quotes:** ${project.social_quotes.length}
**Exported:** ${date}

---

${quotesText}

---
*Exported from AudioRepurpose*
`;

    default:
      return null;
  }
}

/**
 * Format core content as plain text
 */
function formatCoreContentAsPlainText(
  project: ExportProject,
  contentType: CoreContentType
): string | null {
  const date = new Date().toLocaleDateString();

  switch (contentType) {
    case 'transcript':
      if (!project.transcription_text) return null;
      return `TRANSCRIPT
${'='.repeat(10)}

Project: ${project.title}
Exported: ${date}

${'-'.repeat(40)}

${project.transcription_text}

${'-'.repeat(40)}
Exported from AudioRepurpose
`;

    case 'conversation':
      if (!project.speaker_data) return null;
      const speakerData = parseSpeakerData(project);
      if (!speakerData) return null;

      let conversationText = '';
      if (speakerData.segments) {
        conversationText = speakerData.segments
          .map((seg: any) => {
            const segmentSpeakerId = seg.finalSpeakerId || seg.speakerId;
            const speakerName = speakerData.speakers?.[segmentSpeakerId]
              ? getSpeakerDisplayName({ ...speakerData.speakers[segmentSpeakerId], id: segmentSpeakerId })
              : segmentSpeakerId;
            const timestamp = formatConversationTimestamp(seg.startTime, seg.endTime);
            return `${timestamp} ${speakerName}: ${seg.text}`;
          })
          .join('\n\n');
      }

      const roster = buildSpeakerRoster(speakerData);
      const rosterText = roster.length > 0
        ? roster
          .map((speaker) => {
            const roleLabel = formatRoleLabel(speaker.role);
            const duration = speaker.totalDuration ? ` • ${speaker.totalDuration.toFixed(1)}s` : '';
            const segments = ` • ${speaker.segmentCount} segment${speaker.segmentCount === 1 ? '' : 's'}`;
            return `- ${speaker.name}${roleLabel ? ` — ${roleLabel}` : ''}${duration}${segments}`;
          })
          .join('\n')
        : '- No speakers available';

      return `CONVERSATION
${'='.repeat(12)}

Project: ${project.title}
Exported: ${date}

${'-'.repeat(40)}

SPEAKERS
${rosterText}

${'-'.repeat(40)}

CONVERSATION

${conversationText || project.transcription_text}

${'-'.repeat(40)}
Exported from AudioRepurpose
`;

    case 'summary':
      if (!project.ai_summary) return null;
      return `SUMMARY
${'='.repeat(7)}

Project: ${project.title}
Exported: ${date}

${'-'.repeat(40)}

${project.ai_summary}

${'-'.repeat(40)}
Exported from AudioRepurpose
`;

    case 'chapters':
      if (!project.chapters || project.chapters.length === 0) return null;
      const chaptersText = project.chapters
        .map((ch, idx) => `${idx + 1}. ${ch.title} [${formatDuration(ch.start_time)} - ${formatDuration(ch.end_time)}]${ch.description ? `\n   ${ch.description}` : ''}`)
        .join('\n\n');

      return `CHAPTERS
${'='.repeat(8)}

Project: ${project.title}
Total Chapters: ${project.chapters.length}
Exported: ${date}

${'-'.repeat(40)}

${chaptersText}

${'-'.repeat(40)}
Exported from AudioRepurpose
`;

    case 'takeaways':
      if (!project.key_takeaways || project.key_takeaways.length === 0) return null;
      const takeawaysText = project.key_takeaways
        .map((t, idx) => `${idx + 1}. ${t.takeaway}${t.timestamp ? ` (${formatDuration(t.timestamp)})` : ''}`)
        .join('\n\n');

      return `KEY TAKEAWAYS
${'='.repeat(13)}

Project: ${project.title}
Total Takeaways: ${project.key_takeaways.length}
Exported: ${date}

${'-'.repeat(40)}

${takeawaysText}

${'-'.repeat(40)}
Exported from AudioRepurpose
`;

    case 'quotes':
      if (!project.social_quotes || project.social_quotes.length === 0) return null;
      const quotesText = project.social_quotes
        .map((q, idx) => `"${q.quote}"${q.speaker ? `\n  - ${q.speaker}` : ''}${q.timestamp ? ` (${formatDuration(q.timestamp)})` : ''}`)
        .join('\n\n');

      return `QUOTES
${'='.repeat(6)}

Project: ${project.title}
Total Quotes: ${project.social_quotes.length}
Exported: ${date}

${'-'.repeat(40)}

${quotesText}

${'-'.repeat(40)}
Exported from AudioRepurpose
`;

    default:
      return null;
  }
}

/**
 * Format outputs as JSON
 */
function formatAsJSON(projects: ExportProject[], manifest: ExportManifestItem[]): string {
  const exportData = {
    exportedAt: new Date().toISOString(),
    projects: projects.map(project => {
      const manifestItem = manifest.find(m => m.projectId === project.id);
      const selectedIds = manifestItem?.selectedBlockIds;
      const selectedCore = manifestItem?.selectedCoreContent || [];

      const outputs = !selectedIds || (Array.isArray(selectedIds) && selectedIds.length === 0)
        ? []
        : selectedIds === 'ALL'
          ? project.outputs
          : project.outputs.filter(o => (selectedIds as string[]).includes(o.id));

      // Build core content object
      const coreContent: Record<string, any> = {};
      if (selectedCore.includes('transcript') && project.transcription_text) {
        coreContent.transcript = project.transcription_text;
      }
      if (selectedCore.includes('conversation') && project.speaker_data) {
        const speakerData = parseSpeakerData(project);
        const roster = speakerData ? buildSpeakerRoster(speakerData) : [];
        coreContent.conversation = {
          speakers: speakerData?.speakers,
          segments: speakerData?.segments,
          speakerRoster: roster.length > 0 ? roster.map((speaker) => ({
            id: speaker.id,
            name: speaker.name,
            role: speaker.role || undefined,
            segmentCount: speaker.segmentCount,
            totalDuration: speaker.totalDuration,
          })) : undefined,
        };
      }
      if (selectedCore.includes('summary') && project.ai_summary) {
        coreContent.summary = project.ai_summary;
      }
      if (selectedCore.includes('chapters') && project.chapters) {
        coreContent.chapters = project.chapters;
      }
      if (selectedCore.includes('takeaways') && project.key_takeaways) {
        coreContent.takeaways = project.key_takeaways;
      }
      if (selectedCore.includes('quotes') && project.social_quotes) {
        coreContent.quotes = project.social_quotes;
      }

      return {
        id: project.id,
        title: project.title,
        coreContent: Object.keys(coreContent).length > 0 ? coreContent : undefined,
        outputs: outputs.length > 0 ? outputs.map(o => ({
          id: o.id,
          title: o.title,
          content: o.content,
          platform: o.metadata?.platform || o.platform,
          type: o.type,
          theme: o.metadata?.theme,
          createdAt: o.created_at,
        })) : undefined,
      };
    }),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Map file extension to MIME type for the save picker
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json': return 'application/json';
    case 'pdf': return 'application/pdf';
    case 'zip': return 'application/zip';
    case 'md': return 'text/markdown';
    case 'txt': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

/**
 * Save blob via native "Save As" dialog (File System Access API).
 * Falls back to auto-download on unsupported browsers.
 */
async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const ext = filename.split('.').pop() || 'bin';
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: ext.toUpperCase() + ' file',
            accept: { [getMimeType(filename)]: ['.' + ext] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: any) {
      // User cancelled the dialog — don't fall through to auto-download
      if (err?.name === 'AbortError') return;
      // Other errors (e.g. SecurityError) — fall back to auto-download
    }
  }

  // Fallback: auto-download to Downloads folder
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export content as a ZIP file (for markdown and plaintext)
 */
async function exportAsZip(
  projects: ExportProject[],
  manifest: ExportManifestItem[],
  format: 'markdown' | 'plaintext'
): Promise<void> {
  const zip = new JSZip();
  const ext = getExtension(format);
  const isMultiProject = projects.length > 1;

  for (const project of projects) {
    const manifestItem = manifest.find(m => m.projectId === project.id);
    if (!manifestItem) continue;

    const selectedIds = manifestItem.selectedBlockIds;
    const selectedCore = manifestItem.selectedCoreContent || [];
    const outputs = !selectedIds || (Array.isArray(selectedIds) && selectedIds.length === 0)
      ? []
      : selectedIds === 'ALL'
        ? project.outputs
        : project.outputs.filter(o => (selectedIds as string[]).includes(o.id));

    // Create folder for project if multiple projects
    const folder = isMultiProject
      ? zip.folder(sanitizeFilename(project.title))
      : zip;

    if (!folder) continue;

    // Add core content files
    if (selectedCore.length > 0) {
      const coreFolder = folder.folder('Core_Content');
      if (coreFolder) {
        for (const contentType of selectedCore) {
          const content = format === 'markdown'
            ? formatCoreContentAsMarkdown(project, contentType)
            : formatCoreContentAsPlainText(project, contentType);

          if (content) {
            const filename = `${contentType}.${ext}`;
            coreFolder.file(filename, content);
          }
        }
      }
    }

    // Group outputs by platform for organization
    if (outputs.length > 0) {
      const byPlatform: Record<string, ExportOutput[]> = {};
      for (const output of outputs) {
        const platform = output.metadata?.platform || output.platform || 'General';
        if (!byPlatform[platform]) byPlatform[platform] = [];
        byPlatform[platform].push(output);
      }

      // Add files organized by platform
      for (const [platform, platformOutputs] of Object.entries(byPlatform)) {
        const platformFolder = folder.folder(sanitizeFilename(platform));
        if (!platformFolder) continue;

        for (const output of platformOutputs) {
          const content = format === 'markdown'
            ? formatAsMarkdown(output, project.title)
            : formatAsPlainText(output, project.title);

          const filename = `${sanitizeFilename(output.title)}.${ext}`;
          platformFolder.file(filename, content);
        }
      }
    }
  }

  // Generate ZIP
  const blob = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = isMultiProject
    ? `audiorepurpose-export-${timestamp}.zip`
    : `${sanitizeFilename(projects[0].title)}-export-${timestamp}.zip`;

  await saveBlob(blob, filename);
}

/**
 * Export content as a single JSON file
 */
async function exportAsJSON(
  projects: ExportProject[],
  manifest: ExportManifestItem[]
): Promise<void> {
  const content = formatAsJSON(projects, manifest);
  const blob = new Blob([content], { type: 'application/json' });
  const timestamp = new Date().toISOString().split('T')[0];
  const isMultiProject = projects.length > 1;
  const filename = isMultiProject
    ? `audiorepurpose-export-${timestamp}.json`
    : `${sanitizeFilename(projects[0].title)}-export-${timestamp}.json`;

  await saveBlob(blob, filename);
  void maybeSaveExportLocally(filename, 'json', content);
}

/**
 * Export as single text/markdown file (non-ZIP for single items)
 */
async function exportAsSingleFile(
  projects: ExportProject[],
  manifest: ExportManifestItem[],
  format: 'markdown' | 'plaintext'
): Promise<void> {
  const ext = getExtension(format);
  const allContent: string[] = [];

  for (const project of projects) {
    const manifestItem = manifest.find(m => m.projectId === project.id);
    if (!manifestItem) continue;

    const selectedIds = manifestItem.selectedBlockIds;
    const selectedCore = manifestItem.selectedCoreContent || [];
    const outputs = !selectedIds || (Array.isArray(selectedIds) && selectedIds.length === 0)
      ? []
      : selectedIds === 'ALL'
        ? project.outputs
        : project.outputs.filter(o => (selectedIds as string[]).includes(o.id));

    // Add core content first
    for (const contentType of selectedCore) {
      const content = format === 'markdown'
        ? formatCoreContentAsMarkdown(project, contentType)
        : formatCoreContentAsPlainText(project, contentType);
      if (content) {
        allContent.push(content);
      }
    }

    // Add generated outputs
    for (const output of outputs) {
      const content = format === 'markdown'
        ? formatAsMarkdown(output, project.title)
        : formatAsPlainText(output, project.title);
      allContent.push(content);
    }
  }

  const combinedContent = allContent.join('\n\n---\n\n');
  const mimeType = format === 'markdown' ? 'text/markdown' : 'text/plain';
  const blob = new Blob([combinedContent], { type: mimeType });
  const timestamp = new Date().toISOString().split('T')[0];
  const isMultiProject = projects.length > 1;
  const filename = isMultiProject
    ? `audiorepurpose-export-${timestamp}.${ext}`
    : `${sanitizeFilename(projects[0].title)}-export-${timestamp}.${ext}`;

  await saveBlob(blob, filename);
}

/**
 * Export content as PDF
 */
async function exportAsPDF(
  projects: ExportProject[],
  manifest: ExportManifestItem[]
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let yPosition = margin;
  let isFirstItem = true;

  // Helper to add a new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
      return true;
    }
    return false;
  };

  // Helper to add wrapped text
  const addWrappedText = (text: string, fontSize: number, isBold = false): number => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');

    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = fontSize * 0.4;

    for (const line of lines) {
      checkPageBreak(lineHeight + 2);
      doc.text(line, margin, yPosition);
      yPosition += lineHeight + 1;
    }

    return lines.length;
  };

  // Helper to add core content page
  const addCoreContentPage = (project: ExportProject, contentType: CoreContentType, title: string, content: string) => {
    if (!isFirstItem) {
      doc.addPage();
      yPosition = margin;
    }
    isFirstItem = false;

    const date = new Date().toLocaleDateString();

    // Title
    doc.setTextColor(79, 70, 229); // Indigo color for core content
    addWrappedText(title, 18, true);
    yPosition += 4;

    // Metadata
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Project: ${project.title}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Exported: ${date}`, margin, yPosition);
    yPosition += 8;

    // Divider line
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 8;

    // Content
    doc.setTextColor(0, 0, 0);
    addWrappedText(content, 11);
    yPosition += 10;

    // Footer
    checkPageBreak(15);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 5;
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Exported from AudioRepurpose', margin, yPosition);
  };

  const addSpeakersPage = (project: ExportProject, roster: SpeakerRosterEntry[]) => {
    if (!isFirstItem) {
      doc.addPage();
      yPosition = margin;
    }
    isFirstItem = false;

    const date = new Date().toLocaleDateString();

    doc.setTextColor(79, 70, 229);
    addWrappedText('Speakers', 18, true);
    yPosition += 4;

    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Project: ${project.title}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Exported: ${date}`, margin, yPosition);
    yPosition += 8;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 8;

    doc.setTextColor(0, 0, 0);
    if (roster.length === 0) {
      addWrappedText('No speakers available.', 11);
      return;
    }

    for (const speaker of roster) {
      const roleLabel = formatRoleLabel(speaker.role);
      const duration = speaker.totalDuration ? ` • ${speaker.totalDuration.toFixed(1)}s` : '';
      const segments = ` • ${speaker.segmentCount} segment${speaker.segmentCount === 1 ? '' : 's'}`;
      const line = `${speaker.name}${roleLabel ? ` — ${roleLabel}` : ''}${duration}${segments}`;
      addWrappedText(line, 11);
      yPosition += 2;
    }
  };

  // Process each project
  for (const project of projects) {
    const manifestItem = manifest.find(m => m.projectId === project.id);
    if (!manifestItem) continue;

    const selectedIds = manifestItem.selectedBlockIds;
    const selectedCore = manifestItem.selectedCoreContent || [];
    const outputs = !selectedIds || (Array.isArray(selectedIds) && selectedIds.length === 0)
      ? []
      : selectedIds === 'ALL'
        ? project.outputs
        : project.outputs.filter(o => (selectedIds as string[]).includes(o.id));

    // Process core content first
    for (const contentType of selectedCore) {
      const titles: Record<CoreContentType, string> = {
        transcript: 'Transcript',
        conversation: 'Conversation',
        summary: 'Summary',
        chapters: 'Chapters',
        takeaways: 'Key Takeaways',
        quotes: 'Quotes',
      };

      let content = '';
      switch (contentType) {
        case 'transcript':
          content = project.transcription_text || '';
          break;
        case 'conversation':
          if (project.speaker_data) {
            const sd = parseSpeakerData(project);
            if (sd.segments) {
              content = sd.segments.map((seg: any) => {
                const segmentSpeakerId = seg.finalSpeakerId || seg.speakerId;
                const name = sd.speakers?.[segmentSpeakerId]
                  ? getSpeakerDisplayName({ ...sd.speakers[segmentSpeakerId], id: segmentSpeakerId })
                  : segmentSpeakerId;
                const timestamp = formatConversationTimestamp(seg.startTime, seg.endTime);
                return `${timestamp} ${name}: ${seg.text}`;
              }).join('\n\n');
            }
          }
          break;
        case 'summary':
          content = project.ai_summary || '';
          break;
        case 'chapters':
          if (project.chapters) {
            content = project.chapters.map((ch, idx) =>
              `${idx + 1}. ${ch.title} [${formatDuration(ch.start_time)} - ${formatDuration(ch.end_time)}]${ch.description ? `\n${ch.description}` : ''}`
            ).join('\n\n');
          }
          break;
        case 'takeaways':
          if (project.key_takeaways) {
            content = project.key_takeaways.map((t, idx) =>
              `${idx + 1}. ${t.takeaway}${t.timestamp ? ` (${formatDuration(t.timestamp)})` : ''}`
            ).join('\n\n');
          }
          break;
        case 'quotes':
          if (project.social_quotes) {
            content = project.social_quotes.map(q =>
              `"${q.quote}"${q.speaker ? `\n— ${q.speaker}` : ''}${q.timestamp ? ` (${formatDuration(q.timestamp)})` : ''}`
            ).join('\n\n');
          }
          break;
      }

      if (content) {
        if (contentType === 'conversation' && project.speaker_data) {
          const sd = parseSpeakerData(project);
          const roster = sd ? buildSpeakerRoster(sd) : [];
          addSpeakersPage(project, roster);
        }
        addCoreContentPage(project, contentType, titles[contentType], content);
      }
    }

    // Process each output
    for (const output of outputs) {
      // Add page break between items (not before first)
      if (!isFirstItem) {
        doc.addPage();
        yPosition = margin;
      }
      isFirstItem = false;

      const platform = output.metadata?.platform || output.platform || output.type;
      const theme = output.metadata?.theme ? ` (${output.metadata.theme})` : '';
      const date = new Date(output.created_at).toLocaleDateString();

      // Title
      doc.setTextColor(30, 64, 175); // Blue color
      addWrappedText(output.title, 18, true);
      yPosition += 4;

      // Metadata
      doc.setTextColor(100, 100, 100); // Gray
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Project: ${project.title}`, margin, yPosition);
      yPosition += 5;
      doc.text(`Platform: ${platform}${theme}`, margin, yPosition);
      yPosition += 5;
      doc.text(`Generated: ${date}`, margin, yPosition);
      yPosition += 8;

      // Divider line
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 8;

      // Content
      doc.setTextColor(0, 0, 0); // Black
      addWrappedText(output.content, 11);
      yPosition += 10;

      // Footer divider
      checkPageBreak(15);
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 5;

      // Footer text
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('Exported from AudioRepurpose', margin, yPosition);
    }
  }

  // Generate filename and download
  const timestamp = new Date().toISOString().split('T')[0];
  const isMultiProject = projects.length > 1;
  const filename = isMultiProject
    ? `audiorepurpose-export-${timestamp}.pdf`
    : `${sanitizeFilename(projects[0].title)}-export-${timestamp}.pdf`;

  const arrayBuffer = doc.output('arraybuffer');
  void maybeSaveExportLocally(filename, 'pdf', arrayBuffer);
  const pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
  await saveBlob(pdfBlob, filename);
}

function shouldSaveExportLocally(): boolean {
  if (typeof window === 'undefined') return false;
  return process.env.NEXT_PUBLIC_SAVE_EXPORT_LOCALLY === 'true';
}

function base64FromString(value: string): string {
  // Preserve unicode safely
  return btoa(unescape(encodeURIComponent(value)));
}

function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function maybeSaveExportLocally(
  filename: string,
  format: 'json' | 'pdf',
  content: string | ArrayBuffer
): Promise<void> {
  if (!shouldSaveExportLocally()) return;

  try {
    const contentBase64 = typeof content === 'string'
      ? base64FromString(content)
      : base64FromArrayBuffer(content);

    await fetch('/api/debug/save-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        format,
        contentBase64,
      }),
    });
  } catch (error) {
    console.warn('[EXPORT] Failed to save export locally:', error);
  }
}

/**
 * Count total selected outputs and core content
 */
function countSelectedItems(
  projects: ExportProject[],
  manifest: ExportManifestItem[]
): { blocks: number; core: number; total: number } {
  let blocks = 0;
  let core = 0;
  for (const project of projects) {
    const manifestItem = manifest.find(m => m.projectId === project.id);
    if (!manifestItem) continue;

    // Count block selections
    if (manifestItem.selectedBlockIds === 'ALL') {
      blocks += project.outputs.length;
    } else if (Array.isArray(manifestItem.selectedBlockIds)) {
      blocks += manifestItem.selectedBlockIds.length;
    }

    // Count core content selections
    if (manifestItem.selectedCoreContent) {
      core += manifestItem.selectedCoreContent.length;
    }
  }
  return { blocks, core, total: blocks + core };
}

/**
 * Main export function
 */
export async function exportContent(
  projects: ExportProject[],
  manifest: ExportManifestItem[],
  format: ExportFormat
): Promise<{ success: boolean; message: string }> {
  try {
    const counts = countSelectedItems(projects, manifest);

    if (counts.total === 0) {
      return { success: false, message: 'No content selected for export' };
    }

    console.log(`[EXPORT] Exporting ${counts.total} items (${counts.core} core, ${counts.blocks} generated) as ${format}`);

    switch (format) {
      case 'json':
        await exportAsJSON(projects, manifest);
        break;

      case 'markdown':
        // Use ZIP for multiple files, single file for 1-3 items
        if (counts.total <= 3) {
          await exportAsSingleFile(projects, manifest, 'markdown');
        } else {
          await exportAsZip(projects, manifest, 'markdown');
        }
        break;

      case 'plaintext':
        // Use ZIP for multiple files, single file for 1-3 items
        if (counts.total <= 3) {
          await exportAsSingleFile(projects, manifest, 'plaintext');
        } else {
          await exportAsZip(projects, manifest, 'plaintext');
        }
        break;

      case 'pdf':
        await exportAsPDF(projects, manifest);
        break;

      default:
        return { success: false, message: `Unknown format: ${format}` };
    }

    return {
      success: true,
      message: `Successfully exported ${counts.total} item${counts.total !== 1 ? 's' : ''} as ${format}`,
    };
  } catch (error) {
    console.error('[EXPORT] Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Export failed',
    };
  }
}
