"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';
import {
  LayoutGrid,
  Upload,
  FileText,
  BarChart3,
  Settings,
  CreditCard,
  User,
  LogOut,
  Menu,
  X,
  Mic,
  Clock,
} from 'lucide-react';

type NavItemDef = {
  name: string;
  href: string;
  icon: React.ElementType;
  settingsSection?: string;
};

type RecentProject = { id: string; title: string };

const PREMIUM_RATE_PER_HOUR = 0.52;

function calculatePowerTime(balance: number): string {
  const totalMinutes = Math.floor((balance / PREMIUM_RATE_PER_HOUR) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

const sections: Array<{ label: string; items: NavItemDef[] }> = [
  {
    label: 'WORKSPACE',
    items: [
      { name: 'Project Hub', href: '/dashboard/hub', icon: LayoutGrid },
      { name: 'Content Library', href: '/dashboard/projects', icon: FileText },
      { name: 'Upload', href: '/dashboard/upload', icon: Upload },
    ],
  },
  {
    label: 'ANALYTICS',
    items: [
      { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { name: 'General', href: '/dashboard/settings', icon: User, settingsSection: 'general' },
      { name: 'Billing', href: '/dashboard/settings?section=billing', icon: CreditCard, settingsSection: 'billing' },
      { name: 'Usage', href: '/dashboard/settings?section=usage', icon: BarChart3, settingsSection: 'usage' },
    ],
  },
];

function NavItem({
  item,
  isActive,
  onClick,
  mobile = false,
}: {
  item: NavItemDef;
  isActive: boolean;
  onClick?: () => void;
  mobile?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`group flex items-center gap-3 px-3 ${mobile ? 'py-3 text-base' : 'py-2.5 text-sm'} font-medium rounded-xl transition-colors ${
        isActive
          ? 'bg-blue-600/10 text-blue-400'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      <Icon
        className={`flex-shrink-0 ${mobile ? 'h-5 w-5' : 'h-4 w-4'} ${
          isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'
        }`}
      />
      {item.name}
    </Link>
  );
}

function SidebarContent({
  pathname,
  activeSettingsSection,
  activeProjectId,
  user,
  balance,
  isLoadingBalance,
  isLowBalance,
  balanceDisplay,
  recentProjects,
  onSignOut,
  onNavClick,
}: {
  pathname: string;
  activeSettingsSection: string | null;
  activeProjectId: string | null;
  user: { email?: string } | null;
  balance: number | null;
  isLoadingBalance: boolean;
  isLowBalance: boolean;
  balanceDisplay: string;
  recentProjects: RecentProject[];
  onSignOut: () => void;
  onNavClick?: () => void;
}) {
  const isFreePlan = balance === null && !isLoadingBalance;

  const isActive = (item: NavItemDef): boolean => {
    if (item.settingsSection) {
      return pathname === '/dashboard/settings' && activeSettingsSection === item.settingsSection;
    }
    if (item.href === '/dashboard/hub') {
      return pathname === '/dashboard/hub' || pathname === '/dashboard';
    }
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex-shrink-0 px-4 pt-6 pb-4">
        <Link href={user ? '/dashboard/hub' : '/'} className="flex items-center gap-2">
          <Mic className="h-7 w-7 text-blue-600" />
          <span className="text-lg font-bold text-slate-50">AudioRepurpose</span>
        </Link>
      </div>

      {/* Grouped Navigation */}
      <nav className="flex-1 px-3 overflow-y-auto space-y-5">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItem
                  key={item.name}
                  item={item}
                  isActive={isActive(item)}
                  onClick={onNavClick}
                />
              ))}
            </div>
            {/* Recent Projects — injected below the WORKSPACE section */}
            {section.label === 'WORKSPACE' && recentProjects.length > 0 && (
              <div className="mt-5">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2 px-2">
                  Recent Projects
                </p>
                <div className="space-y-0.5">
                  {recentProjects.map((project) => {
                    const isActiveProject =
                      pathname === '/dashboard/projects' && activeProjectId === project.id;
                    return (
                      <Link
                        key={project.id}
                        href={`/dashboard/projects?id=${project.id}`}
                        onClick={onNavClick}
                        className={`group flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-all ${
                          isActiveProject
                            ? 'bg-slate-800 text-slate-100'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                        }`}
                      >
                        <Clock
                          className={`flex-shrink-0 w-3.5 h-3.5 ${
                            isActiveProject
                              ? 'text-slate-400'
                              : 'text-slate-500 group-hover:text-slate-400'
                          }`}
                        />
                        <span className="truncate">{project.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom Area */}
      <div className="flex-shrink-0 px-3 pb-4 pt-4">
        {/* Production Power Wallet Card */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 mb-3">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
            Production Power
          </p>
          <p className="text-slate-50 font-bold text-xl mt-1">
            {isLoadingBalance
              ? <span className="text-slate-600">—</span>
              : balance !== null
              ? `$${balance.toFixed(2)}`
              : 'Free Plan'}
          </p>
          {balance !== null && !isLoadingBalance && (
            <div className="flex items-center gap-1.5 text-blue-400 text-xs font-medium mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              ≈ {calculatePowerTime(balance)} power
            </div>
          )}
          <Link
            href="/dashboard/settings?section=billing"
            onClick={onNavClick}
            className={`flex items-center justify-center w-full py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm mt-3 ${
              isLowBalance
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLowBalance ? '+ Top Up' : '+ Add Credits'}
          </Link>
        </div>

        {/* Profile with Sign Out */}
        <div className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-700 rounded-xl hover:border-slate-600 transition-colors">
          <Link
            href="/dashboard/settings"
            onClick={onNavClick}
            className="flex items-center gap-3 flex-1 min-w-0"
          >
            <div className="flex-shrink-0 h-9 w-9 rounded-full bg-violet-500 flex items-center justify-center text-white text-sm font-semibold">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <p className="text-sm font-medium text-slate-200 truncate">{user?.email}</p>
          </Link>
          <button
            onClick={onSignOut}
            className="flex-shrink-0 p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardNav() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, session, signOut } = useAuth();

  const activeSettingsSection = pathname.startsWith('/dashboard/settings')
    ? (searchParams.get('section') || 'general')
    : null;

  const activeProjectId = searchParams.get('id');

  useEffect(() => {
    const fetchBalance = async () => {
      if (!user || !session?.access_token) return;
      try {
        const response = await fetch('/api/billing/balance', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setBalance(data.balance);
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
      } finally {
        setIsLoadingBalance(false);
      }
    };
    fetchBalance();
  }, [user, session]);

  useEffect(() => {
    const fetchRecentProjects = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('projects')
        .select('id, title')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8);
      if (data) setRecentProjects(data as RecentProject[]);
    };
    fetchRecentProjects();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const isLowBalance = balance !== null && balance < 5;
  const balanceDisplay = isLoadingBalance
    ? 'Loading...'
    : balance !== null
    ? `$${balance.toFixed(2)} credits`
    : 'Free Plan';

  const sharedProps = {
    pathname,
    activeSettingsSection,
    activeProjectId,
    user: user as { email?: string } | null,
    balance,
    isLoadingBalance,
    isLowBalance,
    balanceDisplay,
    recentProjects,
    onSignOut: handleSignOut,
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex flex-col flex-grow bg-slate-950 border-r border-slate-800 overflow-hidden">
          <SidebarContent {...sharedProps} />
        </div>
      </div>

      {/* Mobile top bar */}
      <div className="md:hidden">
        <div className="flex items-center justify-between bg-slate-950 border-b border-slate-800 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Mic className="h-6 w-6 text-blue-500" />
            <span className="text-base font-bold text-slate-50">AudioRepurpose</span>
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 flex z-40 md:hidden">
          <div
            className="fixed inset-0 bg-black/75"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-slate-950 overflow-y-auto">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              >
                <X className="h-6 w-6 text-white" />
              </button>
            </div>
            <SidebarContent
              {...sharedProps}
              onNavClick={() => setIsMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
