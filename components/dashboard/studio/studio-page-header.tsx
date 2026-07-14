"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  FolderKanban,
  Loader2,
  Palette,
  House,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ActionBar,
  ActionSelectTrigger,
  SharedAccessControl,
} from '@/components/dashboard/action-controls';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth/context';
import {
  fetchWorkspaceOptions,
  switchActiveOrganization,
  type CurrentOrganization,
  type WorkspaceOption,
} from '@/lib/organizations/current-organization';
import { cn } from '@/lib/utils';

export type StudioStepId = 'profile' | 'voice' | 'plans';

type StudioStepMeta = {
  label?: string;
  score?: number;
  complete?: boolean;
};

type StudioStepNavProps = {
  activeStep: StudioStepId;
  steps?: Partial<Record<StudioStepId, StudioStepMeta>>;
  className?: string;
};

type ReadinessItem = {
  label: string;
  done: boolean;
  detail?: string;
};

type StudioReadinessCardProps = {
  title: string;
  description?: string;
  score: number;
  items: ReadinessItem[];
  statusLabel?: string;
  children?: ReactNode;
  className?: string;
};

type StudioMobileActionBarProps = {
  primaryLabel: string;
  onPrimary: () => void;
  disabled?: boolean;
  loading?: boolean;
  primaryIcon?: ReactNode;
  secondary?: ReactNode;
  className?: string;
};

type StudioAccessControlProps = Parameters<typeof SharedAccessControl>[0];

type StudioWorkspaceContextValue = {
  organization: CurrentOrganization | null;
  organizationId: string | null;
  loading: boolean;
  workspaces: WorkspaceOption[];
  switchingId: string | null;
  error: string | null;
  refresh: () => Promise<void>;
  switchWorkspace: (workspace: WorkspaceOption) => Promise<void>;
};

const StudioWorkspaceContext = createContext<StudioWorkspaceContextValue | null>(null);

const studioSteps: Array<{
  id: StudioStepId;
  title: string;
  description: string;
  href: string;
  icon: typeof Building2;
}> = [
  {
    id: 'profile',
    title: 'Profile',
    description: 'Brand, offer, and audience context.',
    href: '/dashboard/studio/profile',
    icon: Building2,
  },
  {
    id: 'voice',
    title: 'Voice',
    description: 'Tone, examples, and language rules.',
    href: '/dashboard/studio/voice',
    icon: Palette,
  },
  {
    id: 'plans',
    title: 'Plans',
    description: 'Campaign briefs and output channels.',
    href: '/dashboard/studio/plans',
    icon: FolderKanban,
  },
];

