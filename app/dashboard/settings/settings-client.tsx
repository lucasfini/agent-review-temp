'use client';

/**
 * Settings Client Component
 * Clean, professional tab-based navigation with utility focus
 */

import { useState } from 'react';
import { CreditCard, BarChart3, User } from 'lucide-react';
import BillingSection from '@/components/settings/billing-section';
import UsageSummarySection from '@/components/settings/usage-summary-section';
import AccountSection from '@/components/settings/account-section';

type TabType = 'billing' | 'usage' | 'account';

interface SettingsClientProps {
  userId: string;
  userEmail: string;
}

export default function SettingsClient({ userId, userEmail }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>('billing');

  const tabs = [
    {
      id: 'billing' as TabType,
      label: 'Billing & Credits',
      icon: CreditCard,
    },
    {
      id: 'usage' as TabType,
      label: 'Usage',
      icon: BarChart3,
    },
    {
      id: 'account' as TabType,
      label: 'Account',
      icon: User,
    },
  ];

  return (
    <div>
      {/* Horizontal Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <nav className="flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon
                  className={`
                    -ml-0.5 mr-2 h-5 w-5
                    ${isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}
                  `}
                />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="mt-6">
        {activeTab === 'billing' && <BillingSection userId={userId} />}
        {activeTab === 'usage' && <UsageSummarySection userId={userId} />}
        {activeTab === 'account' && <AccountSection userId={userId} userEmail={userEmail} />}
      </div>
    </div>
  );
}
