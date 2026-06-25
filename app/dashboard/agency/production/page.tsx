"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  UserRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type AgencyClient } from '@/lib/agency-clients';
import {
  AGENCY_PRODUCTION_TASK_PRIORITIES,
  AGENCY_PRODUCTION_TASK_STATUSES,
  type AgencyProductionTask,
  type AgencyProductionTaskPriority,
  type AgencyProductionTaskStatus,
} from '@/lib/agency-production-tasks';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';

type TaskFormState = {
  clientId: string;
  title: string;
  description: string;
  status: AgencyProductionTaskStatus;
  priority: AgencyProductionTaskPriority;
  dueDate: string;
  assignedTo: string;
};

const emptyTaskForm: TaskFormState = {
  clientId: '',
  title: 'New production task',
  description: '',
  status: 'todo',
  priority: 'normal',
  dueDate: '',
  assignedTo: '',
};

function taskToForm(task: AgencyProductionTask): TaskFormState {
  return {
    clientId: task.clientId || '',
    title: task.title,
    description: task.description || '',
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    assignedTo: task.assignedTo || '',
  };
}

function formToPayload(form: TaskFormState, organizationId?: string | null) {
  return {
    organization_id: organizationId || undefined,
    client_id: form.clientId || null,
    title: form.title,
    description: form.description,
    status: form.status,
    priority: form.priority,
    assignedTo: form.assignedTo || null,
    dueDate: form.dueDate ? `${form.dueDate}T12:00:00.000Z` : null,
    metadata: {
      managedVia: 'agency_production_queue_ui',
    },
  };
}

function formatLabel(value: string): string {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDueDate(value: string | null): string {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700 dark:text-slate-200">
      {children}
    </label>
  );
}

function TextInput({
  id,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
    />
  );
}

function TextArea({
  id,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      rows={5}
      className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
    />
  );
}

