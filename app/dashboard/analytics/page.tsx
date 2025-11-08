'use client';

import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  FileText, 
  Clock, 
  DollarSign, 
  Zap,
  Calendar,
  Download,
  Eye,
  Users
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';

interface AnalyticsData {
  totalProjects: number;
  totalOutputs: number;
  totalProcessingTime: number;
  estimatedCosts: number;
  recentActivity: Array<{
    id: string;
    title: string;
    action: string;
    timestamp: string;
    status: string;
  }>;
  contentBreakdown: Record<string, number>;
  monthlyStats: Array<{
    month: string;
    projects: number;
    outputs: number;
  }>;
  platformStats: Record<string, number>;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user, timeRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Calculate date range
      const now = new Date();
      let startDate: Date | null = null;
      
      switch (timeRange) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = null;
      }

      // Fetch projects
      let projectsQuery = supabase
        .from('projects')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (startDate) {
        projectsQuery = projectsQuery.gte('created_at', startDate.toISOString());
      }

      const { data: projects, error: projectsError } = await projectsQuery;

      if (projectsError) {
        console.error('Error fetching projects:', projectsError);
        return;
      }

      // Fetch outputs
      let outputsQuery = supabase
        .from('outputs')
        .select('*, projects!inner(user_id)')
        .eq('projects.user_id', user?.id)
        .order('created_at', { ascending: false });

      if (startDate) {
        outputsQuery = outputsQuery.gte('created_at', startDate.toISOString());
      }

      const { data: outputs, error: outputsError } = await outputsQuery;

      if (outputsError) {
        console.error('Error fetching outputs:', outputsError);
        return;
      }

      // Process analytics data
      const totalProjects = projects?.length || 0;
      const totalOutputs = outputs?.length || 0;
      const totalProcessingTime = projects?.reduce((sum, p) => sum + (p.processing_time_seconds || 0), 0) || 0;
      const estimatedCosts = outputs?.length * 0.05 || 0; // Rough estimate

      // Content breakdown
      const contentBreakdown: Record<string, number> = {};
      outputs?.forEach(output => {
        const type = output.type || 'unknown';
        contentBreakdown[type] = (contentBreakdown[type] || 0) + 1;
      });

      // Platform stats
      const platformStats: Record<string, number> = {};
      outputs?.forEach(output => {
        const platform = output.platform || 'general';
        platformStats[platform] = (platformStats[platform] || 0) + 1;
      });

      // Recent activity
      const recentActivity = projects?.slice(0, 10).map(project => ({
        id: project.id,
        title: project.title,
        action: project.status === 'completed' ? 'Completed transcription' : 
                project.status === 'processing' ? 'Processing audio' : 'Uploaded',
        timestamp: project.created_at,
        status: project.status
      })) || [];

      // Monthly stats (simplified for demo)
      const monthlyStats = [
        { month: 'Jan', projects: Math.floor(totalProjects * 0.1), outputs: Math.floor(totalOutputs * 0.1) },
        { month: 'Feb', projects: Math.floor(totalProjects * 0.15), outputs: Math.floor(totalOutputs * 0.15) },
        { month: 'Mar', projects: Math.floor(totalProjects * 0.2), outputs: Math.floor(totalOutputs * 0.2) },
        { month: 'Apr', projects: Math.floor(totalProjects * 0.25), outputs: Math.floor(totalOutputs * 0.25) },
        { month: 'May', projects: Math.floor(totalProjects * 0.3), outputs: Math.floor(totalOutputs * 0.3) },
        { month: 'Jun', projects: totalProjects, outputs: totalOutputs },
      ];

      setAnalytics({
        totalProjects,
        totalOutputs,
        totalProcessingTime,
        estimatedCosts,
        recentActivity,
        contentBreakdown,
        monthlyStats,
        platformStats
      });

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64 bg-gray-200 rounded-lg"></div>
              <div className="h-64 bg-gray-200 rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">
                Analytics
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Track your podcast processing and content generation metrics
              </p>
            </div>
            
            {/* Time Range Selector */}
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              {(['7d', '30d', '90d', 'all'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    timeRange === range
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {range === 'all' ? 'All Time' : range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <FileText className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Projects
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {analytics?.totalProjects || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Zap className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Content Pieces
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {analytics?.totalOutputs || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Processing Time
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {formatDuration(analytics?.totalProcessingTime || 0)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-6 w-6 text-yellow-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Estimated Costs
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {formatCurrency(analytics?.estimatedCosts || 0)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Content Breakdown */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Content Type Breakdown
              </h3>
              <div className="space-y-3">
                {Object.entries(analytics?.contentBreakdown || {}).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 capitalize">
                      {type.replace('_', ' ')}
                    </span>
                    <div className="flex items-center space-x-2">
                      <div className="bg-blue-200 rounded-full h-2 w-20">
                        <div 
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ 
                            width: `${Math.min(100, (count / (analytics?.totalOutputs || 1)) * 100)}%` 
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Platform Distribution */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Platform Distribution
              </h3>
              <div className="space-y-3">
                {Object.entries(analytics?.platformStats || {}).map(([platform, count]) => (
                  <div key={platform} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 capitalize">
                      {platform}
                    </span>
                    <div className="flex items-center space-x-2">
                      <div className="bg-green-200 rounded-full h-2 w-20">
                        <div 
                          className="bg-green-600 h-2 rounded-full"
                          style={{ 
                            width: `${Math.min(100, (count / (analytics?.totalOutputs || 1)) * 100)}%` 
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Recent Activity
            </h3>
            <div className="flow-root">
              <ul className="-mb-8">
                {analytics?.recentActivity.map((activity, activityIdx) => (
                  <li key={activity.id}>
                    <div className="relative pb-8">
                      {activityIdx !== analytics.recentActivity.length - 1 ? (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                            activity.status === 'completed' ? 'bg-green-500' :
                            activity.status === 'processing' ? 'bg-yellow-500' :
                            'bg-gray-500'
                          }`}>
                            <FileText className="h-4 w-4 text-white" />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-gray-500">
                              {activity.action}{' '}
                              <span className="font-medium text-gray-900">
                                {activity.title}
                              </span>
                            </p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500">
                            {new Date(activity.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}