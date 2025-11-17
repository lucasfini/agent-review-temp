'use client';

/**
 * Account Section Component
 * Profile and account settings
 */

import { useState, useEffect } from 'react';
import { Mail, User, Calendar, Activity, DollarSign, FileAudio } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';

interface AccountSectionProps {
  userId: string;
  userEmail: string;
}

interface AccountStats {
  totalProjects: number;
  totalSpent: number;
  accountCreated: string;
  lastLogin: string;
}

export default function AccountSection({ userId, userEmail }: AccountSectionProps) {
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { session, user } = useAuth();

  useEffect(() => {
    const fetchAccountStats = async () => {
      if (!session?.access_token) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Fetch usage data to calculate total spent
        const usageResponse = await fetch('/api/billing/usage?limit=1000', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        const usageData = await usageResponse.json();

        const totalSpent = usageData.events?.reduce(
          (sum: number, e: any) => sum + Number(e.billed_cost),
          0
        ) || 0;

        // Calculate account age
        const accountCreated = user?.created_at || new Date().toISOString();
        const lastLogin = new Date().toISOString(); // Current session

        setStats({
          totalProjects: 0, // Would need to query projects table
          totalSpent,
          accountCreated,
          lastLogin,
        });
      } catch (error) {
        console.error('Error fetching account stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccountStats();
  }, [userId, session, user]);

  const getAccountAge = () => {
    if (!stats?.accountCreated) return 'N/A';
    const created = new Date(stats.accountCreated);
    const now = new Date();
    const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 30) return `${days} days`;
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''}`;
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-64 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile & Account Stats - Merged Two-Column Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Profile & Account</h2>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Column - Profile Info */}
          <div>
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 text-xl font-semibold">
                  {userEmail.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Email Address</div>
                <div className="font-medium text-gray-900">{userEmail}</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500">User ID</div>
                  <div className="font-mono text-xs text-gray-700">{userId.substring(0, 24)}...</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500">Account Created</div>
                  <div className="text-sm text-gray-700">
                    {stats?.accountCreated
                      ? new Date(stats.accountCreated).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'N/A'
                    }
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Activity className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500">Last Login</div>
                  <div className="text-sm text-gray-700">
                    {stats?.lastLogin
                      ? new Date(stats.lastLogin).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'N/A'
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Account Stats */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-4">Account Statistics</h3>

            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <Calendar className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-xs text-blue-600 font-medium">Account Age</div>
                    <div className="text-lg font-semibold text-blue-900">{getAccountAge()}</div>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <DollarSign className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <div className="text-xs text-green-600 font-medium">Total Spent</div>
                    <div className="text-lg font-semibold text-green-900">
                      ${(stats?.totalSpent || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-100 p-2 rounded-lg">
                    <FileAudio className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-xs text-purple-600 font-medium">Total Projects</div>
                    <div className="text-lg font-semibold text-purple-900">
                      {stats?.totalProjects || 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications Settings - Simplified */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h2>

        <div className="space-y-2">
          <label className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-not-allowed">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-700">Email notifications</span>
            </div>
            <input type="checkbox" disabled className="h-4 w-4 text-blue-600 rounded opacity-40" />
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-not-allowed">
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-700">Low balance alerts</span>
            </div>
            <input type="checkbox" disabled className="h-4 w-4 text-blue-600 rounded opacity-40" />
          </label>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">Notification settings will be available soon</p>
        </div>
      </div>
    </div>
  );
}
