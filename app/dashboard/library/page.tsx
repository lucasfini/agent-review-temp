"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Archive,
  Check,
  FileText,
  FolderOpen,
  Library,
  Loader2,
  Plus,
  Save,
  Tags,
  Trash2,
  Upload,
  History,
} from 'lucide-react';

import ConfirmModal from '@/components/ui/confirm-modal';
import { Badge } from '@/components/ui/badge';
import { ActionButton, ActionLink, ActionSelectTrigger } from '@/components/dashboard/action-controls';
import { DashboardHeaderAction, DashboardPageHeader } from '@/components/dashboard/shell';
import {
  StudioAccessControl,
} from '@/components/dashboard/studio/studio-page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth/context';
import {
  CAMPAIGN_STATUSES,
  CONTENT_LIBRARY_STATUSES,
  type Campaign,
  type ContentLibraryItem,
  type ContentLibraryStatus,
} from '@/lib/campaigns-content-library';
import type { ContentLibrary as ContentLibraryCollection } from '@/lib/content-libraries';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { emitLibraryMutation } from '@/lib/library-events';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import { cn } from '@/lib/utils';

type LibraryFormState = {
  name: string;
  description: string;
};

type StudioSaveVisibility = 'private' | 'team';

type ItemFormState = {
  title: string;
  contentType: string;
  platform: string;
  status: ContentLibraryStatus;
  libraryId: string;
  campaignId: string;
  tagsText: string;
  excerpt: string;
  body: string;
  sourceLabel: string;
  publishedAt: string;
};

type ProjectSource = {
  id: string;
  title: string;
  status?: string | null;
  created_at?: string | null;
};

type ItemVersion = {
  id: string;
  versionNumber: number;
  changeSummary: string;
  changedByName: string | null;
  changedByEmail: string | null;
  createdAt: string;
};

const emptyLibraryForm: LibraryFormState = {
  name: 'New library',
  description: '',
};

const emptyItemForm: ItemFormState = {
  title: 'New draft',
  contentType: 'note',
  platform: '',
  status: 'draft',
  libraryId: '',
  campaignId: '',
  tagsText: '',
  excerpt: '',
  body: '',
  sourceLabel: '',
  publishedAt: '',
};

const READY_STATUSES = new Set<ContentLibraryStatus>(['approved', 'published']);
const ATTENTION_STATUSES = new Set<ContentLibraryStatus>(['in_review', 'needs_revision']);

function listToText(items: string[]): string {
  return items.join('\n');
}

function textToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatLabel(value: string): string {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function libraryToForm(library: ContentLibraryCollection): LibraryFormState {
  return {
    name: library.name,
    description: library.description || '',
  };
}

function itemToForm(item: ContentLibraryItem): ItemFormState {
  return {
    title: item.title,
    contentType: item.contentType,
    platform: item.platform || '',
    status: item.status,
    libraryId: item.libraryId || '',
    campaignId: item.campaignId || '',
    tagsText: listToText(item.tags),
    excerpt: item.excerpt || '',
    body: item.body || '',
    sourceLabel: item.sourceLabel || '',
    publishedAt: item.publishedAt ? item.publishedAt.slice(0, 16) : '',
  };
}

function libraryFormToPayload(
  form: LibraryFormState,
  organizationId?: string | null,
  visibility?: StudioSaveVisibility
) {
  return {
    organization_id: organizationId || undefined,
    visibility,
    name: form.name,
    description: form.description,
  };
}

function itemFormToPayload(form: ItemFormState, organizationId?: string | null) {
  return {
    organization_id: organizationId || undefined,
    title: form.title,
    contentType: form.contentType,
    platform: form.platform,
    status: form.status,
    libraryId: form.libraryId || null,
    campaignId: form.campaignId || null,
    tags: textToList(form.tagsText),
    excerpt: form.excerpt,
    body: form.body,
    sourceLabel: form.sourceLabel,
    publishedAt: form.publishedAt || null,
  };
}

function getProjectFallbackName(projectId: string): string {
  return `Project ${projectId.slice(0, 8)}`;
}

const inputClassName =
  'mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900';

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-semibold text-slate-700 dark:text-slate-200">
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
  type = 'text',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={inputClassName}
    />
  );
}

function TextArea({
  id,
  value,
  onChange,
  disabled,
  placeholder,
  rows = 4,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      rows={rows}
      className={cn(inputClassName, 'resize-y leading-6')}
    />
  );
}

