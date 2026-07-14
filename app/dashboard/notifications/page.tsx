"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, CheckCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { DashboardHeaderAction, DashboardPageHeader, DashboardPageShell } from '@/components/dashboard/shell';
import { useAuth } from '@/lib/auth/context';
import { cn } from '@/lib/utils';

type DashboardNotification = {
  id: string;
  type?: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationResponse = {
  notifications?: DashboardNotification[];
  unreadCount?: number;
  nextCursor?: string | null;
  error?: string;
};

const PAGE_SIZE = 50;
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

function formatExactTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function notificationTypeLabel(value?: string): string {
  if (!value) return 'Update';
  if (value.includes('upload')) return 'Upload';
  if (value.includes('transcription') || value.includes('transcript')) return 'Transcript';
  if (value.includes('content_generation') || value.includes('content_')) return 'Content';
  if (value.includes('integration')) return 'Integration';
  if (value.includes('credit') || value.includes('payment') || value.includes('plan') || value.includes('top_up')) return 'Billing';
  if (value.includes('team') || value.includes('member') || value.includes('workspace') || value.includes('ownership')) return 'Workspace';
  if (value.includes('asset') || value.includes('library')) return 'Library';

  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ') || 'Update';
}

function mergeNotifications(
  current: DashboardNotification[],
  incoming: DashboardNotification[]
): DashboardNotification[] {
  const byId = new Map(current.map((notification) => [notification.id, notification]));
  incoming.forEach((notification) => {
    byId.set(notification.id, notification);
  });

  return Array.from(byId.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export default function NotificationsPage() {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const unreadVisibleCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications]
  );

  const applySyntheticReadState = useCallback((items: DashboardNotification[]) => {
    const localReadIds = loadReadSyntheticNotificationIds();
    return items.map((notification) => (
      isSyntheticNotification(notification) && localReadIds.has(notification.id)
        ? { ...notification, readAt: notification.readAt || new Date().toISOString() }
        : notification
    ));
  }, []);

  const loadNotifications = useCallback(async (cursor?: string | null) => {
    if (!session?.access_token) {
      setNotifications([]);
      setUnreadCount(0);
      setNextCursor(null);
      setLoadingInitial(false);
      return;
    }

    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoadingInitial(true);
    }

    try {
      const params = new URLSearchParams({
        include_read: 'true',
        limit: String(PAGE_SIZE),
      });
      if (cursor) params.set('before', cursor);

      const response = await fetch(`/api/notifications?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as NotificationResponse;
      if (!response.ok) throw new Error(payload.error || 'Failed to load notifications.');

      const nextNotifications = applySyntheticReadState(
        Array.isArray(payload.notifications) ? payload.notifications : []
      );
      const hasSyntheticNotifications = nextNotifications.some(isSyntheticNotification);

      setNotifications((current) => (
        cursor ? mergeNotifications(current, nextNotifications) : nextNotifications
      ));
      setUnreadCount(hasSyntheticNotifications
        ? nextNotifications.filter((notification) => !notification.readAt).length
        : Number(payload.unreadCount || 0));
      setNextCursor(payload.nextCursor || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load notifications.');
      if (!cursor) {
        setNotifications([]);
        setUnreadCount(0);
        setNextCursor(null);
      }
    } finally {
      setLoadingInitial(false);
      setLoadingMore(false);
    }
  }, [applySyntheticReadState, session?.access_token]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markAllRead = async () => {
    if (!session?.access_token || markingAllRead) return;

    setMarkingAllRead(true);
    const localReadIds = loadReadSyntheticNotificationIds();
    notifications.filter(isSyntheticNotification).forEach((notification) => {
      localReadIds.add(notification.id);
    });
    saveReadSyntheticNotificationIds(localReadIds);
    setUnreadCount(0);
    setNotifications((current) => current.map((notification) => ({
      ...notification,
      readAt: notification.readAt || new Date().toISOString(),
    })));

    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      window.dispatchEvent(new Event('audiorepurpose:notifications-refresh'));
    } catch {
      toast.error('Failed to mark notifications read.');
    } finally {
      setMarkingAllRead(false);
    }
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
    window.dispatchEvent(new Event('audiorepurpose:notifications-refresh'));
  };

  return (
    <DashboardPageShell maxWidth="5xl">
      <DashboardPageHeader
        icon={Bell}
        title="Notifications"
        description="Review workspace activity, processing updates, billing alerts, and shared content history."
        actions={(
          <DashboardHeaderAction
            type="button"
            icon={CheckCheck}
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0 || markingAllRead}
          >
            {markingAllRead ? 'Marking read' : 'Mark all read'}
          </DashboardHeaderAction>
        )}
      />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-1 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950 dark:text-white">All notifications</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {unreadCount} unread across this workspace
            </p>
          </div>
          {unreadVisibleCount > 0 && (
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              {unreadVisibleCount} unread visible
            </span>
          )}
        </div>

        {loadingInitial ? (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notifications
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No notifications yet.</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Processing updates and workspace activity will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((notification) => {
              const category = notificationTypeLabel(notification.type);
              const exactTime = formatExactTime(notification.createdAt);
              const content = (
                <span className="flex gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                  <span className={cn(
                    'mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full',
                    notification.readAt ? 'bg-slate-300 dark:bg-slate-700' : 'bg-blue-600'
                  )} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-bold text-slate-950 dark:text-white">{notification.title}</span>
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        {category}
                      </span>
                    </span>
                    {notification.body && (
                      <span className="mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">{notification.body}</span>
                    )}
                    <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-500">
                      <span>{formatRelativeTime(notification.createdAt)}</span>
                      {exactTime && (
                        <>
                          <span aria-hidden="true">/</span>
                          <span>{exactTime}</span>
                        </>
                      )}
                    </span>
                  </span>
                  {notification.href && (
                    <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-400" />
                  )}
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
            })}
          </div>
        )}

        {!loadingInitial && nextCursor && (
          <div className="border-t border-slate-100 px-5 py-4 text-center dark:border-slate-800">
            <button
              type="button"
              onClick={() => void loadNotifications(nextCursor)}
              disabled={loadingMore}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              Load older
            </button>
          </div>
        )}
      </section>
    </DashboardPageShell>
  );
}
