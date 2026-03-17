"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth/context';
import { isAdminEmail } from '@/lib/admin-access';
import { usdToSiteCredits } from '@/lib/billing/display';
import { isDemoUser } from '@/lib/demo-mode';
import { PROJECT_MUTATION_EVENT, type ProjectMutationDetail } from '@/lib/project-events';
import { supabase } from '@/lib/supabase/client';
import BrandLogo from '@/components/site/BrandLogo';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import {
  LayoutGrid,
  Upload,
  FileText,
  BarChart3,
  Settings,
  CreditCard,
  Mail,
  Menu,
  X,
  Plus,
  Sun,
  Moon,
} from 'lucide-react';

type NavItemDef = {
  name: string;
  href: string;
  icon: React.ElementType;
  settingsSection?: string;
  tourAttr?: string;
};

type RecentProject = { id: string; title: string; status?: string | null };

const TOOLTIP_OFFSET_PX = 8;
function getDisplayName(user: SupabaseUser | null): string {
  if (!user) return 'User';
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const username = typeof meta?.username === 'string' ? meta.username.trim() : '';
  const fullName = typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
  const name = typeof meta?.name === 'string' ? meta.name.trim() : '';
  return username || fullName || name || user.email || 'User';
}

function getUserAvatarUrl(user: SupabaseUser | null): string | null {
  if (!user) return null;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const profile = user.identities?.find((identity) => identity.provider === 'google');
  const identityData = (profile?.identity_data ?? {}) as Record<string, unknown>;

  const candidates = [
    meta?.avatar_url,
    meta?.picture,
    identityData?.avatar_url,
    identityData?.picture,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

function ThemeToggle({ isCollapsed }: { isCollapsed?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className={isCollapsed ? 'h-9 w-9' : 'h-10 w-10'} />;

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
        isCollapsed ? 'h-9 w-9 rounded-xl' : 'h-10 w-10 rounded-xl'
      }`}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function TooltipOverlay({
  label,
  anchorRect,
  visible,
}: {
  label: string;
  anchorRect: DOMRect | null;
  visible: boolean;
}) {
  if (!visible || !anchorRect) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.top - TOOLTIP_OFFSET_PX,
    left: anchorRect.left + anchorRect.width / 2,
    transform: 'translate(-50%, -100%)',
    zIndex: 1000,
    pointerEvents: 'none',
  };

  return createPortal(
    <div
      style={style}
      className="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 shadow-lg whitespace-nowrap"
    >
      {label}
    </div>,
    document.body
  );
}

const sections: Array<{ label: string; items: NavItemDef[] }> = [
  {
    label: 'WORKSPACE',
    items: [
      { name: 'Upload', href: '/dashboard/upload', icon: Upload },
      { name: 'Studio', href: '/dashboard/projects', icon: FileText },
      { name: 'All Projects', href: '/dashboard/hub', icon: LayoutGrid },
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
      { name: 'Billing', href: '/dashboard/billing', icon: CreditCard },
      { name: 'Usage', href: '/dashboard/usage', icon: BarChart3, tourAttr: 'usage-tab' },
      { name: 'Contact Us', href: '/dashboard/contact', icon: Mail },
    ],
  },
];

function NavItem({
  item,
  isActive,
  onClick,
  mobile = false,
  isCollapsed = false,
}: {
  item: NavItemDef;
  isActive: boolean;
  onClick?: () => void;
  mobile?: boolean;
  isCollapsed?: boolean;
}) {
  const Icon = item.icon;
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const updateRect = () => {
    if (!anchorRef.current) return;
    setAnchorRect(anchorRef.current.getBoundingClientRect());
  };

  useEffect(() => {
    if (!showTooltip) return;
    updateRect();
    const handleReposition = () => updateRect();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [showTooltip]);
  return (
    <Link
      ref={anchorRef}
      href={item.href}
      onClick={onClick}
      onMouseEnter={() => {
        if (!isCollapsed) return;
        updateRect();
        setShowTooltip(true);
      }}
      onMouseLeave={() => setShowTooltip(false)}
      {...(item.tourAttr ? { 'data-tour': item.tourAttr } : {})}
      aria-label={item.name}
      className={`group flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 ${mobile ? 'py-3 text-base' : 'py-2.5 text-sm'} font-medium rounded-xl transition-colors ${isActive
          ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400'
          : 'text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
        }`}
    >
      <Icon
        className={`flex-shrink-0 ${mobile ? 'h-5 w-5' : isCollapsed ? 'h-5 w-5' : 'h-4 w-4'} ${isActive
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-slate-400 dark:text-slate-300 group-hover:text-slate-700 dark:group-hover:text-slate-100'
          }`}
      />
      {isCollapsed && (
        <TooltipOverlay
          label={item.name}
          anchorRect={anchorRect}
          visible={showTooltip}
        />
      )}
      {!isCollapsed && item.name}
    </Link>
  );
}

function TooltipIconButton({
  href,
  onClick,
  label,
  title,
  icon,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  title?: string;
  icon: React.ReactNode;
}) {
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const updateRect = () => {
    const element = anchorRef.current ?? buttonRef.current;
    if (!element) return;
    setAnchorRect(element.getBoundingClientRect());
  };

  useEffect(() => {
    if (!showTooltip) return;
    updateRect();
    const handleReposition = () => updateRect();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [showTooltip]);

  const content = (
    <>
      {icon}
      <TooltipOverlay
        label={label}
        anchorRect={anchorRect}
        visible={showTooltip}
      />
    </>
  );

  if (href) {
    return (
      <Link
        ref={anchorRef}
        href={href}
        onClick={onClick}
        onMouseEnter={() => {
          updateRect();
          setShowTooltip(true);
        }}
        onMouseLeave={() => setShowTooltip(false)}
        className="p-2 rounded-lg text-slate-500 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
        title={title}
        aria-label={label}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      onMouseEnter={() => {
        updateRect();
        setShowTooltip(true);
      }}
      onMouseLeave={() => setShowTooltip(false)}
      className="p-2 rounded-lg text-slate-500 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
      title={title}
      aria-label={label}
    >
      {content}
    </button>
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
  recentProjects,
  onSignOut,
  onNavClick,
  isCollapsed,
  onToggleCollapse,
  isDemo,
  navSections,
}: {
  pathname: string;
  activeSettingsSection: string | null;
  activeProjectId: string | null;
  user: SupabaseUser | null;
  balance: number | null;
  isLoadingBalance: boolean;
  isLowBalance: boolean;
  recentProjects: RecentProject[];
  onSignOut: () => void;
  onNavClick?: () => void;
  isCollapsed: boolean;
  onToggleCollapse?: () => void;
  isDemo?: boolean;
  navSections: Array<{ label: string; items: NavItemDef[] }>;
}) {
  const displayName = getDisplayName(user);
  const avatarUrl = getUserAvatarUrl(user);
  const { resolvedTheme } = useTheme();
  const logoTheme = resolvedTheme === 'light' ? 'light' : 'dark';
  const emailLabel = user?.email ?? '';

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
      <div className={`flex-shrink-0 px-4 pt-6 pb-4 ${isCollapsed ? 'flex flex-col items-center gap-2' : 'flex items-center justify-between'}`}>
        <Link
          href={user ? '/dashboard/hub' : '/'}
          className={`flex items-center ${isCollapsed ? '' : 'gap-2'}`}
          title={isCollapsed ? 'AudioRepurpose' : undefined}
        >
          <BrandLogo showText={!isCollapsed} theme={logoTheme} />
        </Link>
        {onToggleCollapse && (
          <TooltipIconButton
            onClick={onToggleCollapse}
            label={isCollapsed ? 'Expand menu' : 'Collapse menu'}
            title={isCollapsed ? 'Expand menu' : 'Collapse menu'}
            icon={<Menu className="h-5 w-5" />}
          />
        )}
      </div>

      {/* Grouped Navigation */}
      <nav className="flex-1 px-3 overflow-y-auto overflow-x-visible space-y-5">
        {navSections.map((section) => (
          <div key={section.label}>
            {!isCollapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItem
                  key={item.name}
                  item={item}
                  isActive={isActive(item)}
                  onClick={onNavClick}
                  isCollapsed={isCollapsed}
                />
              ))}
            </div>
            {/* Recent Projects — injected below the WORKSPACE section */}
            {!isCollapsed && section.label === 'WORKSPACE' && recentProjects.length > 0 && (
              <div className="mt-5">
                <p className="text-slate-400 dark:text-slate-300 text-[10px] font-bold uppercase tracking-widest mb-2 px-2">
                  Recent Projects
                </p>
                <div className="space-y-0.5">
                  {recentProjects.map((project) => {
                    const isActiveProject =
                      pathname === '/dashboard/projects' && activeProjectId === project.id;
                    const statusDot =
                      project.status === 'completed'
                        ? 'bg-green-500'
                        : project.status === 'processing' || project.status === 'uploading'
                        ? 'bg-blue-400 animate-pulse'
                        : project.status === 'failed'
                        ? 'bg-red-500'
                        : 'bg-slate-400 dark:bg-slate-600';
                    return (
                      <Link
                        key={project.id}
                        href={`/dashboard/projects?id=${project.id}`}
                        onClick={onNavClick}
                        className={`group flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-all ${isActiveProject
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                            : 'text-slate-500 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                          }`}
                      >
                        <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${statusDot}`} />
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
      <div className="flex-shrink-0 mt-auto px-3 pb-5 flex flex-col gap-3">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200/80 dark:via-slate-800/60 to-transparent w-full" />

        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <Link
              href="/dashboard/settings?section=preferences"
              onClick={onNavClick}
              className="group flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              title={displayName}
              aria-label="Open settings"
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  fill
                  sizes="36px"
                  className="object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </Link>
            <ThemeToggle isCollapsed />
            <button
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-500 dark:text-slate-300 shadow-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-600 dark:hover:text-red-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.45)] backdrop-blur-sm overflow-hidden">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2.5">
                <Link
                  href="/dashboard/settings?section=preferences"
                  onClick={onNavClick}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/80 -m-1 p-1 group"
                >
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt={displayName}
                      width={36}
                      height={36}
                      className="h-9 w-9 flex-shrink-0 rounded-xl border border-slate-300/70 object-cover shadow-sm dark:border-slate-600/60"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-300/70 bg-gradient-to-br from-slate-100 to-slate-200 text-sm font-semibold text-slate-700 shadow-sm select-none dark:border-slate-600/60 dark:from-slate-800 dark:to-slate-700 dark:text-slate-100">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-slate-950 dark:group-hover:text-white">
                      {displayName}
                    </p>
                    {emailLabel && (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {emailLabel}
                      </p>
                    )}
                  </div>
                </Link>

                <div className="flex items-center gap-1">
                  <Link
                    href="/dashboard/settings?section=preferences"
                    onClick={onNavClick}
                    className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    aria-label="Open settings"
                    title="Open settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div
                data-tour="credit-balance"
                className={`rounded-xl border px-3.5 py-2.5 ${
                  isLowBalance
                    ? 'border-amber-300/80 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Credits
                  </p>
                  <p className={`mt-1 text-sm font-semibold tabular-nums ${
                    balance === null && !isLoadingBalance
                      ? 'text-slate-500 dark:text-slate-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}>
                    {isLoadingBalance
                      ? <span className="text-slate-400 dark:text-slate-500">—</span>
                      : balance !== null
                        ? `${usdToSiteCredits(balance).toLocaleString('en-US')}`
                        : 'No credits'}
                  </p>
                </div>

                {!isDemo && (
                  <Link
                    href="/dashboard/billing"
                    onClick={onNavClick}
                    className={`mt-2.5 inline-flex w-full items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      isLowBalance
                        ? 'border-amber-400/70 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/15'
                        : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
                    }`}
                  >
                    <Plus className="h-3 w-3" />
                    Add credits
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5">
                <div className="flex-shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
                  <ThemeToggle />
                </div>
                <button
                  onClick={onSignOut}
                  className="inline-flex min-w-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-red-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-red-400"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardNav({
  isCollapsed,
  onCollapseChange,
}: {
  isCollapsed?: boolean;
  onCollapseChange?: (next: boolean) => void;
} = {}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, session, signOut } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDemo = isDemoUser(user as { email?: string } | null);

  const rawSettingsSection = searchParams.get('section') || 'preferences';
  const activeSettingsSection = pathname.startsWith('/dashboard/settings')
    ? (rawSettingsSection === 'general' ? 'preferences' : rawSettingsSection)
    : null;

  const activeProjectId = searchParams.get('id');
  const collapsed = isCollapsed ?? localCollapsed;
  const setCollapsed = onCollapseChange ?? setLocalCollapsed;

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
    if (!user) return;
    let isActive = true;

    const fetchRecentProjects = async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, title, status')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(8);
      if (isActive && data) setRecentProjects(data as RecentProject[]);
    };

    fetchRecentProjects();

    const channel = supabase
      .channel(`recent-projects-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'projects',
        },
        (payload) => {
          const created = payload.new as RecentProject & { user_id?: string } | undefined;
          if (!created || created.user_id !== user.id) return;
          if (created.status === 'cancelled') return;
          setRecentProjects((prev) => {
            const next = [{ id: created.id, title: created.title, status: created.status }, ...prev.filter(p => p.id !== created.id)];
            return next.slice(0, 8);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
        },
        (payload) => {
          const updated = payload.new as Partial<RecentProject> | undefined;
          const updatedId = updated?.id;
          const updatedTitle = updated?.title;
          const updatedStatus = updated?.status;
          if (!updatedId) return;
          setRecentProjects((prev) => {
            const isInList = prev.some((project) => project.id === updatedId);
            if (updatedStatus === 'cancelled') {
              return prev.filter((project) => project.id !== updatedId);
            }
            if (!isInList) return prev;
            if (!updatedTitle) {
              fetchRecentProjects();
              return prev;
            }
            return prev.map((project) =>
              project.id === updatedId ? { ...project, title: updatedTitle, status: updatedStatus ?? project.status } : project
            );
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'projects',
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string } | undefined)?.id;
          if (!deletedId) return;
          setRecentProjects((prev) => prev.filter(p => p.id !== deletedId));
        }
      )
      .subscribe();

    const handleProjectMutation = (event: Event) => {
      const detail = (event as CustomEvent<ProjectMutationDetail>).detail;
      if (!detail?.projectId) return;

      if (detail.action === 'deleted' || detail.action === 'cancelled') {
        setRecentProjects((prev) => prev.filter((project) => project.id !== detail.projectId));
        return;
      }

      fetchRecentProjects();
    };

    window.addEventListener(PROJECT_MUTATION_EVENT, handleProjectMutation);

    return () => {
      isActive = false;
      window.removeEventListener(PROJECT_MUTATION_EVENT, handleProjectMutation);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  const isAdmin = isAdminEmail(user?.email);

  const navSections = sections.map((section) => ({
    ...section,
    items: [...section.items],
  }));

  if (isAdmin) {
    navSections.push({
      label: 'ADMIN',
      items: [
        { name: 'Admin Dashboard', href: '/dashboard/admin', icon: Settings },
      ],
    });
  }

  const isLowBalance = balance !== null && balance < 5;
  const logoTheme = resolvedTheme === 'light' ? 'light' : 'dark';
  const sharedProps = {
    pathname,
    activeSettingsSection,
    activeProjectId,
    user,
    balance,
    isLoadingBalance,
    isLowBalance,
    recentProjects,
    onSignOut: handleSignOut,
    isCollapsed: collapsed,
    onToggleCollapse: () => setCollapsed(!collapsed),
    isDemo,
    navSections,
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 transition-all duration-200 ${collapsed ? 'md:w-20' : 'md:w-64'}`}>
        <div className="flex flex-col flex-grow bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 shadow-[1px_0_0_0_#f1f5f9] dark:shadow-none overflow-visible">
          <SidebarContent {...sharedProps} />
        </div>
      </div>

      {/* Mobile top bar */}
      <div className="md:hidden">
        <div className="flex items-center justify-between bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <Link href="/dashboard/hub" className="flex items-center gap-2">
            <BrandLogo theme={logoTheme} />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open navigation menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 flex z-40 md:hidden">
          <div
            className="fixed inset-0 bg-black/50 dark:bg-black/75"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative flex flex-col max-w-[85vw] w-80 bg-white dark:bg-slate-950 h-full overflow-y-auto shadow-xl">
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              {...sharedProps}
              isCollapsed={false}
              onToggleCollapse={undefined}
              onNavClick={() => setIsMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
