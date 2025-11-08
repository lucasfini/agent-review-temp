// Conversation Format Logger
// Logs generated conversation content for analysis and adjustment

import { promises as fs } from 'fs';
import * as path from 'path';

export interface ConversationLogEntry {
  projectId: string;
  timestamp: string;
  transcriptionInfo: {
    originalLength: number;
    segmentCount: number;
    speakerCount: number;
    duration: number;
  };
  speakerData: {
    speakers: Record<string, any>;
    segments: any[];
  };
  analysis: {
    keyTopics: string[];
    quotes: any[];
    facts: any[];
    opinions: any[];
    humor: any[];
    hooks: any[];
    actionable_insights: any[];
  };
  generatedContent: {
    type: string;
    platform: string;
    title: string;
    content: string;
    metadata: any;
    generationTime: number;
  }[];
  processingMetadata: {
    totalProcessingTime: number;
    analysisTime: number;
    contentGenerationTime: number;
    errors: string[];
    warnings: string[];
  };
}

/**
 * Log the complete conversation generation process
 */
export async function logConversationGeneration(entry: ConversationLogEntry): Promise<void> {
  try {
    const logDir = path.join(process.cwd(), 'logs', 'conversations');
    
    // Ensure directory exists
    await fs.mkdir(logDir, { recursive: true });
    
    // Create filename with timestamp and project ID
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `conversation-${entry.projectId}-${timestamp}.json`;
    const filepath = path.join(logDir, filename);
    
    // Add generation metadata
    const logData = {
      ...entry,
      loggedAt: new Date().toISOString(),
      version: '1.0',
      summary: generateLogSummary(entry)
    };
    
    // Write to file
    await fs.writeFile(filepath, JSON.stringify(logData, null, 2));
    
    console.log(`[CONVERSATION LOG] Saved conversation generation log: ${filename}`);
    console.log(`[CONVERSATION LOG] Summary: ${logData.summary.totalContentPieces} pieces, ${logData.summary.totalWords} words, ${logData.summary.platforms.join(', ')}`);
    
    // Also create a simplified summary log for quick review
    await createSummaryLog(entry, logDir);
    
  } catch (error) {
    console.error('[CONVERSATION LOG] Failed to save conversation log:', error);
    // Don't throw - logging should not break the main process
  }
}

/**
 * Create a simplified summary log for quick scanning
 */
async function createSummaryLog(entry: ConversationLogEntry, logDir: string): Promise<void> {
  try {
    const summaryFile = path.join(logDir, 'conversation-summary.csv');
    
    // Check if file exists to determine if we need headers
    const fileExists = await fs.access(summaryFile).then(() => true).catch(() => false);
    
    const summary = generateLogSummary(entry);
    const csvRow = [
      entry.timestamp,
      entry.projectId,
      summary.totalContentPieces,
      summary.totalWords,
      summary.platforms.join('|'),
      summary.topTopics.join('|'),
      entry.processingMetadata.totalProcessingTime,
      entry.processingMetadata.errors.length,
      entry.processingMetadata.warnings.length
    ].join(',');
    
    let content = csvRow + '\n';
    
    if (!fileExists) {
      const headers = [
        'Timestamp',
        'ProjectID', 
        'ContentPieces',
        'TotalWords',
        'Platforms',
        'TopTopics',
        'ProcessingTime(ms)',
        'ErrorCount',
        'WarningCount'
      ].join(',');
      content = headers + '\n' + content;
    }
    
    await fs.appendFile(summaryFile, content);
    
  } catch (error) {
    console.error('[CONVERSATION LOG] Failed to create summary log:', error);
  }
}

/**
 * Generate a quick summary of the log entry
 */
function generateLogSummary(entry: ConversationLogEntry) {
  const platforms = [...new Set(entry.generatedContent.map(c => c.platform))];
  const totalWords = entry.generatedContent.reduce((sum, content) => {
    return sum + (content.content ? content.content.split(' ').length : 0);
  }, 0);
  
  const topTopics = entry.analysis.keyTopics.slice(0, 3);
  
  return {
    totalContentPieces: entry.generatedContent.length,
    totalWords,
    platforms,
    topTopics,
    avgWordsPerPiece: Math.round(totalWords / entry.generatedContent.length || 0),
    speakerCount: entry.transcriptionInfo.speakerCount,
    originalDuration: entry.transcriptionInfo.duration
  };
}

/**
 * Log analysis results for review
 */
