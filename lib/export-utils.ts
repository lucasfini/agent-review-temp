/**
 * Export utilities for downloading content in various formats
 */

import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

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
      if (!project.transcription_text || !project.speaker_data) return null;
      const speakerData = typeof project.speaker_data === 'string'
        ? JSON.parse(project.speaker_data)
        : project.speaker_data;

      let conversationText = '';
      if (speakerData.segments) {
        conversationText = speakerData.segments
          .map((seg: any) => {
            const segmentSpeakerId = seg.finalSpeakerId || seg.speakerId;
            const speakerName = speakerData.speakers?.[segmentSpeakerId]?.finalName || segmentSpeakerId;
            return `**${speakerName}:** ${seg.text}`;
          })
          .join('\n\n');
      }

      return `# Conversation

**Project:** ${project.title}
**Exported:** ${date}

---

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
      if (!project.transcription_text || !project.speaker_data) return null;
      const speakerData = typeof project.speaker_data === 'string'
        ? JSON.parse(project.speaker_data)
        : project.speaker_data;

      let conversationText = '';
      if (speakerData.segments) {
        conversationText = speakerData.segments
          .map((seg: any) => {
            const segmentSpeakerId = seg.finalSpeakerId || seg.speakerId;
            const speakerName = speakerData.speakers?.[segmentSpeakerId]?.finalName || segmentSpeakerId;
            return `${speakerName}: ${seg.text}`;
          })
          .join('\n\n');
      }

      return `CONVERSATION
${'='.repeat(12)}

Project: ${project.title}
Exported: ${date}

${'-'.repeat(40)}

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
        const speakerData = typeof project.speaker_data === 'string'
          ? JSON.parse(project.speaker_data)
          : project.speaker_data;
        coreContent.conversation = {
          speakers: speakerData.speakers,
          segments: speakerData.segments,
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
 * Trigger browser download
 */
function downloadBlob(blob: Blob, filename: string): void {
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

  downloadBlob(blob, filename);
}

/**
 * Export content as a single JSON file
 */
function exportAsJSON(
  projects: ExportProject[],
  manifest: ExportManifestItem[]
): void {
  const content = formatAsJSON(projects, manifest);
  const blob = new Blob([content], { type: 'application/json' });
  const timestamp = new Date().toISOString().split('T')[0];
  const isMultiProject = projects.length > 1;
  const filename = isMultiProject
    ? `audiorepurpose-export-${timestamp}.json`
    : `${sanitizeFilename(projects[0].title)}-export-${timestamp}.json`;

  downloadBlob(blob, filename);
}

/**
 * Export as single text/markdown file (non-ZIP for single items)
 */
function exportAsSingleFile(
  projects: ExportProject[],
  manifest: ExportManifestItem[],
  format: 'markdown' | 'plaintext'
): void {
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

  downloadBlob(blob, filename);
}

/**
 * Export content as PDF
 */
function exportAsPDF(
  projects: ExportProject[],
  manifest: ExportManifestItem[]
): void {
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
            const sd = typeof project.speaker_data === 'string' ? JSON.parse(project.speaker_data) : project.speaker_data;
            if (sd.segments) {
              content = sd.segments.map((seg: any) => {
                const segmentSpeakerId = seg.finalSpeakerId || seg.speakerId;
                const name = sd.speakers?.[segmentSpeakerId]?.finalName || segmentSpeakerId;
                return `${name}: ${seg.text}`;
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

  doc.save(filename);
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
        exportAsJSON(projects, manifest);
        break;

      case 'markdown':
        // Use ZIP for multiple files, single file for 1-3 items
        if (counts.total <= 3) {
          exportAsSingleFile(projects, manifest, 'markdown');
        } else {
          await exportAsZip(projects, manifest, 'markdown');
        }
        break;

      case 'plaintext':
        // Use ZIP for multiple files, single file for 1-3 items
        if (counts.total <= 3) {
          exportAsSingleFile(projects, manifest, 'plaintext');
        } else {
          await exportAsZip(projects, manifest, 'plaintext');
        }
        break;

      case 'pdf':
        exportAsPDF(projects, manifest);
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
