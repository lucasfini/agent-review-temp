"use client";

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Building2, ChevronDown, Lock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type Size = 'default' | 'compact' | 'sm';

const actionButtonClassBase =
  'inline-flex items-center justify-center gap-2 text-sm font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60';

function actionButtonSizeClass(size: Size): string {
  if (size === 'compact') return 'h-9 min-w-0 rounded-md px-3';
  if (size === 'sm') return 'h-9 rounded-md px-3';
  return 'h-10 rounded-md px-4';
}

function actionButtonVariantClass(variant: Variant): string {
  if (variant === 'primary') {
    return 'bg-blue-600 text-white shadow-sm hover:bg-blue-700';
  }
  if (variant === 'danger') {
    return 'border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/30';
  }
  if (variant === 'outline') {
    return 'inline-flex border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
  }
  if (variant === 'ghost') {
    return 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800';
  }
  return 'border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
}

export type ActionBarProps = {
  children: ReactNode;
  className?: string;
};

export function ActionBar({ children, className }: ActionBarProps) {
  return <div className={cn('flex flex-wrap items-center gap-2 text-sm', className)}>{children}</div>;
}

export function ActionButton({
  variant = 'secondary',
  size = 'default',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={cn(
        actionButtonClassBase,
        actionButtonVariantClass(variant),
        actionButtonSizeClass(size),
        className
      )}
    />
  );
}

type ActionLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'color' | 'size'
> & {
  variant?: Variant;
  size?: Size;
  href: string;
};

export function ActionLink({
  href,
  variant = 'secondary',
  size = 'default',
  className,
  ...props
}: ActionLinkProps) {
  return (
    <Link
      {...props}
      href={href}
      className={cn(
        actionButtonClassBase,
        actionButtonVariantClass(variant),
        actionButtonSizeClass(size),
        className
      )}
    />
  );
}

export type ActionSelectTriggerProps = {
  label: string;
  icon: ReactNode;
  scopeLabel?: string | null;
  loading?: boolean;
  compact?: boolean;
  className?: string;
};

export function ActionSelectTrigger({
  label,
  icon,
  scopeLabel,
  loading = false,
  compact = false,
  className,
}: ActionSelectTriggerProps) {
  return (
    <button
      type="button"
      disabled={loading}
      className={cn(
        'inline-flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-[240px] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800',
        compact && 'sm:w-[180px]',
        className
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-4 w-4 flex-shrink-0 text-slate-500">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </span>
      {scopeLabel ? (
        <span className="ml-auto hidden flex-shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500 sm:inline-flex dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
          {scopeLabel}
        </span>
      ) : null}
      <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400" />
    </button>
  );
}

type SharedAccessControlProps = {
  entityLabel: string;
  scope?: 'private' | 'organization' | null;
  canShare?: boolean;
  canUnshare?: boolean;
  loading?: boolean;
  onShare?: () => void;
  onUnshare?: () => void;
  shareUnavailableMessage?: string | null;
  className?: string;
  show?: boolean;
};

export function SharedAccessControl({
  entityLabel,
  scope,
  canShare = false,
  canUnshare = false,
  loading = false,
  onShare,
  onUnshare,
  shareUnavailableMessage,
  className,
  show = true,
}: SharedAccessControlProps) {
  if (!show) {
    return null;
  }

  const isOrganization = scope === 'organization';
  const hasSavedAsset = scope === 'private' || scope === 'organization';
  const statusLabel = isOrganization ? 'Team' : 'Private to me';
  const showShareUnavailable = hasSavedAsset && !isOrganization && Boolean(shareUnavailableMessage);

  return (
    <DropdownMenu
      align="right"
      portal
      className={className}
      trigger={(
        <button
          type="button"
          disabled={loading}
          className={cn(
            'inline-flex h-10 max-w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900',
            className
          )}
          aria-label={`Open ${entityLabel} access menu`}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className={cn(
              'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md',
              isOrganization
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
            )}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isOrganization ? (
                <Building2 className="h-3.5 w-3.5" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-[10px] font-semibold uppercase leading-3 tracking-wide text-slate-400 dark:text-slate-500">
                Access
              </span>
              <span className="block truncate">{statusLabel}</span>
            </span>
          </span>
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400" />
        </button>
      )}
    >
      <DropdownMenuLabel>Access</DropdownMenuLabel>
      <DropdownMenuItem disabled>
        {hasSavedAsset
          ? isOrganization
            ? `Available to this team.`
            : `Only you can use this ${entityLabel}.`
          : `Save this ${entityLabel} before publishing.`}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {canShare && onShare && (
        <DropdownMenuItem onClick={onShare} disabled={loading}>
          <Building2 className="h-4 w-4" />
          Publish to team
        </DropdownMenuItem>
      )}
      {!canShare && showShareUnavailable && (
        <DropdownMenuItem disabled>
          <Building2 className="h-4 w-4" />
          {shareUnavailableMessage}
        </DropdownMenuItem>
      )}
      {canUnshare && onUnshare && (
        <DropdownMenuItem onClick={onUnshare} disabled={loading}>
          <Lock className="h-4 w-4" />
          Move to private
        </DropdownMenuItem>
      )}
      {(!hasSavedAsset || (!canShare && !canUnshare && !showShareUnavailable)) && (
        <DropdownMenuItem disabled>
          {!hasSavedAsset ? 'No access changes yet' : 'No access changes available'}
        </DropdownMenuItem>
      )}
    </DropdownMenu>
  );
}

export function AccessStatusBadge({
  scope,
}: {
  scope: 'private' | 'organization' | null;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
      {scope === 'organization' ? <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" /> : <Lock className="h-3.5 w-3.5 text-slate-500" />}
      {scope === 'organization' ? 'Team' : 'Private to me'}
    </span>
  );
}
