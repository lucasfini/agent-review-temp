"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { isAdminEmail } from '@/lib/admin-access';
import { PROJECT_MUTATION_EVENT, type ProjectMutationDetail } from '@/lib/project-events';
import { LIBRARY_MUTATION_EVENT } from '@/lib/library-events';
import { supabase } from '@/lib/supabase/client';
import BrandLogo from '@/components/site/BrandLogo';
import SiteThemeToggle from '@/components/site/SiteThemeToggle';
import { createPortal } from 'react-dom';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import type { ContentLibrary } from '@/lib/content-libraries';
import {
  Building2,
  ChevronDown,
  LayoutGrid,
  Upload,
  BarChart3,
  Settings,
  CreditCard,
  Plug,
  BriefcaseBusiness,
  BookOpenText,
  ClipboardList,
  FileText,
  Inbox,
  Mail,
  Menu,
  PackageCheck,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  FolderKanban,
  Sparkles,
  Users,
} from 'lucide-react';

type NavItemDef = {
  name: string;
  href: string;
  icon: React.ElementType;
  settingsSection?: string;
  tourAttr?: string;
  children?: NavItemDef[];
};

type RecentProject = { id: string; title: string; status?: string | null };

const TOOLTIP_OFFSET_PX = 8;
const LATEST_LIBRARY_NAV_LIMIT = 3;

function getLibraryCreatedTime(library: ContentLibrary): number {
  const createdTime = Date.parse(library.createdAt);
  if (Number.isFinite(createdTime)) return createdTime;

  const updatedTime = Date.parse(library.updatedAt);
  return Number.isFinite(updatedTime) ? updatedTime : 0;
}

