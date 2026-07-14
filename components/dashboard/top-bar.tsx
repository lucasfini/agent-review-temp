"use client";

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { ArrowRight, Bell, Check, ChevronDown, HelpCircle, Loader2, UsersRound } from 'lucide-react';

import { useAuth } from '@/lib/auth/context';
import {
  fetchWorkspaceOptions,
  switchActiveOrganization,
  type WorkspaceOption,
} from '@/lib/organizations/current-organization';
import { cn } from '@/lib/utils';

type DashboardNotification = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationResponse = {
  notifications?: DashboardNotification[];
  unreadCount?: number;
  error?: string;
};

const SYNTHETIC_NOTIFICATION_PREFIX = 'synthetic:';
const READ_SYNTHETIC_NOTIFICATIONS_KEY = 'audiorepurpose:read-synthetic-notifications';

function isSyntheticNotification(notification: DashboardNotification): boolean {
  return notification.id.startsWith(SYNTHETIC_NOTIFICATION_PREFIX);
}

function loadReadSyntheticNotificationIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const parsed = JSON.parse(window.localStorage.getItem(READ_SYNTHETIC_NOTIFICATIONS_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveReadSyntheticNotificationIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(READ_SYNTHETIC_NOTIFICATIONS_KEY, JSON.stringify(Array.from(ids).slice(-200)));
}

function useHeaderDropdownPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  width: string
) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      setStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        right: Math.max(16, window.innerWidth - rect.right),
        width,
        zIndex: 1000,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, triggerRef, width]);

  return style;
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';

  const diffSeconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function WorkspaceSwitcher() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuStyle = useHeaderDropdownPosition(open, triggerRef, 'min(20rem, calc(100vw - 2rem))');

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentId) || workspaces.find((workspace) => workspace.isCurrent) || workspaces[0] || null,
    [currentId, workspaces]
  );

  const loadWorkspaces = useCallback(async () => {
    if (!session?.access_token) {
      setWorkspaces([]);
      setCurrentId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await fetchWorkspaceOptions(session.access_token);
      setWorkspaces(result.organizations);
      setCurrentId(result.currentOrganizationId);
    } catch {
      setWorkspaces([]);
      setCurrentId(null);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const selectWorkspace = async (workspace: WorkspaceOption) => {
    if (workspace.id === currentId || switchingId) {
      setOpen(false);
      return;
    }

    setSwitchingId(workspace.id);
    try {
      const next = await switchActiveOrganization(workspace.id, session?.access_token);
      setCurrentId(next.id);
      setWorkspaces((current) => current.map((item) => ({
        ...item,
        isCurrent: item.id === next.id,
      })));
      window.location.reload();
    } finally {
      setSwitchingId(null);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 max-w-[18rem] items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UsersRound className="h-4 w-4 flex-shrink-0 text-slate-500 dark:text-slate-300" />
        <span className="truncate">
          {loading ? 'Loading workspace' : currentWorkspace?.name || 'Workspace'}
        </span>
        <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && menuStyle && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_22px_60px_-28px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-slate-950"
        >
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:border-white/10 dark:text-slate-400">
            Workspaces
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {workspaces.length === 0 ? (
              <p className="px-3 py-5 text-sm text-slate-500 dark:text-slate-400">
                No workspaces available.
              </p>
            ) : (
              workspaces.map((workspace) => {
                const selected = workspace.id === currentId || workspace.isCurrent;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => void selectWorkspace(workspace)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                      {workspace.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{workspace.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{workspace.role || workspace.type}</span>
                    </span>
                    {switchingId === workspace.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    ) : selected ? (
                      <Check className="h-4 w-4 text-blue-600" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function NotificationsMenu() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuStyle = useHeaderDropdownPosition(open, triggerRef, 'min(24rem, calc(100vw - 2rem))');

  const loadNotifications = useCallback(async () => {
    if (!session?.access_token) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/notifications?limit=10&include_read=true', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as NotificationResponse;
      if (!response.ok) throw new Error(payload.error || 'Failed to load notifications');
      const localReadIds = loadReadSyntheticNotificationIds();
      const nextNotifications = (Array.isArray(payload.notifications) ? payload.notifications : []).map((notification) => (
        isSyntheticNotification(notification) && localReadIds.has(notification.id)
          ? { ...notification, readAt: notification.readAt || new Date().toISOString() }
          : notification
      ));
      const hasSyntheticNotifications = nextNotifications.some(isSyntheticNotification);
      setNotifications(nextNotifications);
      setUnreadCount(hasSyntheticNotifications
        ? nextNotifications.filter((notification) => !notification.readAt).length
        : Number(payload.unreadCount || 0));
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!session?.access_token || typeof window === 'undefined') return;

    const refresh = () => {
      void loadNotifications();
    };
    const refreshOnFocus = () => {
      if (document.visibilityState !== 'hidden') refresh();
    };
    const intervalId = window.setInterval(refresh, 30_000);

    window.addEventListener('focus', refresh);
    window.addEventListener('visibilitychange', refreshOnFocus);
    window.addEventListener('audiorepurpose:notifications-refresh', refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('visibilitychange', refreshOnFocus);
      window.removeEventListener('audiorepurpose:notifications-refresh', refresh);
    };
  }, [loadNotifications, session?.access_token]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const markAllRead = async () => {
    if (!session?.access_token) return;
    setUnreadCount(0);
    const localReadIds = loadReadSyntheticNotificationIds();
    notifications.filter(isSyntheticNotification).forEach((notification) => {
      localReadIds.add(notification.id);
    });
    saveReadSyntheticNotificationIds(localReadIds);
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }).catch(() => undefined);
  };

  const markRead = async (notification: DashboardNotification) => {
    if (!session?.access_token || notification.readAt) return;
    setUnreadCount((current) => Math.max(0, current - 1));
    if (isSyntheticNotification(notification)) {
      const localReadIds = loadReadSyntheticNotificationIds();
      localReadIds.add(notification.id);
      saveReadSyntheticNotificationIds(localReadIds);
    }
    setNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item
    )));
    await fetch(`/api/notifications/${notification.id}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }).catch(() => undefined);
  };
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void loadNotifications();
        }}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-blue-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm dark:border-[#061126]">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && menuStyle && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_22px_60px_-28px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-slate-950"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div>
              <p className="text-sm font-bold text-slate-950 dark:text-white">Notifications</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
              className="text-xs font-semibold text-blue-700 transition-colors hover:text-blue-800 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-blue-300 dark:hover:text-blue-200"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-[28rem] overflow-y-auto p-1.5">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No notifications yet.
              </p>
            ) : (
              notifications.map((notification) => {
                const content = (
                  <span className="flex gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/10">
                    <span className={cn(
                      'mt-1 h-2 w-2 flex-shrink-0 rounded-full',
                      notification.readAt ? 'bg-slate-300 dark:bg-slate-700' : 'bg-blue-600'
                    )} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-950 dark:text-white">{notification.title}</span>
                      {notification.body && (
                        <span className="mt-1 block text-sm leading-5 text-slate-600 dark:text-slate-300">{notification.body}</span>
                      )}
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-500">{formatRelativeTime(notification.createdAt)}</span>
                    </span>
                  </span>
                );

                if (notification.href) {
                  return (
                    <Link
                      key={notification.id}
                      href={notification.href}
                      onClick={() => void markRead(notification)}
                      className="block"
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void markRead(notification)}
                    className="block w-full"
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-slate-100 p-2 dark:border-white/10">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
            >
              <span>View all notifications</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function DashboardTopBar() {
  return (
    <header className="relative z-[80] hidden h-16 flex-shrink-0 items-center justify-end border-b border-slate-200 bg-white/92 px-6 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur dark:border-white/10 dark:bg-[#061126]/92 md:flex">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/contact"
          className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <HelpCircle className="h-4 w-4" />
          Help
        </Link>
        <NotificationsMenu />
        <WorkspaceSwitcher />
      </div>
    </header>
  );
}