export function StudioStepNav({ activeStep, steps = {}, className }: StudioStepNavProps) {
  const activeIndex = studioSteps.findIndex((step) => step.id === activeStep);

  return (
    <nav aria-label="Studio setup" className={cn('rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900', className)}>
      <ol className="grid gap-px overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800 sm:grid-cols-3">
        {studioSteps.map((step, index) => {
          const Icon = step.icon;
          const meta = steps[step.id];
          const active = step.id === activeStep;
          const complete = Boolean(meta?.complete || (typeof meta?.score === 'number' && meta.score >= 80));
          const statusLabel = meta?.label
            || (active ? 'Current step' : complete ? 'Ready' : index > activeIndex ? 'Next' : 'Open');

          return (
            <li key={step.id} className="min-w-0 bg-white dark:bg-slate-900">
              <Link
                href={step.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex h-full min-h-[5.25rem] min-w-0 items-start gap-3 p-3 transition sm:p-4',
                  active
                    ? 'bg-blue-50 text-blue-950 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/30 dark:text-blue-50 dark:ring-blue-900/70'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border',
                    active
                      ? 'border-blue-200 bg-blue-600 text-white dark:border-blue-700'
                      : complete
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                  )}
                >
                  {complete && !active ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold">{step.title}</span>
                    {active && <Circle className="h-2 w-2 flex-shrink-0 fill-blue-600 text-blue-600 dark:fill-blue-300 dark:text-blue-300" />}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{step.description}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-300">
                    {typeof meta?.score === 'number' ? `${meta.score}%` : statusLabel}
                    {!active && <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StudioReadinessCard({
  title,
  description,
  score,
  items,
  statusLabel,
  children,
  className,
}: StudioReadinessCardProps) {
  const safeScore = Math.max(0, Math.min(100, score));
  const label = statusLabel || (safeScore >= 80 ? 'Ready to use' : safeScore >= 50 ? 'Almost ready' : 'Needs context');

  return (
    <Card className={cn('rounded-md', className)}>
      <CardHeader className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription className="mt-2 leading-5">{description}</CardDescription>}
          </div>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            {label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div>
          <div className="flex items-end justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Completion</p>
            <p className="text-2xl font-semibold text-slate-950 dark:text-white">{safeScore}%</p>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={cn('h-2 rounded-full', safeScore >= 80 ? 'bg-emerald-500' : 'bg-blue-600')}
              style={{ width: `${safeScore}%` }}
            />
          </div>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className={cn('mt-0.5 h-4 w-4 flex-shrink-0', item.done ? 'text-emerald-600' : 'text-slate-300 dark:text-slate-700')} />
              <span className="min-w-0">
                <span className={cn('block', item.done ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400')}>
                  {item.label}
                </span>
                {item.detail && <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{item.detail}</span>}
              </span>
            </div>
          ))}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function StudioMobileActionBar({
  primaryLabel,
  onPrimary,
  disabled,
  loading,
  primaryIcon,
  secondary,
  className,
}: StudioMobileActionBarProps) {
  return (
    <div className={cn('fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/95', className)}>
      <div className="mx-auto flex w-full max-w-lg items-center gap-2">
        {secondary}
        <button
          type="button"
          onClick={onPrimary}
          disabled={disabled || loading}
          className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : primaryIcon}
          <span className="truncate">{primaryLabel}</span>
        </button>
      </div>
    </div>
  );
}

export const StudioAccessControl = (props: StudioAccessControlProps) => (
  <SharedAccessControl {...props} />
);

type StudioWorkspaceSelectorProps = {
  organization?: CurrentOrganization | null;
  className?: string;
};

type StudioHeaderControlsProps = {
  selector: ReactNode;
  action: ReactNode;
  organization?: CurrentOrganization | null;
  className?: string;
};

function workspaceTypeLabel(type?: CurrentOrganization['type'] | null): string {
  if (type === 'internal_agency') return 'Internal';
  if (type === 'personal_legacy') return 'Personal';
  return 'Workspace';
}

function normalizeActiveWorkspace(workspaces: WorkspaceOption[], fallback?: CurrentOrganization | null): CurrentOrganization | null {
  return workspaces.find((workspace) => workspace.isCurrent)
    || (fallback ? workspaces.find((workspace) => workspace.id === fallback.id) : null)
    || fallback
    || null;
}

export function StudioWorkspaceProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const [organization, setOrganization] = useState<CurrentOrganization | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setOrganization(null);
      setWorkspaces([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchWorkspaceOptions(session?.access_token);
      const nextWorkspaces = payload.organizations;
      const nextOrganization = normalizeActiveWorkspace(nextWorkspaces);
      setWorkspaces(nextWorkspaces);
      setOrganization(nextOrganization);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load workspaces');
      setWorkspaces([]);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchWorkspace = useCallback(async (workspace: WorkspaceOption) => {
    if (workspace.id === organization?.id || switchingId) return;

    setSwitchingId(workspace.id);
    setError(null);
    try {
      const nextWorkspace = await switchActiveOrganization(workspace.id, session?.access_token);
      const nextWorkspaces = workspaces.map((option) => ({
        ...option,
        isCurrent: option.id === nextWorkspace.id,
      }));
      const hasWorkspace = nextWorkspaces.some((option) => option.id === nextWorkspace.id);
      setWorkspaces(hasWorkspace ? nextWorkspaces : [{ ...nextWorkspace, isCurrent: true }, ...nextWorkspaces]);
      setOrganization(nextWorkspace);
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : 'Failed to switch workspace');
    } finally {
      setSwitchingId(null);
    }
  }, [organization?.id, session?.access_token, switchingId, workspaces]);

  const value = useMemo<StudioWorkspaceContextValue>(() => ({
    organization,
    organizationId: organization?.id || null,
    loading,
    workspaces,
    switchingId,
    error,
    refresh,
    switchWorkspace,
  }), [error, loading, organization, refresh, switchingId, switchWorkspace, workspaces]);

  return (
    <StudioWorkspaceContext.Provider value={value}>
      {children}
    </StudioWorkspaceContext.Provider>
  );
}

export function useStudioWorkspace() {
  const context = useContext(StudioWorkspaceContext);
  if (!context) {
    throw new Error('useStudioWorkspace must be used inside StudioWorkspaceProvider');
  }
  return context;
}

export function StudioHeaderControls({
  selector,
  action,
  className,
}: StudioHeaderControlsProps) {
  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center lg:justify-end', className)}>
      {selector}
      {action}
    </div>
  );
}

export function StudioWorkspaceSelector({
  organization,
  className,
}: StudioWorkspaceSelectorProps) {
  const context = useContext(StudioWorkspaceContext);
  const { session } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contextOrganization = context?.organization ?? null;
  const activeOrganization = organization ?? contextOrganization;
  const displayedWorkspaces = context?.workspaces ?? workspaces;
  const displayedLoading = context?.loading ?? loading;
  const displayedSwitchingId = context?.switchingId ?? switchingId;
  const displayedError = context?.error ?? error;

  const activeWorkspace = useMemo(() => {
    return normalizeActiveWorkspace(displayedWorkspaces, activeOrganization);
  }, [activeOrganization, displayedWorkspaces]);

  const isPersonalWorkspace = useMemo(() => {
    if (activeWorkspace?.type === 'personal_legacy') return true;
    return false;
  }, [activeWorkspace?.type]);

  const loadWorkspaces = useCallback(async () => {
    if (context) return;

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchWorkspaceOptions(session?.access_token);
      setWorkspaces(payload.organizations);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load workspaces');
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, [context, session?.access_token]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const handleSwitch = async (workspace: WorkspaceOption) => {
    if (workspace.id === activeWorkspace?.id || displayedSwitchingId) return;

    if (context) {
      await context.switchWorkspace(workspace);
      return;
    }

    setSwitchingId(workspace.id);
    setError(null);
    try {
      await switchActiveOrganization(workspace.id, session?.access_token);
      window.location.reload();
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : 'Failed to switch workspace');
      setSwitchingId(null);
    }
  };

  return (
    <DropdownMenu
      align="right"
      portal
      className={className}
      trigger={(
        <ActionSelectTrigger
          icon={
            displayedSwitchingId
              ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              : isPersonalWorkspace
                ? <House className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                : <Building2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          }
          label={activeWorkspace?.name || 'Current'}
          loading={displayedLoading}
          className="h-11 w-full px-3.5 sm:w-[20rem]"
        />
      )}
    >
      <DropdownMenuLabel>Workspace</DropdownMenuLabel>
      {displayedLoading && (
        <DropdownMenuItem disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading workspaces
        </DropdownMenuItem>
      )}
      {!displayedLoading && displayedWorkspaces.length === 0 && (
        <DropdownMenuItem disabled>
          {displayedError || 'No workspaces available'}
        </DropdownMenuItem>
      )}
      {!displayedLoading && displayedWorkspaces.map((workspace) => {
        const isCurrent = workspace.id === activeWorkspace?.id;
        return (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => { void handleSwitch(workspace); }}
            disabled={isCurrent || Boolean(displayedSwitchingId)}
            className="min-w-[16rem]"
          >
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
              {isCurrent ? <Check className="h-4 w-4 text-blue-600" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{workspace.name}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {workspaceTypeLabel(workspace.type)}
                {workspace.role ? ` · ${workspace.role}` : ''}
              </span>
            </span>
          </DropdownMenuItem>
        );
      })}
      {displayedError && displayedWorkspaces.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="text-red-600 dark:text-red-300">
            {displayedError}
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenu>
  );
}

type StudioPageHeaderProps = {
  eyebrow?: ReactNode;
  title: string;
  description: string;
  organization?: CurrentOrganization | null;
  status?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function StudioPageHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
  children,
  className,
}: StudioPageHeaderProps) {
  return (
    <header className={cn('mb-6 space-y-4', className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-3">
              {eyebrow}
            </div>
          )}
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950 dark:text-white">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {description}
          </p>
        </div>
        <ActionBar className="lg:justify-end">
          {status}
          {actions}
        </ActionBar>
      </div>
      {children}
    </header>
  );
}