function getMobilePageTitle(pathname: string, activeSettingsSection: string | null): string {
  if (pathname === '/dashboard' || pathname === '/dashboard/hub') return 'All Projects';
  if (pathname === '/dashboard/projects') return 'Project Workspace';
  if (pathname === '/dashboard/upload') return 'Upload Audio';
  if (pathname === '/dashboard/studio/profile' || pathname === '/dashboard/onboarding') return 'Profile';
  if (pathname === '/dashboard/studio/voice' || pathname === '/dashboard/brand-voice') return 'Voice';
  if (pathname === '/dashboard/studio/plans' || pathname === '/dashboard/campaigns') return 'Plans';
  if (pathname.startsWith('/dashboard/studio')) return 'Studio';
  if (pathname.startsWith('/dashboard/library')) return 'Library';
  if (pathname.startsWith('/dashboard/agency/delivery')) return 'Client Delivery';
  if (pathname.startsWith('/dashboard/agency/drafts')) return 'Draft Review';
  if (pathname.startsWith('/dashboard/agency/granola')) return 'Granola Imports';
  if (pathname.startsWith('/dashboard/agency/leads')) return 'Agency Leads';
  if (pathname.startsWith('/dashboard/agency/slack')) return 'Slack Foundation';
  if (pathname.startsWith('/dashboard/agency/production')) return 'Production Queue';
  if (pathname.startsWith('/dashboard/agency/sources')) return 'Source Imports';
  if (pathname.startsWith('/dashboard/agency')) return 'Agency';
  if (pathname === '/dashboard/analytics') return 'Analytics';
  if (pathname === '/dashboard/billing') return 'Billing';
  if (pathname === '/dashboard/usage') return 'Usage';
  if (pathname === '/dashboard/team') return 'Team';
  if (pathname === '/dashboard/integrations') return 'Integrations';
  if (pathname === '/dashboard/contact') return 'Contact Us';
  if (pathname === '/dashboard/settings') {
    if (activeSettingsSection === 'workspace') return 'Workspace';
    if (activeSettingsSection === 'integrations') return 'Integrations';
    return 'Preferences';
  }
  if (pathname.startsWith('/dashboard/admin')) return 'Admin';
  return 'Dashboard';
}

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
  return (
    <SiteThemeToggle
      size={isCollapsed ? 'sm' : 'md'}
      className="border-transparent bg-transparent text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-900 dark:border-transparent dark:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
    />
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
      { name: 'All Projects', href: '/dashboard/hub', icon: LayoutGrid },
      {
        name: 'Studio',
        href: '/dashboard/studio',
        icon: Sparkles,
        children: [
          { name: 'Profile', href: '/dashboard/studio/profile', icon: Building2 },
          { name: 'Voice', href: '/dashboard/studio/voice', icon: Palette },
          { name: 'Plans', href: '/dashboard/studio/plans', icon: FolderKanban },
        ],
      },
      {
        name: 'Library',
        href: '/dashboard/library',
        icon: BookOpenText,
        children: [
          { name: 'All Saved', href: '/dashboard/library', icon: BookOpenText },
        ],
      },
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
      { name: 'Team', href: '/dashboard/team', icon: Users },
      { name: 'Integrations', href: '/dashboard/integrations', icon: Plug },
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
        ? 'bg-blue-500 text-white shadow-[0_12px_28px_-16px_rgba(59,130,246,0.95)]'
        : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`}
    >
      <Icon
        className={`flex-shrink-0 ${mobile ? 'h-5 w-5' : isCollapsed ? 'h-5 w-5' : 'h-4 w-4'} ${isActive
          ? 'text-white'
          : 'text-slate-400 group-hover:text-slate-100'
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

function NavGroup({
  item,
  isActive,
  isChildActive,
  onClick,
  isCollapsed = false,
}: {
  item: NavItemDef;
  isActive: boolean;
  isChildActive: (item: NavItemDef) => boolean;
  onClick?: () => void;
  isCollapsed?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isActive);
  const Icon = item.icon;

  useEffect(() => {
    if (isActive) {
      setIsOpen(true);
    }
  }, [isActive]);

  if (isCollapsed) {
    return (
      <NavItem
        item={{ name: item.name, href: item.href, icon: item.icon }}
        isActive={isActive}
        onClick={onClick}
        isCollapsed
      />
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-500 text-white shadow-[0_12px_28px_-16px_rgba(59,130,246,0.95)]'
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Icon
          className={`h-4 w-4 flex-shrink-0 ${
            isActive
              ? 'text-white'
              : 'text-slate-400 group-hover:text-slate-100'
          }`}
        />
        <span className="min-w-0 flex-1 text-left">{item.name}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && item.children && (
        <div className="mt-1 space-y-0.5 pl-4">
          {item.children.map((child) => (
            <NavItem
              key={child.name}
              item={child}
              isActive={isChildActive(child)}
              onClick={onClick}
            />
          ))}
        </div>
      )}
    </div>
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
  currentLibraryId,
  activeProjectId,
  user,
  recentProjects,
  onSignOut,
  onNavClick,
  isCollapsed,
  onToggleCollapse,
  hideChromeForCapture,
  navSections,
}: {
  pathname: string;
  activeSettingsSection: string | null;
  currentLibraryId: string | null;
  activeProjectId: string | null;
  user: SupabaseUser | null;
  recentProjects: RecentProject[];
  onSignOut: () => void;
  onNavClick?: () => void;
  isCollapsed: boolean;
  onToggleCollapse?: () => void;
  hideChromeForCapture?: boolean;
  navSections: Array<{ label: string; items: NavItemDef[] }>;
}) {
  const displayName = getDisplayName(user);
  const avatarUrl = getUserAvatarUrl(user);
  const logoTheme = 'dark';
  const emailLabel = user?.email ?? '';

  const isActive = (item: NavItemDef): boolean => {
    if (item.children?.length) {
      return pathname === item.href
        || pathname.startsWith(item.href + '/')
        || item.children.some((child) => isActive(child));
    }
    const [hrefPath, hrefQuery = ''] = item.href.split('?');
    const hrefParams = new URLSearchParams(hrefQuery);
    const hrefLibraryId = hrefParams.get('library');
    if (hrefPath === '/dashboard/library') {
      if (hrefLibraryId) {
        return pathname === hrefPath && currentLibraryId === hrefLibraryId;
      }
      return pathname === hrefPath && !currentLibraryId;
    }
    if (item.settingsSection) {
      return pathname === '/dashboard/settings' && activeSettingsSection === item.settingsSection;
    }
    if (item.href === '/dashboard/hub') {
      return pathname === '/dashboard/hub' || pathname === '/dashboard';
    }
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Logo */}
      <div className={`flex-shrink-0 p-3 ${isCollapsed ? 'flex flex-col items-center gap-2 pt-4' : 'flex items-center justify-between'}`}>
        <Link
          href={user ? '/dashboard/hub' : '/'}
          className={`flex h-10 items-center rounded-lg transition-colors hover:bg-white/10 ${
            isCollapsed ? 'w-10 justify-center' : 'w-full max-w-[12.25rem] justify-start px-1'
          }`}
          aria-label="AudioRepurpose home"
          title={isCollapsed ? 'AudioRepurpose' : undefined}
        >
          <BrandLogo
            showText={!isCollapsed}
            showSubtitle={false}
            mode={isCollapsed ? 'icon' : 'lockup'}
            size="sm"
            theme={logoTheme}
          />
        </Link>
        {onToggleCollapse && (
          <TooltipIconButton
            onClick={onToggleCollapse}
            label={isCollapsed ? 'Open sidebar' : 'Close sidebar'}
            title={isCollapsed ? 'Open sidebar' : 'Close sidebar'}
            icon={isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          />
        )}
      </div>

      {/* Grouped Navigation */}
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-visible px-3">
        {navSections.map((section) => (
          <div key={section.label}>
            {!isCollapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                item.children?.length ? (
                  <NavGroup
                    key={item.name}
                    item={item}
                    isActive={isActive(item)}
                    isChildActive={isActive}
                    onClick={onNavClick}
                    isCollapsed={isCollapsed}
                  />
                ) : (
                  <NavItem
                    key={item.name}
                    item={item}
                    isActive={isActive(item)}
                    onClick={onNavClick}
                    isCollapsed={isCollapsed}
                  />
                )
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
                          ? 'bg-white/10 text-white'
                          : 'text-slate-400 hover:bg-white/10 hover:text-white'
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
      {!hideChromeForCapture && (
        <div className="flex-shrink-0 mt-auto px-3 pb-5 flex flex-col gap-3">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200/80 dark:via-slate-800/60 to-transparent w-full" />

          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <div
                className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/10 text-xs font-semibold text-slate-100 shadow-sm"
                title={emailLabel || displayName}
                role="img"
                aria-label={`${emailLabel || displayName} profile`}
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
              </div>
              <Link
                href="/dashboard/settings?section=preferences"
                onClick={onNavClick}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 shadow-sm transition-colors hover:bg-white/10 hover:text-white"
                title="Settings"
                aria-label="Open settings"
              >
                <Settings className="h-4 w-4" />
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
            <div className="overflow-hidden pb-2">
              <div className="space-y-3">
                <div className="flex min-w-0 items-center gap-3 rounded-xl px-1">
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
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {displayName}
                    </p>
                  </div>
                  <Link
                    href="/dashboard/settings?section=preferences"
                    onClick={onNavClick}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    title="Settings"
                    aria-label="Open settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                </div>

                <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5">
                  <div className="flex-shrink-0 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80">
                    <ThemeToggle />
                  </div>
                  <button
                    onClick={onSignOut}
                    className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-red-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-red-400"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
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
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [contentLibraries, setContentLibraries] = useState<ContentLibrary[]>([]);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, session, signOut } = useAuth();
  const { organization, organizationId } = useCurrentOrganization();
  const { organization: agencyOrganization } = useCurrentOrganization({ organizationType: 'internal_agency' });
  const hideChromeForCapture = searchParams.get('capture') === '1';

  const rawSettingsSection = searchParams.get('section');
  const currentLibraryId = searchParams.get('library');
  const activeSettingsSection = pathname.startsWith('/dashboard/settings')
    ? (rawSettingsSection === 'workspace' || rawSettingsSection === 'integrations' ? rawSettingsSection : 'preferences')
    : null;
  const mobilePageTitle = useMemo(
    () => getMobilePageTitle(pathname, activeSettingsSection),
    [pathname, activeSettingsSection]
  );
  const mobileActionHref = pathname === '/dashboard/upload' ? null : '/dashboard/upload';
  const mobileActionLabel = pathname === '/dashboard/projects' ? 'Upload' : 'Upload';

  const activeProjectId = searchParams.get('id');
  const collapsed = isCollapsed ?? localCollapsed;
  const setCollapsed = onCollapseChange ?? setLocalCollapsed;

  useEffect(() => {
    if (!user) {
      setContentLibraries([]);
      return;
    }

    let isActive = true;

    const fetchContentLibraries = async () => {
      try {
        const response = await fetch(withOrganizationId('/api/content-libraries', organizationId), {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          cache: 'no-store',
        });

        if (!response.ok) return;

        const payload = await response.json() as { contentLibraries?: ContentLibrary[] };
        if (isActive && Array.isArray(payload.contentLibraries)) {
          setContentLibraries(
            payload.contentLibraries
              .slice()
              .sort((first, second) => getLibraryCreatedTime(second) - getLibraryCreatedTime(first))
              .slice(0, LATEST_LIBRARY_NAV_LIMIT)
          );
        }
      } catch (error) {
        console.error('Error fetching content libraries:', error);
      }
    };

    void fetchContentLibraries();

    return () => {
      isActive = false;
    };
  }, [libraryRefreshKey, organizationId, session?.access_token, user]);

  useEffect(() => {
    const handleLibraryMutation = () => {
      setLibraryRefreshKey((current) => current + 1);
    };

    window.addEventListener(LIBRARY_MUTATION_EVENT, handleLibraryMutation);
    return () => {
      window.removeEventListener(LIBRARY_MUTATION_EVENT, handleLibraryMutation);
    };
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!user) return;
    let isActive = true;

    const fetchRecentProjects = async () => {
      try {
        const response = await fetch(withOrganizationId('/api/dashboard/projects?limit=5', organizationId), {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          cache: 'no-store',
        });

        if (!response.ok) return;

        const payload = await response.json() as { projects?: RecentProject[] };
        if (isActive && payload.projects) {
          setRecentProjects(
            payload.projects.filter((project) => project.status === 'completed').slice(0, 5)
          );
        }
      } catch (error) {
        console.error('Error fetching recent projects:', error);
      }
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
          if (created.status !== 'completed') return;
          setRecentProjects((prev) => {
            const next = [{ id: created.id, title: created.title, status: created.status }, ...prev.filter(p => p.id !== created.id)];
            return next.slice(0, 5);
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
            if (updatedStatus !== 'completed') {
              return prev.filter((project) => project.id !== updatedId);
            }
            if (!isInList) {
              fetchRecentProjects();
              return prev;
            }
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
  }, [organizationId, session?.access_token, user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  const isAdmin = isAdminEmail(user?.email);

  const navSections = sections.map((section) => ({
    ...section,
    items: [...section.items],
  }));

  const workspaceSection = navSections.find((section) => section.label === 'WORKSPACE');
  const libraryItem = workspaceSection?.items.find((item) => item.name === 'Library');
  if (libraryItem) {
    libraryItem.children = [
      { name: 'All Saved', href: '/dashboard/library', icon: BookOpenText },
      ...contentLibraries.map((library) => ({
        name: library.name,
        href: `/dashboard/library?library=${encodeURIComponent(library.id)}`,
        icon: BookOpenText,
      })),
    ];
  }

  if (organization?.type === 'internal_agency' || agencyOrganization?.type === 'internal_agency') {
    navSections.push({
      label: 'AGENCY',
      items: [
        { name: 'Agency Clients', href: '/dashboard/agency', icon: BriefcaseBusiness },
        { name: 'Agency Leads', href: '/dashboard/agency/leads', icon: Inbox },
        { name: 'Source Imports', href: '/dashboard/agency/sources', icon: BookOpenText },
        { name: 'Production Queue', href: '/dashboard/agency/production', icon: ClipboardList },
        { name: 'Draft Review', href: '/dashboard/agency/drafts', icon: FileText },
        { name: 'Client Delivery', href: '/dashboard/agency/delivery', icon: PackageCheck },
        { name: 'Granola Imports', href: '/dashboard/agency/granola', icon: BookOpenText },
        { name: 'Slack Foundation', href: '/dashboard/agency/slack', icon: Mail },
      ],
    });
  }

  if (isAdmin) {
    navSections.push({
      label: 'ADMIN',
      items: [
        { name: 'Admin Dashboard', href: '/dashboard/admin', icon: Settings },
      ],
    });
  }

  const logoTheme = 'dark';
  const sharedProps = {
    pathname,
    activeSettingsSection,
    currentLibraryId,
    activeProjectId,
    user,
    recentProjects,
    onSignOut: handleSignOut,
    isCollapsed: collapsed,
    onToggleCollapse: () => setCollapsed(!collapsed),
    hideChromeForCapture,
    navSections,
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={`hidden md:flex md:min-h-0 md:flex-col md:fixed md:inset-y-0 transition-all duration-200 ${collapsed ? 'md:w-20' : 'md:w-64'}`}>
        <div className="themeable-dashboard-nav flex min-h-0 flex-grow flex-col overflow-visible border-r border-white/10 bg-[#061126]/98 shadow-[1px_0_0_0_rgba(255,255,255,0.04)] backdrop-blur">
          <SidebarContent {...sharedProps} />
        </div>
      </div>

      {/* Mobile top bar */}
      <div className="md:hidden">
        <div className="themeable-dashboard-nav sticky top-0 z-30 border-b border-white/10 bg-[#061126]/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Link
                href="/dashboard/hub"
                className="hidden rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 min-[375px]:inline-flex dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="AudioRepurpose home"
              >
                <BrandLogo showText={false} showSubtitle={false} mode="icon" theme={logoTheme} size="sm" />
              </Link>
            </div>

            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-semibold text-slate-100">
                {mobilePageTitle}
              </p>
            </div>

            <div className="flex items-center justify-end gap-1">
              {mobileActionHref ? (
                <Link
                  href={mobileActionHref}
                  className="inline-flex min-w-[3.75rem] items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  {mobileActionLabel}
                </Link>
              ) : (
                <ThemeToggle />
              )}
              {mobileActionHref && <ThemeToggle />}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/50 dark:bg-black/75"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="themeable-dashboard-nav relative flex h-full min-h-0 w-[min(88vw,20rem)] flex-col overflow-hidden bg-[#061126] shadow-xl">
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