function SelectInput({
  id,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={cn(inputClassName, 'cursor-pointer')}
    >
      {children}
    </select>
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
    <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function LibrarySelector({
  libraries,
  items,
  selectedLibraryId,
  selectedLibrary,
  loading,
  onSelectLibrary,
}: {
  libraries: ContentLibraryCollection[];
  items: ContentLibraryItem[];
  selectedLibraryId: string | null;
  selectedLibrary: ContentLibraryCollection | null;
  loading?: boolean;
  onSelectLibrary: (library: ContentLibraryCollection | null) => void;
}) {
  const selectedLabel = selectedLibrary?.name || 'All saved drafts';
  const selectedScope = selectedLibrary
    ? selectedLibrary.scope === 'organization' ? 'Team' : 'Private'
    : 'All';
  const trigger = (
    <ActionSelectTrigger
      icon={<Library className="h-4 w-4" />}
      label={loading ? 'Loading collections' : selectedLabel}
      scopeLabel={selectedScope}
      loading={loading}
      className="h-11 px-3.5 sm:w-[300px]"
    />
  );

  if (loading) {
    return <div className="w-full sm:w-auto">{trigger}</div>;
  }

  return (
    <DropdownMenu
      align="right"
      portal
      className="w-full sm:w-auto"
      trigger={trigger}
    >
      <div className="w-[min(24rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>Select collection</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => onSelectLibrary(null)}
          className="items-start gap-3 px-3 py-3"
        >
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            <Library className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold text-slate-900 dark:text-slate-100">All saved drafts</span>
              {!selectedLibraryId && <Check className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-300" />}
            </span>
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              {items.length} item{items.length === 1 ? '' : 's'}
            </span>
          </span>
        </DropdownMenuItem>
        {libraries.length === 0 ? (
          <div className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
            No collections yet.
          </div>
        ) : (
          libraries.map((library) => {
            const active = library.id === selectedLibraryId;
            const count = items.filter((item) => item.libraryId === library.id).length;

            return (
              <DropdownMenuItem
                key={library.id}
                onClick={() => onSelectLibrary(library)}
                className="items-start gap-3 px-3 py-3"
              >
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  <Library className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{library.name}</span>
                    {active && <Check className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-300" />}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{library.scope === 'organization' ? 'Team' : 'Private'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{count} item{count === 1 ? '' : 's'}</span>
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </div>
    </DropdownMenu>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedLibraryId = searchParams.get('library');
  const { session, isDemoMode } = useAuth();
  const { organization, organizationId, loading: loadingOrganization } = useCurrentOrganization();
  const isPersonalWorkspace = organization?.type === 'personal_legacy';
  const [libraries, setLibraries] = useState<ContentLibraryCollection[]>([]);
  const [items, setItems] = useState<ContentLibraryItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [projects, setProjects] = useState<ProjectSource[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [libraryForm, setLibraryForm] = useState<LibraryFormState>(emptyLibraryForm);
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm);
  const [canManage, setCanManage] = useState(false);
  const [membershipRole, setMembershipRole] = useState<'owner' | 'admin' | 'editor' | 'reader' | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [deletingLibrary, setDeletingLibrary] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [sharingLibrary, setSharingLibrary] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'library' | 'item' | null>(null);
  const [collectionSheetOpen, setCollectionSheetOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [itemVersions, setItemVersions] = useState<ItemVersion[]>([]);
  const [loadingItemVersions, setLoadingItemVersions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedLibrary = useMemo(
    () => libraries.find((library) => library.id === selectedLibraryId) || null,
    [libraries, selectedLibraryId]
  );
  const filteredItems = useMemo(
    () => selectedLibraryId
      ? items.filter((item) => item.libraryId === selectedLibraryId)
      : items,
    [items, selectedLibraryId]
  );
  const visibleItems = useMemo(() => {
    return filteredItems.filter((item) => {
      const matchesStatus = statusFilter === 'all'
        ? true
        : statusFilter === 'unfiled'
          ? !item.libraryId
          : statusFilter === 'ready'
            ? READY_STATUSES.has(item.status)
            : statusFilter === 'needs_attention'
              ? ATTENTION_STATUSES.has(item.status)
              : item.status === statusFilter;
      if (!matchesStatus) return false;

      const query = itemSearch.trim().toLowerCase();
      if (!query) return true;
      return [
        item.title,
        item.contentType,
        item.platform || '',
        item.sourceLabel || '',
        item.excerpt || '',
        item.body || '',
        ...item.tags,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [filteredItems, itemSearch, statusFilter]);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || null,
    [items, selectedItemId]
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );
  const selectedSourceProject = selectedItem?.projectId
    ? projectById.get(selectedItem.projectId) || null
    : null;
  const canEdit = canManage && !isDemoMode;
  const selectedLibraryCanEdit = Boolean(selectedLibrary?.canEdit) && !isDemoMode;
  const selectedItemCanEdit = Boolean(selectedItem?.canEdit) && !isDemoMode;
  const selectedItemCanDelete = Boolean(selectedItem?.canDelete) && !isDemoMode;
  const canShareSelectedLibrary = !isDemoMode && Boolean(selectedLibrary?.canShare) && !isPersonalWorkspace;
  const canUnshareSelectedLibrary = !isDemoMode && Boolean(selectedLibrary?.canUnshare);
  const libraryShareUnavailableMessage = isPersonalWorkspace ? 'Switch to a team workspace first.' : null;
  const canSaveNewLibraryPrivately = !selectedLibraryId && !isPersonalWorkspace;
  const unfiledCount = useMemo(() => items.filter((item) => !item.libraryId).length, [items]);
  const approvedCount = useMemo(
    () => items.filter((item) => READY_STATUSES.has(item.status)).length,
    [items]
  );
  const quickFilters = useMemo(() => [
    {
      value: 'all',
      label: 'All saved',
      count: filteredItems.length,
    },
    {
      value: 'unfiled',
      label: 'Unfiled',
      count: filteredItems.filter((item) => !item.libraryId).length,
    },
    {
      value: 'ready',
      label: 'Ready',
      count: filteredItems.filter((item) => READY_STATUSES.has(item.status)).length,
    },
    {
      value: 'needs_attention',
      label: 'Needs review',
      count: filteredItems.filter((item) => ATTENTION_STATUSES.has(item.status)).length,
    },
  ], [filteredItems]);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, [session?.access_token]);

  const loadLibrary = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [librariesResponse, itemsResponse, campaignsResponse, projectsResponse] = await Promise.all([
        fetch(withOrganizationId('/api/content-libraries', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/content-library?limit=200', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/campaigns', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/dashboard/projects?limit=200', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);
      const [librariesPayload, itemsPayload, campaignsPayload, projectsPayload] = await Promise.all([
        librariesResponse.json().catch(() => ({})),
        itemsResponse.json().catch(() => ({})),
        campaignsResponse.json().catch(() => ({})),
        projectsResponse.json().catch(() => ({})),
      ]);

      if (!librariesResponse.ok) throw new Error(librariesPayload.error || 'Failed to load libraries');
      if (!itemsResponse.ok) throw new Error(itemsPayload.error || 'Failed to load saved content');
      if (!campaignsResponse.ok) throw new Error(campaignsPayload.error || 'Failed to load plans');

      const nextLibraries = Array.isArray(librariesPayload.contentLibraries)
        ? librariesPayload.contentLibraries as ContentLibraryCollection[]
        : [];
      const nextItems = Array.isArray(itemsPayload.contentItems)
        ? itemsPayload.contentItems as ContentLibraryItem[]
        : [];
      const nextCampaigns = Array.isArray(campaignsPayload.campaigns)
        ? campaignsPayload.campaigns as Campaign[]
        : [];
      const nextProjects = projectsResponse.ok && Array.isArray(projectsPayload.projects)
        ? projectsPayload.projects as ProjectSource[]
        : [];

      setLibraries(nextLibraries);
      setItems(nextItems);
      setCampaigns(nextCampaigns);
      setProjects(nextProjects);
      setCanManage(Boolean(
        librariesPayload.membership?.canManageContentLibraries
        || itemsPayload.membership?.canManageCampaignLibrary
      ));
      const nextRole = itemsPayload.membership?.role || librariesPayload.membership?.role;
      setMembershipRole(nextRole === 'owner' || nextRole === 'admin' || nextRole === 'editor' || nextRole === 'reader'
        ? nextRole
        : null
      );

      const requestedLibrary = nextLibraries.find((library) => library.id === requestedLibraryId) || null;
      const nextSelectedLibrary = requestedLibrary || null;
      const nextFilteredItems = nextSelectedLibrary
        ? nextItems.filter((item) => item.libraryId === nextSelectedLibrary.id)
        : nextItems;
      const nextItem = nextFilteredItems[0] || null;
      setSelectedLibraryId(nextSelectedLibrary?.id || null);
      setLibraryForm(nextSelectedLibrary ? libraryToForm(nextSelectedLibrary) : emptyLibraryForm);
      setSelectedItemId(nextItem?.id || null);
      setItemForm(nextItem ? itemToForm(nextItem) : {
        ...emptyItemForm,
        libraryId: nextSelectedLibrary?.id || '',
      });
    } catch (loadError) {
      setLibraries([]);
      setItems([]);
      setCampaigns([]);
      setProjects([]);
      setSelectedLibraryId(null);
      setSelectedItemId(null);
      setMembershipRole(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Library');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, organizationId, requestedLibraryId]);

  useEffect(() => {
    const loadVersions = async () => {
      if (!organizationId || !selectedItemId || !session?.access_token || !selectedItem) {
        setItemVersions([]);
        setLoadingItemVersions(false);
        return;
      }

      if (!selectedItem.canEdit && membershipRole !== 'owner' && membershipRole !== 'admin') {
        setItemVersions([]);
        setLoadingItemVersions(false);
        return;
      }

      setLoadingItemVersions(true);
      try {
        const response = await fetch(
          withOrganizationId(`/api/content-library/${selectedItemId}/versions?limit=20`, organizationId),
          {
            headers: authHeaders,
            cache: 'no-store',
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load version history');
        }
        setItemVersions(Array.isArray(payload.versions) ? payload.versions : []);
      } catch (versionError) {
        setItemVersions([]);
        setError(versionError instanceof Error ? versionError.message : 'Failed to load version history');
      } finally {
        setLoadingItemVersions(false);
      }
    };

    void loadVersions();
  }, [authHeaders, membershipRole, organizationId, selectedItem, selectedItemId, session?.access_token]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadLibrary();
  }, [loadLibrary, loadingOrganization]);

  const setLibraryRoute = (libraryId: string | null) => {
    router.push(libraryId ? `/dashboard/library?library=${libraryId}` : '/dashboard/library');
  };

  const selectLibrary = (library: ContentLibraryCollection | null) => {
    setSelectedLibraryId(library?.id || null);
    setLibraryForm(library ? libraryToForm(library) : emptyLibraryForm);
    setStatusFilter('all');
    const nextItems = library ? items.filter((item) => item.libraryId === library.id) : items;
    const nextItem = nextItems[0] || null;
    setSelectedItemId(nextItem?.id || null);
    setItemForm(nextItem ? itemToForm(nextItem) : { ...emptyItemForm, libraryId: library?.id || '' });
    setLibraryRoute(library?.id || null);
    setError(null);
    setMessage(null);
  };

  const selectItem = (item: ContentLibraryItem) => {
    setSelectedItemId(item.id);
    setItemForm(itemToForm(item));
    setError(null);
    setMessage(null);
  };

  const startNewLibrary = () => {
    setSelectedLibraryId(null);
    setLibraryForm(emptyLibraryForm);
    setLibraryRoute(null);
    setCollectionSheetOpen(true);
    setError(null);
    setMessage(null);
  };

  const openCollectionSettings = () => {
    if (!selectedLibrary) return;
    setLibraryForm(libraryToForm(selectedLibrary));
    setCollectionSheetOpen(true);
    setError(null);
    setMessage(null);
  };

  const startNewItem = () => {
    setSelectedItemId(null);
    setItemForm({
      ...emptyItemForm,
      libraryId: selectedLibraryId || '',
    });
    setError(null);
    setMessage(null);
  };

  const updateLibraryField = <K extends keyof LibraryFormState>(field: K, value: LibraryFormState[K]) => {
    setLibraryForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const updateItemField = <K extends keyof ItemFormState>(field: K, value: ItemFormState[K]) => {
    setItemForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const saveLibrary = async (visibility?: StudioSaveVisibility) => {
    if ((!selectedLibraryId && !canEdit) || (selectedLibraryId && !selectedLibraryCanEdit) || !organizationId) return;
    setSavingLibrary(true);
    setError(null);
    setMessage(null);

    try {
      const isUpdate = Boolean(selectedLibraryId);
      const response = await fetch(
        isUpdate
          ? withOrganizationId(`/api/content-libraries/${selectedLibraryId}`, organizationId)
          : withOrganizationId('/api/content-libraries', organizationId),
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(libraryFormToPayload(libraryForm, organizationId, isUpdate ? undefined : visibility)),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save library');

      const savedLibrary = payload.contentLibrary as ContentLibraryCollection;
      setLibraries((current) => (
        isUpdate
          ? current.map((library) => library.id === savedLibrary.id ? savedLibrary : library)
          : [savedLibrary, ...current]
      ));
      setSelectedLibraryId(savedLibrary.id);
      setLibraryForm(libraryToForm(savedLibrary));
      setLibraryRoute(savedLibrary.id);
      setCollectionSheetOpen(false);
      setMessage(isUpdate
        ? 'Library updated.'
        : savedLibrary.scope === 'organization'
          ? 'Team collection created.'
          : 'Private collection created.');
      emitLibraryMutation({ libraryId: savedLibrary.id, action: isUpdate ? 'updated' : 'created' });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save library');
    } finally {
      setSavingLibrary(false);
    }
  };

  const shareLibrary = async () => {
    if (!canEdit || !organizationId || !selectedLibraryId || !selectedLibrary?.canShare) return;
    if (isPersonalWorkspace) {
      setError('Switch to a team workspace before publishing this collection.');
      return;
    }
    setSharingLibrary(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/content-libraries/${selectedLibraryId}/share`, organizationId), {
        method: 'POST',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to publish collection');

      const sharedLibrary = payload.contentLibrary as ContentLibraryCollection;
      setLibraries((current) => {
        const withoutDuplicate = current.filter((library) => library.id !== sharedLibrary.id);
        return [sharedLibrary, ...withoutDuplicate];
      });
      setSelectedLibraryId(sharedLibrary.id);
      setLibraryForm(libraryToForm(sharedLibrary));
      setLibraryRoute(sharedLibrary.id);
      const nextItems = items.filter((item) => item.libraryId === sharedLibrary.id);
      const nextItem = nextItems[0] || null;
      setSelectedItemId(nextItem?.id || null);
      setItemForm(nextItem ? itemToForm(nextItem) : { ...emptyItemForm, libraryId: sharedLibrary.id });
      setMessage('Collection published to your team.');
      emitLibraryMutation({ libraryId: sharedLibrary.id, action: 'shared' });
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to publish collection');
    } finally {
      setSharingLibrary(false);
    }
  };

  const unshareLibrary = async () => {
    if (!canEdit || !organizationId || !selectedLibraryId || !selectedLibrary?.canUnshare) return;
    setSharingLibrary(true);
    setError(null);
    setMessage(null);
    const sourceLibraryId = selectedLibrary.sharedFromLibraryId;
    const sourceLibrary = sourceLibraryId
      ? libraries.find((library) => library.id === sourceLibraryId) || null
      : null;

    try {
      const response = await fetch(withOrganizationId(`/api/content-libraries/${selectedLibraryId}/share`, organizationId), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to move collection to private');

      const unsharedLibraryId = selectedLibraryId;
      const privateLibrary = payload.contentLibrary as ContentLibraryCollection | null | undefined;
      const remainingLibraries = libraries.filter((library) => library.id !== unsharedLibraryId);
      const nextLibraries = privateLibrary ? [privateLibrary, ...remainingLibraries] : remainingLibraries;
      setLibraries(nextLibraries);
      setItems((current) => current.map((item) => (
        item.libraryId === unsharedLibraryId ? { ...item, libraryId: null } : item
      )));
      if (privateLibrary) {
        setSelectedLibraryId(privateLibrary.id);
        setLibraryForm(libraryToForm(privateLibrary));
        setLibraryRoute(privateLibrary.id);
        setSelectedItemId(null);
        setItemForm({ ...emptyItemForm, libraryId: privateLibrary.id });
      } else if (sourceLibrary) {
        setSelectedLibraryId(sourceLibrary.id);
        setLibraryForm(libraryToForm(sourceLibrary));
        setLibraryRoute(sourceLibrary.id);
        const nextItems = items.filter((item) => item.libraryId === sourceLibrary.id);
        const nextItem = nextItems[0] || null;
        setSelectedItemId(nextItem?.id || null);
        setItemForm(nextItem ? itemToForm(nextItem) : { ...emptyItemForm, libraryId: sourceLibrary.id });
      } else {
        setSelectedLibraryId(null);
        setLibraryForm(emptyLibraryForm);
        setLibraryRoute(null);
      }
      setCollectionSheetOpen(false);
      setMessage('Collection moved to private.');
      emitLibraryMutation({ libraryId: unsharedLibraryId, action: 'unshared' });
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to move collection to private');
    } finally {
      setSharingLibrary(false);
    }
  };

  const saveItem = async () => {
    if ((!selectedItemId && !canEdit) || (selectedItemId && !selectedItemCanEdit) || !organizationId) return;
    setSavingItem(true);
    setError(null);
    setMessage(null);

    try {
      const isUpdate = Boolean(selectedItemId);
      const response = await fetch(
        isUpdate
          ? withOrganizationId(`/api/content-library/${selectedItemId}`, organizationId)
          : withOrganizationId('/api/content-library', organizationId),
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(itemFormToPayload(itemForm, organizationId)),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save draft');

      const savedItem = payload.contentItem as ContentLibraryItem;
      setItems((current) => (
        isUpdate
          ? current.map((item) => item.id === savedItem.id ? savedItem : item)
          : [savedItem, ...current]
      ));
      setSelectedItemId(savedItem.id);
      setItemForm(itemToForm(savedItem));
      setMessage(isUpdate ? 'Draft updated.' : 'Draft created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save draft');
    } finally {
      setSavingItem(false);
    }
  };

  const deleteLibrary = async () => {
    if ((!selectedLibraryId && !canEdit) || !organizationId || !selectedLibraryId || !selectedLibraryCanEdit) return;
    setDeletingLibrary(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/content-libraries/${selectedLibraryId}`, organizationId), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to delete library');

      const deletedId = selectedLibraryId;
      setLibraries((current) => current.filter((library) => library.id !== deletedId));
      setItems((current) => current.map((item) => (
        item.libraryId === deletedId ? { ...item, libraryId: null } : item
      )));
      setSelectedLibraryId(null);
      setLibraryForm(emptyLibraryForm);
      setLibraryRoute(null);
      setCollectionSheetOpen(false);
      setMessage('Library deleted. Its saved drafts are now unfiled.');
      emitLibraryMutation({ libraryId: deletedId, action: 'deleted' });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete library');
    } finally {
      setDeletingLibrary(false);
      setDeleteTarget(null);
    }
  };

  const deleteItem = async () => {
    if (!selectedItemCanDelete || !organizationId || !selectedItemId) return;
    setDeletingItem(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/content-library/${selectedItemId}`, organizationId), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to delete draft');

      const remaining = items.filter((item) => item.id !== selectedItemId);
      const nextFiltered = selectedLibraryId
        ? remaining.filter((item) => item.libraryId === selectedLibraryId)
        : remaining;
      const nextItem = nextFiltered[0] || null;
      setItems(remaining);
      setSelectedItemId(nextItem?.id || null);
      setItemForm(nextItem ? itemToForm(nextItem) : { ...emptyItemForm, libraryId: selectedLibraryId || '' });
      setMessage('Draft deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete draft');
    } finally {
      setDeletingItem(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <DashboardPageHeader
          density="compact"
          icon={Library}
          title="Library"
          description="Browse saved outputs, collections, and reusable content assets."
          actions={(
            <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <LibrarySelector
                libraries={libraries}
                items={items}
                selectedLibraryId={selectedLibraryId}
                selectedLibrary={selectedLibrary}
                loading={loading || loadingOrganization}
                onSelectLibrary={selectLibrary}
              />
              <DashboardHeaderAction
                type="button"
                onClick={startNewLibrary}
                disabled={!canEdit || loading || loadingOrganization}
                icon={Plus}
                variant="primary"
                className="h-11 px-4"
              >
                New Collection
              </DashboardHeaderAction>
            </div>
          )}
        />
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="Library filters">
              {quickFilters.map((filter) => {
                const active = statusFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20',
                      active
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                    )}
                  >
                    <span>{filter.label}</span>
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-xs',
                        active
                          ? 'bg-white/15 text-white'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                      )}
                    >
                      {filter.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <ActionButton
                type="button"
                onClick={startNewItem}
                disabled={!canEdit || loading || loadingOrganization}
                variant="primary"
              >
                <Plus className="h-4 w-4" />
                New draft
              </ActionButton>
              {!canManage && !loading && <Badge variant="secondary">Read only</Badge>}
              {isDemoMode && <Badge variant="warning">Demo</Badge>}
            </div>
          </div>
        </div>

        {(error || message) && (
          <div
            className={cn(
              'mb-5 rounded-md border px-4 py-3 text-sm shadow-sm',
              error
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
            )}
          >
            {error || message}
          </div>
        )}

        {loading || loadingOrganization ? (
          <div className="mx-auto w-full max-w-6xl">
            <div className="h-[42rem] animate-pulse rounded-md bg-slate-100 dark:bg-slate-900" />
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <SummaryTile
                icon={<Library className="h-4 w-4" />}
                label="Collections"
                value={`${libraries.length}`}
                detail={`${unfiledCount} unfiled saved draft${unfiledCount === 1 ? '' : 's'}`}
              />
              <SummaryTile
                icon={<FileText className="h-4 w-4" />}
                label="Saved Drafts"
                value={`${items.length}`}
                detail={`${visibleItems.length} shown in this view`}
              />
              <SummaryTile
                icon={<Archive className="h-4 w-4" />}
                label="Ready"
                value={`${approvedCount}`}
                detail="Approved or published saved drafts"
              />
            </div>

            <div className="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)] xl:items-start">
                <Card className="overflow-hidden">
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <CardTitle>{selectedLibrary ? selectedLibrary.name : 'All saved drafts'}</CardTitle>
                        <CardDescription>
                          Generated content saves here when a content piece uses Save to Library.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
                      <TextInput
                        id="library-item-search"
                        value={itemSearch}
                        onChange={setItemSearch}
                        placeholder="Search saved drafts"
                      />
                      <SelectInput
                        id="library-item-status-filter"
                        value={statusFilter}
                        onChange={setStatusFilter}
                      >
                        <option value="all">All statuses</option>
                        <option value="unfiled">Unfiled only</option>
                        <option value="ready">Ready</option>
                        <option value="needs_attention">Needs review</option>
                        {CONTENT_LIBRARY_STATUSES.map((status) => (
                          <option key={status} value={status}>{formatLabel(status)}</option>
                        ))}
                      </SelectInput>
                    </div>
                    {visibleItems.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center dark:border-slate-700">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                          <FileText className="h-5 w-5" />
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          No saved drafts here yet
                        </h3>
                        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
                          Pick this Library in content settings before generating, or create a draft manually.
                        </p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                          <ActionButton
                            type="button"
                            onClick={startNewItem}
                            disabled={!canEdit}
                            variant="primary"
                          >
                            <Plus className="h-4 w-4" />
                            Create Draft
                          </ActionButton>
                          <ActionLink
                            href="/dashboard/upload"
                            variant="secondary"
                          >
                            <Upload className="h-4 w-4" />
                            Upload Source
                          </ActionLink>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-1">
                        {visibleItems.map((item) => {
                          const active = item.id === selectedItemId;
                          const campaign = campaigns.find((entry) => entry.id === item.campaignId);
                          const library = libraries.find((entry) => entry.id === item.libraryId);
                          const sourceProject = item.projectId ? projectById.get(item.projectId) || null : null;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => selectItem(item)}
                              className={`rounded-md border px-3 py-3 text-left transition-colors ${
                                active
                                  ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-100'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <FileText className={`mt-0.5 h-4 w-4 flex-shrink-0 ${active ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400'}`} />
                                <div className="min-w-0 flex-1">
                                  <p className="line-clamp-2 text-sm font-semibold">{item.title}</p>
                                  <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                                    {formatLabel(item.contentType)}
                                    {item.platform ? ` · ${item.platform}` : ''}
                                    {campaign ? ` · ${campaign.name}` : ''}
                                    {library ? ` · ${library.name}` : ' · Unfiled'}
                                    {item.projectId ? ` · ${sourceProject?.title || getProjectFallbackName(item.projectId)}` : ''}
                                  </p>
                                  {item.locked && (
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                      <Badge variant="warning">Locked</Badge>
                                    </div>
                                  )}
                                </div>
                                <Badge variant={item.status === 'approved' || item.status === 'published' ? 'success' : 'secondary'} className="flex-shrink-0">
                                  {formatLabel(item.status)}
                                </Badge>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                  <div className="flex flex-col gap-3 border-t border-slate-100 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <StudioAccessControl
                        entityLabel="collection"
                        scope={selectedLibrary?.scope ?? null}
                        canShare={canShareSelectedLibrary}
                        canUnshare={canUnshareSelectedLibrary}
                        loading={sharingLibrary}
                        onShare={() => { void shareLibrary(); }}
                        onUnshare={() => { void unshareLibrary(); }}
                        shareUnavailableMessage={selectedLibrary?.canShare ? libraryShareUnavailableMessage : null}
                        show={Boolean(selectedLibrary) && !isPersonalWorkspace}
                        className="w-full sm:w-60"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {selectedLibrary && (
                        <ActionButton
                          type="button"
                          onClick={openCollectionSettings}
                          variant="secondary"
                        >
                          <Library className="h-4 w-4" />
                          Collection settings
                        </ActionButton>
                      )}
                      <ActionButton
                        type="button"
                        onClick={startNewItem}
                        disabled={!canEdit}
                        variant="secondary"
                        aria-label="Create saved draft"
                        title="Create saved draft"
                      >
                        <Plus className="h-4 w-4" />
                        Create draft
                      </ActionButton>
                    </div>
                  </div>
                </Card>

                <Card className="overflow-hidden xl:sticky xl:top-6">
                  <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle>{selectedItem ? 'Edit saved draft' : 'Create saved draft'}</CardTitle>
                        <CardDescription>
                          Saved drafts can belong to a Library, Plan, source project, or all three.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!canEdit && (
                      <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                        {membershipRole === 'reader'
                          ? 'You can view shared Library items, but readers cannot create, edit, approve, or delete drafts.'
                          : 'You can view Library items, but this selected draft or collection is not editable in your current role.'}
                      </div>
                    )}

                    {selectedItem?.projectId && (
                      <div className="mb-5 rounded-md border border-blue-100 bg-blue-50/70 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/20">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <FolderOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-300" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                                Source project
                              </p>
                              <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {selectedSourceProject?.title || getProjectFallbackName(selectedItem.projectId)}
                              </p>
                              {selectedItem.sourceLabel && (
                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                  {selectedItem.sourceLabel}
                                </p>
                              )}
                            </div>
                          </div>
                          <ActionLink
                            href={`/dashboard/projects?id=${encodeURIComponent(selectedItem.projectId)}`}
                            variant="secondary"
                          >
                            Open project
                          </ActionLink>
                        </div>
                      </div>
                    )}

                    {selectedItem && (
                      <div className="mb-5 flex flex-wrap gap-2">
                        <Badge variant="secondary">{formatLabel(selectedItem.status)}</Badge>
                        {selectedItem.locked && <Badge variant="warning">Locked</Badge>}
                        {!selectedItem.libraryId && <Badge variant="outline">Unfiled</Badge>}
                      </div>
                    )}

                    <div className="grid gap-5">
                      <div>
                        <FieldLabel htmlFor="item-title">Title</FieldLabel>
                        <TextInput
                          id="item-title"
                          value={itemForm.title}
                          onChange={(value) => updateItemField('title', value)}
                          disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <FieldLabel htmlFor="item-type">Type</FieldLabel>
                          <TextInput
                            id="item-type"
                            value={itemForm.contentType}
                            onChange={(value) => updateItemField('contentType', value)}
                            disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                            placeholder="linkedin_post"
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor="item-platform">Platform</FieldLabel>
                          <TextInput
                            id="item-platform"
                            value={itemForm.platform}
                            onChange={(value) => updateItemField('platform', value)}
                            disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                            placeholder="LinkedIn"
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor="item-status">Status</FieldLabel>
                          <SelectInput
                            id="item-status"
                            value={itemForm.status}
                            onChange={(value) => updateItemField('status', value as ContentLibraryStatus)}
                            disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                          >
                            {CONTENT_LIBRARY_STATUSES.map((status) => (
                              <option key={status} value={status}>{formatLabel(status)}</option>
                            ))}
                          </SelectInput>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <FieldLabel htmlFor="item-library">Library</FieldLabel>
                          <SelectInput
                            id="item-library"
                            value={itemForm.libraryId}
                            onChange={(value) => updateItemField('libraryId', value)}
                            disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                          >
                            <option value="">No library</option>
                            {libraries.map((library) => (
                              <option key={library.id} value={library.id}>{library.name}</option>
                            ))}
                          </SelectInput>
                        </div>
                        <div>
                          <FieldLabel htmlFor="item-plan">Plan</FieldLabel>
                          <SelectInput
                            id="item-plan"
                            value={itemForm.campaignId}
                            onChange={(value) => updateItemField('campaignId', value)}
                            disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                          >
                            <option value="">No plan</option>
                            {campaigns
                              .filter((campaign) => CAMPAIGN_STATUSES.includes(campaign.status))
                              .map((campaign) => (
                                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                              ))}
                          </SelectInput>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <FieldLabel htmlFor="item-source">Source label</FieldLabel>
                          <TextInput
                            id="item-source"
                            value={itemForm.sourceLabel}
                            onChange={(value) => updateItemField('sourceLabel', value)}
                            disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                            placeholder="AI generation, webinar, customer call"
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor="item-published">Published at</FieldLabel>
                          <TextInput
                            id="item-published"
                            type="datetime-local"
                            value={itemForm.publishedAt}
                            onChange={(value) => updateItemField('publishedAt', value)}
                            disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <Tags className="h-4 w-4 text-slate-400" />
                          <FieldLabel htmlFor="item-tags">Tags</FieldLabel>
                        </div>
                          <TextArea
                            id="item-tags"
                            value={itemForm.tagsText}
                            onChange={(value) => updateItemField('tagsText', value)}
                            disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                            placeholder={'One per line\nLaunch\nFounder POV\nCustomer proof'}
                            rows={3}
                          />
                      </div>

                      <div>
                        <FieldLabel htmlFor="item-excerpt">Excerpt</FieldLabel>
                        <TextArea
                          id="item-excerpt"
                          value={itemForm.excerpt}
                          onChange={(value) => updateItemField('excerpt', value)}
                          disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                          rows={3}
                        />
                      </div>

                      <div>
                        <FieldLabel htmlFor="item-body">Body</FieldLabel>
                        <TextArea
                          id="item-body"
                          value={itemForm.body}
                          onChange={(value) => updateItemField('body', value)}
                          disabled={selectedItemId ? !selectedItemCanEdit : !canEdit}
                          rows={8}
                        />
                      </div>

                      {selectedItem?.generationContextSnapshot && Object.keys(selectedItem.generationContextSnapshot).length > 0 && (
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                          <div className="mb-3 flex items-center gap-2">
                            <Library className="h-4 w-4 text-slate-400" />
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Generation context</h3>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Profile</p>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                                {String(selectedItem.generationContextSnapshot.profile_name || selectedItem.generationContextSnapshot.creatorProfileName || 'Not captured')}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Voice</p>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                                {String(selectedItem.generationContextSnapshot.voice_name || selectedItem.generationContextSnapshot.brandVoiceName || 'Not captured')}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Plan</p>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                                {String(selectedItem.generationContextSnapshot.plan_name || selectedItem.generationContextSnapshot.campaignName || 'Not captured')}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Generated</p>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                                {String(selectedItem.generationContextSnapshot.generated_at || selectedItem.generationContextSnapshot.generatedAt || 'Not captured')}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedItem && (
                        <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
                          <div className="mb-3 flex items-center gap-2">
                            <History className="h-4 w-4 text-slate-400" />
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Version history</h3>
                          </div>
                          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                            Version restore is not available yet.
                          </p>
                          {loadingItemVersions ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">Loading versions...</p>
                          ) : itemVersions.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No saved versions yet.</p>
                          ) : (
                            <div className="space-y-3">
                              {itemVersions.map((version) => (
                                <div key={version.id} className="rounded-md border border-slate-200 px-3 py-3 dark:border-slate-800">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                      Version {version.versionNumber}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{version.createdAt}</p>
                                  </div>
                                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{version.changeSummary}</p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {version.changedByName || version.changedByEmail || 'System'}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <div className="flex flex-col gap-3 border-t border-slate-100 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedItem && (
                        <ActionButton
                          type="button"
                          onClick={() => setDeleteTarget('item')}
                          disabled={!selectedItemCanDelete || deletingItem}
                          variant="danger"
                        >
                          {deletingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </ActionButton>
                      )}
                      <ActionButton
                        type="button"
                        onClick={saveItem}
                        disabled={(selectedItem ? !selectedItemCanEdit : !canEdit) || savingItem || !itemForm.title.trim()}
                        variant="primary"
                      >
                        {savingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {selectedItem ? 'Save draft' : 'Create draft'}
                      </ActionButton>
                    </div>
                  </div>
                </Card>
            </div>
          </>
        )}
      </div>

      <Sheet open={collectionSheetOpen} onOpenChange={setCollectionSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="pr-8">
            <SheetTitle>{selectedLibrary ? 'Collection settings' : 'New collection'}</SheetTitle>
            <SheetDescription>
              {selectedLibrary
                ? 'Update this collection and manage who can use it. Drafts stay on the main Library page.'
                : 'Create a collection for related saved drafts. You can choose it from the Library selector after saving.'}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 grid gap-5">
            <div>
              <FieldLabel htmlFor="library-name">Collection name</FieldLabel>
              <TextInput
                id="library-name"
                value={libraryForm.name}
                onChange={(value) => updateLibraryField('name', value)}
                disabled={selectedLibrary ? !selectedLibraryCanEdit : !canEdit}
              />
            </div>

            <div>
              <FieldLabel htmlFor="library-description">Description</FieldLabel>
              <TextArea
                id="library-description"
                value={libraryForm.description}
                onChange={(value) => updateLibraryField('description', value)}
                disabled={selectedLibrary ? !selectedLibraryCanEdit : !canEdit}
                placeholder="Optional notes about what belongs in this collection"
                rows={4}
              />
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div>
                {selectedLibrary && (
                  <ActionButton
                    type="button"
                    onClick={() => setDeleteTarget('library')}
                    disabled={!selectedLibraryCanEdit || deletingLibrary}
                    variant="danger"
                  >
                    {deletingLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete collection
                  </ActionButton>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setCollectionSheetOpen(false)}
                >
                  Cancel
                </ActionButton>
                <ActionButton
                  type="button"
                  onClick={() => { void saveLibrary('private'); }}
                  disabled={!canSaveNewLibraryPrivately || !canEdit || savingLibrary || !libraryForm.name.trim()}
                  variant="secondary"
                  className={canSaveNewLibraryPrivately ? undefined : 'hidden'}
                >
                  {savingLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save privately
                </ActionButton>
                <ActionButton
                  type="button"
                  onClick={() => { void saveLibrary(); }}
                  disabled={(selectedLibrary ? !selectedLibraryCanEdit : !canEdit) || savingLibrary || !libraryForm.name.trim()}
                  variant="primary"
                >
                  {savingLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {selectedLibrary ? 'Save collection' : isPersonalWorkspace ? 'Create collection' : 'Create team collection'}
                </ActionButton>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmModal
        isOpen={deleteTarget === 'library'}
        title="Delete library?"
        description="Saved drafts in this collection will remain available, but they will become unfiled."
        confirmText="Delete library"
        cancelText="Cancel"
        isDestructive
        onConfirm={deleteLibrary}
        onClose={() => setDeleteTarget(null)}
      />
      <ConfirmModal
        isOpen={deleteTarget === 'item'}
        title="Delete saved draft?"
        description="This removes the saved Library item. It does not delete the original project."
        confirmText="Delete draft"
        cancelText="Cancel"
        isDestructive
        onConfirm={deleteItem}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