export async function logAnalysisResults(
  projectId: string,
  transcription: string,
  analysis: any,
  processingTime: number
): Promise<void> {
  try {
    const logDir = path.join(process.cwd(), 'logs', 'conversations');
    await fs.mkdir(logDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `analysis-${projectId}-${timestamp}.json`;
    const filepath = path.join(logDir, filename);
    
    const logData = {
      projectId,
      timestamp: new Date().toISOString(),
      transcriptionLength: transcription.length,
      analysis,
      processingTime,
      quality: {
        topicsCount: analysis.keyTopics?.length || 0,
        quotesCount: analysis.quotes?.length || 0,
        factsCount: analysis.facts?.length || 0,
        hooksCount: analysis.hooks?.length || 0,
        insightsCount: analysis.actionable_insights?.length || 0
      }
    };
    
    await fs.writeFile(filepath, JSON.stringify(logData, null, 2));
    console.log(`[ANALYSIS LOG] Saved analysis results: ${filename}`);
    
  } catch (error) {
    console.error('[ANALYSIS LOG] Failed to save analysis log:', error);
  }
}

/**
 * Log content generation details for each platform
 */
export async function logContentGeneration(
  projectId: string,
  platform: string,
  contentType: string,
  prompt: string,
  response: string,
  metadata: any,
  processingTime: number
): Promise<void> {
  try {
    const logDir = path.join(process.cwd(), 'logs', 'conversations', 'content-generation');
    await fs.mkdir(logDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${platform}-${contentType}-${projectId}-${timestamp}.json`;
    const filepath = path.join(logDir, filename);
    
    const logData = {
      projectId,
      platform,
      contentType,
      timestamp: new Date().toISOString(),
      prompt: {
        text: prompt,
        length: prompt.length
      },
      response: {
        text: response,
        length: response.length,
        wordCount: response.split(' ').length
      },
      metadata,
      processingTime,
      quality: {
        responseCompleteness: response.length > 100 ? 'complete' : 'incomplete',
        estimatedReadability: calculateReadabilityScore(response),
        hashtagCount: (response.match(/#\w+/g) || []).length,
        mentionCount: (response.match(/@\w+/g) || []).length
      }
    };
    
    await fs.writeFile(filepath, JSON.stringify(logData, null, 2));
    
  } catch (error) {
    console.error(`[CONTENT LOG] Failed to log ${platform} content generation:`, error);
  }
}

/**
 * Simple readability score calculation
 */
function calculateReadabilityScore(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const avgWordsPerSentence = words.length / sentences.length || 0;
  
  // Simple score: prefer 10-20 words per sentence
  if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 20) {
    return 0.9;
  } else if (avgWordsPerSentence >= 5 && avgWordsPerSentence <= 30) {
    return 0.7;
  } else {
    return 0.5;
  }
}

/**
 * Get recent conversation logs for review
 */
export async function getRecentConversationLogs(limit: number = 10): Promise<any[]> {
  try {
    const logDir = path.join(process.cwd(), 'logs', 'conversations');
    const files = await fs.readdir(logDir);
    
    const conversationLogs = files
      .filter(f => f.startsWith('conversation-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);
    
    const logs = [];
    for (const file of conversationLogs) {
      try {
        const content = await fs.readFile(path.join(logDir, file), 'utf-8');
        const logData = JSON.parse(content);
        logs.push({
          filename: file,
          ...logData.summary,
          timestamp: logData.timestamp,
          projectId: logData.projectId
        });
      } catch (error) {
        console.error(`Failed to read log file ${file}:`, error);
      }
    }
    
    return logs;
  } catch (error) {
    console.error('Failed to get recent conversation logs:', error);
    return [];
  }
}

/**
 * Generate a quality report for recent conversations
 */
export async function generateQualityReport(): Promise<any> {
  try {
    const logs = await getRecentConversationLogs(20);
    
    const totalConversations = logs.length;
    const avgContentPieces = logs.reduce((sum, log) => sum + log.totalContentPieces, 0) / totalConversations || 0;
    const avgWords = logs.reduce((sum, log) => sum + log.totalWords, 0) / totalConversations || 0;
    
    const platformUsage = logs.reduce((acc, log) => {
      log.platforms.forEach((platform: string) => {
        acc[platform] = (acc[platform] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);
    
    const topTopics = logs.reduce((acc, log) => {
      log.topTopics.forEach((topic: string) => {
        acc[topic] = (acc[topic] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);
    
    return {
      period: {
        totalConversations,
        dateRange: logs.length > 0 ? {
          from: logs[logs.length - 1].timestamp,
          to: logs[0].timestamp
        } : null
      },
      averages: {
        contentPieces: Math.round(avgContentPieces),
        words: Math.round(avgWords),
        wordsPerPiece: Math.round(avgWords / avgContentPieces) || 0
      },
      platformUsage: Object.entries(platformUsage)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 5),
      topTopics: Object.entries(topTopics)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 10),
      trends: {
        increasingQuality: logs.slice(0, 5).every(log => log.totalWords > 500),
        platformDiversity: Object.keys(platformUsage).length,
        avgProcessingTime: logs.reduce((sum, log) => sum + (log.processingTime || 0), 0) / totalConversations || 0
      }
    };
  } catch (error) {
    console.error('Failed to generate quality report:', error);
    return null;
  }
}