function SummaryTile({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function statusVariant(status: AgencyProductionTaskStatus) {
  if (status === 'delivered') return 'success';
  if (status === 'blocked') return 'destructive';
  if (status === 'needs_review' || status === 'ready_to_deliver') return 'warning';
  return 'secondary';
}

export default function AgencyProductionQueuePage() {
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
  } = useCurrentOrganization({ organizationType: 'internal_agency' });
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [tasks, setTasks] = useState<AgencyProductionTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [filterClientId, setFilterClientId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session?.access_token]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) || null,
    [tasks, selectedTaskId]
  );
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === form.clientId) || null,
    [clients, form.clientId]
  );
  const isInternalAgency = organization?.type === 'internal_agency';
  const canEdit = canManage && !isDemoMode;
  const activeCount = useMemo(
    () => tasks.filter((task) => !['delivered', 'archived'].includes(task.status)).length,
    [tasks]
  );
  const reviewCount = useMemo(
    () => tasks.filter((task) => task.status === 'needs_review' || task.status === 'ready_to_deliver').length,
    [tasks]
  );
  const blockedCount = useMemo(
    () => tasks.filter((task) => task.status === 'blocked').length,
    [tasks]
  );

  const loadData = useCallback(async () => {
    if (!organizationId || !isInternalAgency) {
      setClients([]);
      setTasks([]);
      setSelectedTaskId(null);
      setCanManage(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterClientId) params.set('client_id', filterClientId);
      if (filterStatus) params.set('status', filterStatus);
      const taskPath = withOrganizationId(
        params.toString() ? `/api/agency/production-tasks?${params.toString()}` : '/api/agency/production-tasks',
        organizationId
      );
      const [clientsResponse, tasksResponse] = await Promise.all([
        fetch(withOrganizationId('/api/agency/clients', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(taskPath, {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);
      const clientsPayload = await clientsResponse.json().catch(() => ({}));
      const tasksPayload = await tasksResponse.json().catch(() => ({}));

      if (!clientsResponse.ok) {
        throw new Error(clientsPayload.error || 'Failed to load agency clients');
      }
      if (!tasksResponse.ok) {
        throw new Error(tasksPayload.error || 'Failed to load production tasks');
      }

      const nextClients = Array.isArray(clientsPayload.clients)
        ? clientsPayload.clients as AgencyClient[]
        : [];
      const nextTasks = Array.isArray(tasksPayload.tasks)
        ? tasksPayload.tasks as AgencyProductionTask[]
        : [];

      setClients(nextClients);
      setTasks(nextTasks);
      setCanManage(Boolean(tasksPayload.membership?.canManageAgencyProductionTask));

      const nextSelected = nextTasks[0] || null;
      setSelectedTaskId(nextSelected?.id || null);
      setForm(nextSelected ? taskToForm(nextSelected) : {
        ...emptyTaskForm,
        clientId: filterClientId,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load production queue');
      setClients([]);
      setTasks([]);
      setSelectedTaskId(null);
      setForm(emptyTaskForm);
      setCanManage(false);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, filterClientId, filterStatus, isInternalAgency, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadData();
  }, [loadData, loadingOrganization]);

  const updateField = <K extends keyof TaskFormState>(field: K, value: TaskFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const selectTask = (task: AgencyProductionTask) => {
    setSelectedTaskId(task.id);
    setForm(taskToForm(task));
    setError(null);
    setMessage(null);
  };

  const startNewTask = () => {
    setSelectedTaskId(null);
    setForm({
      ...emptyTaskForm,
      clientId: filterClientId,
      status: (filterStatus as AgencyProductionTaskStatus) || 'todo',
    });
    setError(null);
    setMessage(null);
  };

  const saveTask = async () => {
    if (!canEdit || !organizationId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const isUpdate = Boolean(selectedTaskId);
      const response = await fetch(
        isUpdate
          ? withOrganizationId(`/api/agency/production-tasks/${selectedTaskId}`, organizationId)
          : withOrganizationId('/api/agency/production-tasks', organizationId),
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formToPayload(form, organizationId)),
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save production task');
      }

      const savedTask = payload.task as AgencyProductionTask;
      setTasks((current) => {
        if (isUpdate) {
          return current.map((task) => task.id === savedTask.id ? savedTask : task);
        }
        return [savedTask, ...current];
      });
      setSelectedTaskId(savedTask.id);
      setForm(taskToForm(savedTask));
      setCanManage(Boolean(payload.membership?.canManageAgencyProductionTask ?? canManage));
      setMessage(isUpdate ? 'Production task updated.' : 'Production task created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save production task');
    } finally {
      setSaving(false);
    }
  };

  if (loadingOrganization) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
        </div>
      </div>
    );
  }

  if (!isInternalAgency) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
          <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-slate-900 dark:text-slate-50">
              Production queue unavailable
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Production work is private to internal agency organizations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <ClipboardList className="h-3.5 w-3.5" />
              Internal Agency
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Production Queue
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Track client content work from backlog through review and delivery readiness.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organization && (
              <Badge variant="outline" className="w-fit">
                {organization.name}
              </Badge>
            )}
            {!canManage && !loading && (
              <Badge variant="secondary" className="w-fit">
                Read only
              </Badge>
            )}
            {isDemoMode && (
              <Badge variant="warning" className="w-fit">
                Demo
              </Badge>
            )}
          </div>
        </div>

        {(error || message) && (
          <div
            className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
              error
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
            }`}
          >
            {error || message}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <SummaryTile
                icon={<ClipboardList className="h-4 w-4" />}
                label="Active"
                value={`${activeCount} tasks`}
                detail="Open queue items excluding delivered and archived"
              />
              <SummaryTile
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Review"
                value={`${reviewCount} tasks`}
                detail="Needs review or ready to deliver"
              />
              <SummaryTile
                icon={<AlertCircle className="h-4 w-4" />}
                label="Blocked"
                value={`${blockedCount} blocked`}
                detail="Tasks needing operator action"
              />
            </div>

            <div className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] md:items-end">
              <div>
                <FieldLabel htmlFor="task-client-filter">Client filter</FieldLabel>
                <select
                  id="task-client-filter"
                  value={filterClientId}
                  onChange={(event) => {
                    setFilterClientId(event.target.value);
                    setMessage(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All agency clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="task-status-filter">Status filter</FieldLabel>
                <select
                  id="task-status-filter"
                  value={filterStatus}
                  onChange={(event) => {
                    setFilterStatus(event.target.value);
                    setMessage(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All statuses</option>
                  {AGENCY_PRODUCTION_TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={startNewTask}
                disabled={!canEdit}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                New Task
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Queue</CardTitle>
                  <CardDescription>
                    Internal production work for agency clients.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {tasks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                        <ClipboardList className="h-5 w-5" />
                      </div>
                      <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        No production tasks yet
                      </h2>
                      <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Create a task when source material is ready for production work.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task) => {
                        const active = task.id === selectedTaskId;
                        const client = clients.find((item) => item.id === task.clientId);
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => selectTask(task)}
                            className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                              active
                                ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{task.title}</p>
                                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                  {client?.name || 'Unassigned'} - {formatDueDate(task.dueDate)}
                                </p>
                              </div>
                              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                                <Badge variant={statusVariant(task.status)}>
                                  {formatLabel(task.status)}
                                </Badge>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{formatLabel(task.priority)}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>{selectedTask ? 'Edit task' : 'Create task'}</CardTitle>
                      <CardDescription>
                        Keep status, owner, priority, and timing visible for agency production.
                      </CardDescription>
                    </div>
                    <button
                      type="button"
                      onClick={saveTask}
                      disabled={!canEdit || saving}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {selectedTask ? 'Save Changes' : 'Create Task'}
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!canEdit && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      Production task edits require internal agency operator access.
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="task-title">Title</FieldLabel>
                      <TextInput
                        id="task-title"
                        value={form.title}
                        onChange={(value) => updateField('title', value)}
                        disabled={!canEdit}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="task-client">Client</FieldLabel>
                      <select
                        id="task-client"
                        value={form.clientId}
                        onChange={(event) => updateField('clientId', event.target.value)}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      >
                        <option value="">Unassigned task</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <FieldLabel htmlFor="task-status">Status</FieldLabel>
                      <select
                        id="task-status"
                        value={form.status}
                        onChange={(event) => updateField('status', event.target.value as AgencyProductionTaskStatus)}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      >
                        {AGENCY_PRODUCTION_TASK_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {formatLabel(status)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                      <select
                        id="task-priority"
                        value={form.priority}
                        onChange={(event) => updateField('priority', event.target.value as AgencyProductionTaskPriority)}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      >
                        {AGENCY_PRODUCTION_TASK_PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>
                            {formatLabel(priority)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <FieldLabel htmlFor="task-due-date">Due date</FieldLabel>
                      <input
                        id="task-due-date"
                        type="date"
                        value={form.dueDate}
                        onChange={(event) => updateField('dueDate', event.target.value)}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="task-assigned-to">Assigned user ID</FieldLabel>
                      <TextInput
                        id="task-assigned-to"
                        value={form.assignedTo}
                        onChange={(value) => updateField('assignedTo', value)}
                        disabled={!canEdit}
                        placeholder="Optional internal user id"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="task-description">Description</FieldLabel>
                      <TextArea
                        id="task-description"
                        value={form.description}
                        onChange={(value) => updateField('description', value)}
                        disabled={!canEdit}
                        placeholder="Brief, acceptance criteria, source notes, or next action."
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <UserRound className="h-3.5 w-3.5" />
                        Client
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {selectedClient?.name || 'Unassigned'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <ClipboardList className="h-3.5 w-3.5" />
                        Status
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {formatLabel(form.status)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Due
                      </div>
                      <p className="mt-2 truncate text-sm text-slate-700 dark:text-slate-300">
                        {form.dueDate || 'Not set'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
