/**
 * Usage Data Helper
 * Provides mock usage metrics with simulated API latency
 */

export interface UsageMetrics {
  minutesProcessed: number;
  filesUploaded: number;
  avgProcessingTime: number;
  totalStorage: number;
  activeProjects: number;
}

export interface UsageTrend {
  date: string;
  minutesProcessed: number;
  filesUploaded: number;
  avgProcessingTime: number;
}

export interface ProjectFilter {
  id: string;
  name: string;
}

export type UsageTimeframe = '7d' | '30d' | '90d';

const mockProjects: ProjectFilter[] = [
  { id: 'all', name: 'All Projects' },
  { id: 'proj-1', name: 'Tech Podcast Series' },
  { id: 'proj-2', name: 'Marketing Webinars' },
  { id: 'proj-3', name: 'Interview Archives' },
  { id: 'proj-4', name: 'Educational Content' }
];

const mockTrendData: Record<UsageTimeframe, UsageTrend[]> = {
  '7d': [
    { date: '2024-12-09', minutesProcessed: 145, filesUploaded: 8, avgProcessingTime: 18.1 },
    { date: '2024-12-10', minutesProcessed: 203, filesUploaded: 12, avgProcessingTime: 16.9 },
    { date: '2024-12-11', minutesProcessed: 178, filesUploaded: 10, avgProcessingTime: 17.8 },
    { date: '2024-12-12', minutesProcessed: 192, filesUploaded: 11, avgProcessingTime: 17.5 },
    { date: '2024-12-13', minutesProcessed: 234, filesUploaded: 15, avgProcessingTime: 15.6 },
    { date: '2024-12-14', minutesProcessed: 210, filesUploaded: 13, avgProcessingTime: 16.2 },
    { date: '2024-12-15', minutesProcessed: 267, filesUploaded: 16, avgProcessingTime: 16.7 }
  ],
  '30d': [
    { date: '2024-11-16', minutesProcessed: 189, filesUploaded: 11, avgProcessingTime: 17.2 },
    { date: '2024-11-18', minutesProcessed: 215, filesUploaded: 13, avgProcessingTime: 16.5 },
    { date: '2024-11-20', minutesProcessed: 198, filesUploaded: 12, avgProcessingTime: 16.5 },
    { date: '2024-11-22', minutesProcessed: 234, filesUploaded: 14, avgProcessingTime: 16.7 },
    { date: '2024-11-24', minutesProcessed: 176, filesUploaded: 9, avgProcessingTime: 19.6 },
    { date: '2024-11-26', minutesProcessed: 203, filesUploaded: 12, avgProcessingTime: 16.9 },
    { date: '2024-11-28', minutesProcessed: 245, filesUploaded: 15, avgProcessingTime: 16.3 },
    { date: '2024-11-30', minutesProcessed: 221, filesUploaded: 13, avgProcessingTime: 17.0 },
    { date: '2024-12-02', minutesProcessed: 267, filesUploaded: 16, avgProcessingTime: 16.7 },
    { date: '2024-12-04', minutesProcessed: 198, filesUploaded: 11, avgProcessingTime: 18.0 },
    { date: '2024-12-06', minutesProcessed: 189, filesUploaded: 10, avgProcessingTime: 18.9 },
    { date: '2024-12-08', minutesProcessed: 256, filesUploaded: 15, avgProcessingTime: 17.1 },
    { date: '2024-12-10', minutesProcessed: 203, filesUploaded: 12, avgProcessingTime: 16.9 },
    { date: '2024-12-12', minutesProcessed: 192, filesUploaded: 11, avgProcessingTime: 17.5 },
    { date: '2024-12-14', minutesProcessed: 210, filesUploaded: 13, avgProcessingTime: 16.2 }
  ],
  '90d': [
    { date: '2024-09-20', minutesProcessed: 156, filesUploaded: 8, avgProcessingTime: 19.5 },
    { date: '2024-09-27', minutesProcessed: 178, filesUploaded: 10, avgProcessingTime: 17.8 },
    { date: '2024-10-04', minutesProcessed: 192, filesUploaded: 11, avgProcessingTime: 17.5 },
    { date: '2024-10-11', minutesProcessed: 215, filesUploaded: 13, avgProcessingTime: 16.5 },
    { date: '2024-10-18', minutesProcessed: 203, filesUploaded: 12, avgProcessingTime: 16.9 },
    { date: '2024-10-25', minutesProcessed: 234, filesUploaded: 14, avgProcessingTime: 16.7 },
    { date: '2024-11-01', minutesProcessed: 198, filesUploaded: 11, avgProcessingTime: 18.0 },
    { date: '2024-11-08', minutesProcessed: 221, filesUploaded: 13, avgProcessingTime: 17.0 },
    { date: '2024-11-15', minutesProcessed: 245, filesUploaded: 15, avgProcessingTime: 16.3 },
    { date: '2024-11-22', minutesProcessed: 234, filesUploaded: 14, avgProcessingTime: 16.7 },
    { date: '2024-11-29', minutesProcessed: 267, filesUploaded: 16, avgProcessingTime: 16.7 },
    { date: '2024-12-06', minutesProcessed: 189, filesUploaded: 10, avgProcessingTime: 18.9 },
    { date: '2024-12-13', minutesProcessed: 234, filesUploaded: 15, avgProcessingTime: 15.6 }
  ]
};

/**
 * Simulates API latency (100-300ms)
 */
function simulateLatency(): Promise<void> {
  const delay = Math.random() * 200 + 100;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Fetches usage metrics for a given timeframe and project filter
 */
export async function getUsageMetrics(
  timeframe: UsageTimeframe = '30d',
  projectId: string = 'all'
): Promise<UsageMetrics> {
  await simulateLatency();

  const trendData = mockTrendData[timeframe];

  // Apply project filter (simple mock: reduce by 40% if specific project)
  const filterMultiplier = projectId === 'all' ? 1 : 0.4;

  const totalMinutes = trendData.reduce((sum, day) => sum + day.minutesProcessed, 0) * filterMultiplier;
  const totalFiles = trendData.reduce((sum, day) => sum + day.filesUploaded, 0) * filterMultiplier;
  const avgProcessingTime = trendData.reduce((sum, day) => sum + day.avgProcessingTime, 0) / trendData.length;

  return {
    minutesProcessed: Math.round(totalMinutes),
    filesUploaded: Math.round(totalFiles),
    avgProcessingTime: Math.round(avgProcessingTime * 10) / 10,
    totalStorage: Math.round(totalMinutes * 0.25 * filterMultiplier), // Approx MB
    activeProjects: projectId === 'all' ? 4 : 1
  };
}

/**
 * Fetches usage trend data for charting
 */
export async function getUsageTrend(
  timeframe: UsageTimeframe = '30d',
  projectId: string = 'all'
): Promise<UsageTrend[]> {
  await simulateLatency();

  const trendData = mockTrendData[timeframe];

  // Apply project filter
  if (projectId === 'all') {
    return trendData;
  }

  // Filter multiplier for specific projects
  return trendData.map(day => ({
    ...day,
    minutesProcessed: Math.round(day.minutesProcessed * 0.4),
    filesUploaded: Math.round(day.filesUploaded * 0.4)
  }));
}

/**
 * Gets list of available projects for filtering
 */
export async function getProjectFilters(): Promise<ProjectFilter[]> {
  await simulateLatency();
  return mockProjects;
}
