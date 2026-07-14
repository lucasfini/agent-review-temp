"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Ban,
  Check,
  Copy,
  FileText,
  Globe2,
  Loader2,
  Lock,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  X,
} from 'lucide-react';

import ConfirmModal from '@/components/ui/confirm-modal';
import {
  StudioAccessControl,
  StudioHeaderControls,
  StudioMobileActionBar,
  useStudioWorkspace,
} from '@/components/dashboard/studio/studio-page-header';
import {
  ActionButton,
  ActionSelectTrigger,
} from '@/components/dashboard/action-controls';
import { DashboardPageHeader } from '@/components/dashboard/shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth/context';
import type { BrandVoice } from '@/lib/brand-voices';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import {
  addVoiceListItem,
  normalizeVoiceList,
  parseToneChips,
  removeVoiceListItem,
  serializeToneChips,
  updateVoiceListItem,
  type StudioVoiceDraft,
} from '@/lib/studio-voice-helpers';
import { cn } from '@/lib/utils';

type FormState = StudioVoiceDraft;
type StudioSaveVisibility = 'private' | 'team';

const emptyForm: FormState = {
  name: 'Default voice',
  description: '',
  toneChips: [],
  audience: '',
  contentPillars: [],
  writingExamples: [],
  bannedPhrases: [],
  ctaPreferences: '',
};

const inputClassName =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900';

function voiceToForm(voice: BrandVoice): FormState {
  return {
    name: voice.name,
    description: voice.description || '',
    toneChips: parseToneChips(voice.tone),
    audience: voice.audience || '',
    contentPillars: normalizeVoiceList(voice.contentPillars),
    writingExamples: normalizeVoiceList(voice.writingExamples),
    bannedPhrases: normalizeVoiceList(voice.bannedPhrases),
    ctaPreferences: voice.ctaPreferences || '',
  };
}

function formToPayload(
  form: FormState,
  organizationId?: string | null,
  visibility?: StudioSaveVisibility
) {
  return {
    organization_id: organizationId || undefined,
    visibility,
    name: form.name,
    description: form.description,
    tone: serializeToneChips(form.toneChips),
    audience: form.audience,
    contentPillars: normalizeVoiceList(form.contentPillars),
    writingExamples: normalizeVoiceList(form.writingExamples),
    bannedPhrases: normalizeVoiceList(form.bannedPhrases),
    ctaPreferences: form.ctaPreferences,
  };
}

function formatUpdatedDate(value?: string | null): string {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved yet';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function scopeLabel(voice?: BrandVoice | null): string {
  return voice?.scope === 'organization' ? 'Team' : 'Private';
}

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

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  onRemove,
  disabled,
}: {
  children: ReactNode;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
      <span className="min-w-0 truncate">{children}</span>
      {onRemove && (
        <ActionButton
          type="button"
          onClick={onRemove}
          disabled={disabled}
          variant="ghost"
          className="h-6 w-6 rounded-md p-0 text-sm"
          aria-label={`Remove ${String(children)}`}
        >
          <X className="h-3.5 w-3.5" />
        </ActionButton>
      )}
    </span>
  );
}

function AddInlineItem({
  id,
  label,
  value,
  onChange,
  onAdd,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const canAdd = Boolean(value.trim()) && !disabled;

  return (
    <div className="flex gap-2">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (canAdd) onAdd();
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        className={inputClassName}
      />
      <ActionButton
        type="button"
        onClick={onAdd}
        disabled={!canAdd}
        variant="outline"
        className="h-10 w-10 flex-shrink-0"
        aria-label={label}
        title={label}
      >
        <Plus className="h-4 w-4" />
      </ActionButton>
    </div>
  );
}

function VoiceSelector({
  voices,
  selectedVoiceId,
  selectedVoice,
  draftName,
  loading,
  onSelect,
}: {
  voices: BrandVoice[];
  selectedVoiceId: string | null;
  selectedVoice: BrandVoice | null;
  draftName: string;
  loading?: boolean;
  onSelect: (voice: BrandVoice) => void;
}) {
  const selectedLabel = selectedVoice?.name || draftName.trim() || 'New voice draft';
  const selectedScope = selectedVoice ? scopeLabel(selectedVoice) : 'Draft';
  const SelectedIcon = selectedVoice?.scope === 'organization' ? Globe2 : selectedVoice ? Lock : Sparkles;
  const trigger = (
    <ActionSelectTrigger
      icon={<SelectedIcon className="h-4 w-4" />}
      label={loading ? 'Loading voices' : selectedLabel}
      scopeLabel={selectedScope}
      loading={loading}
      className="h-11 px-3.5 sm:w-[280px]"
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
      <div className="w-[min(22rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>Select voice</DropdownMenuLabel>
        {voices.length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">
            No saved voices yet.
          </div>
        ) : (
          voices.map((voice) => {
            const active = voice.id === selectedVoiceId;
            const VoiceIcon = voice.scope === 'organization' ? Globe2 : Lock;

            return (
              <DropdownMenuItem
                key={voice.id}
                onClick={() => onSelect(voice)}
                className="items-start gap-3 px-3 py-3"
              >
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  <VoiceIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{voice.name}</span>
                    {active && <Check className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-300" />}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{scopeLabel(voice)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Updated {formatUpdatedDate(voice.updatedAt)}</span>
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

export default function BrandVoicePage() {
  const { session, isDemoMode } = useAuth();
  const { organization, organizationId, loading: loadingOrganization } = useStudioWorkspace();
  const [voices, setVoices] = useState<BrandVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toneInput, setToneInput] = useState('');
  const [pillarInput, setPillarInput] = useState('');
  const [exampleInput, setExampleInput] = useState('');
  const [bannedInput, setBannedInput] = useState('');

  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.id === selectedVoiceId) || null,
    [selectedVoiceId, voices]
  );
  const canCreate = !isDemoMode;
  const canEdit = !isDemoMode && (selectedVoice ? Boolean(selectedVoice.canEdit) : true);
  const isPersonalWorkspace = organization?.type === 'personal_legacy';
  const shareUnavailableMessage = isPersonalWorkspace ? 'Switch to a team workspace first.' : null;
  const canShareSelected = !isDemoMode && Boolean(selectedVoice?.canShare) && !isPersonalWorkspace;
  const canUnshareSelected = !isDemoMode && Boolean(selectedVoice?.canUnshare);
  const canSaveNewVoicePrivately = !selectedVoiceId && !isPersonalWorkspace;

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session?.access_token]);

  const setCurrentForm = useCallback((nextForm: FormState) => {
    setForm(nextForm);
  }, []);

  const loadVoices = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(withOrganizationId('/api/brand-voices', organizationId), {
        headers: authHeaders,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load voices');
      }

      const nextVoices = Array.isArray(payload.brandVoices) ? payload.brandVoices as BrandVoice[] : [];
      setVoices(nextVoices);

      const nextSelected = nextVoices[0] || null;
      const nextForm = nextSelected ? voiceToForm(nextSelected) : emptyForm;
      setSelectedVoiceId(nextSelected?.id || null);
      setCurrentForm(nextForm);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load voices');
      setVoices([]);
      setSelectedVoiceId(null);
      setCurrentForm(emptyForm);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, organizationId, setCurrentForm]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadVoices();
  }, [loadVoices, loadingOrganization]);

  const updateField = (field: keyof FormState, value: string | string[]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const selectVoice = (voice: BrandVoice) => {
    const nextForm = voiceToForm(voice);
    setSelectedVoiceId(voice.id);
    setCurrentForm(nextForm);
    setError(null);
    setMessage(null);
    setToneInput('');
    setPillarInput('');
    setExampleInput('');
    setBannedInput('');
  };

  const startNewVoice = () => {
    setSelectedVoiceId(null);
    setCurrentForm(emptyForm);
    setError(null);
    setMessage(null);
    setToneInput('');
    setPillarInput('');
    setExampleInput('');
    setBannedInput('');
  };

  const saveVoice = async (visibility?: StudioSaveVisibility) => {
    if (!canEdit || !organizationId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const isUpdate = Boolean(selectedVoiceId);
      const response = await fetch(
        isUpdate
          ? withOrganizationId(`/api/brand-voices/${selectedVoiceId}`, organizationId)
          : withOrganizationId('/api/brand-voices', organizationId),
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formToPayload(form, organizationId, isUpdate ? undefined : visibility)),
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save voice');
      }

      const savedVoice = payload.brandVoice as BrandVoice;
      setVoices((current) => {
        if (isUpdate) {
          return current.map((voice) => voice.id === savedVoice.id ? savedVoice : voice);
        }
        return [savedVoice, ...current];
      });
      setSelectedVoiceId(savedVoice.id);
      setCurrentForm(voiceToForm(savedVoice));
      setMessage(isUpdate
        ? 'Brand voice updated.'
        : savedVoice.scope === 'organization'
          ? 'Team voice created.'
          : 'Private voice created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save voice');
    } finally {
      setSaving(false);
    }
  };

  const deleteVoice = async () => {
    if (!canEdit || !organizationId || !selectedVoiceId) return;
    setDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/brand-voices/${selectedVoiceId}`, organizationId), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete voice');
      }

      const remaining = voices.filter((voice) => voice.id !== selectedVoiceId);
      const nextSelected = remaining[0] || null;
      setVoices(remaining);
      setSelectedVoiceId(nextSelected?.id || null);
      setCurrentForm(nextSelected ? voiceToForm(nextSelected) : emptyForm);
      setMessage('Voice deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete voice');
    } finally {
      setDeleting(false);
    }
  };

  const shareVoice = async () => {
    if (!selectedVoice?.canShare || !organizationId) return;
    if (isPersonalWorkspace) {
      setError('Switch to a team workspace before publishing this voice.');
      return;
    }
    setSharing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/brand-voices/${selectedVoice.id}/share`, organizationId), {
        method: 'POST',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to publish voice');
      }

      const sharedVoice = payload.brandVoice as BrandVoice;
      setVoices((current) => {
        const withoutDuplicate = current.filter((voice) => voice.id !== sharedVoice.id);
        return [sharedVoice, ...withoutDuplicate];
      });
      setSelectedVoiceId(sharedVoice.id);
      setCurrentForm(voiceToForm(sharedVoice));
      setMessage('Voice published to your team.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to publish voice');
    } finally {
      setSharing(false);
    }
  };

  const unshareVoice = async () => {
    if (!selectedVoice?.canUnshare || !organizationId) return;
    setSharing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/brand-voices/${selectedVoice.id}/share`, organizationId), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to move voice to private');
      }

      const privateVoice = payload.brandVoice as BrandVoice | null | undefined;
      const remaining = voices.filter((voice) => voice.id !== selectedVoice.id);
      const nextVoices = privateVoice ? [privateVoice, ...remaining] : remaining;
      const nextSelected = privateVoice
        || remaining.find((voice) => voice.id === selectedVoice.sharedFromVoiceId)
        || remaining[0]
        || null;
      setVoices(nextVoices);
      setSelectedVoiceId(nextSelected?.id || null);
      setCurrentForm(nextSelected ? voiceToForm(nextSelected) : emptyForm);
      setMessage('Voice moved to private.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to move voice to private');
    } finally {
      setSharing(false);
    }
  };

  const duplicateSelectedVoice = () => {
    if (!selectedVoice) return;
    const nextForm = {
      ...voiceToForm(selectedVoice),
      name: `${selectedVoice.name} copy`,
    };
    setSelectedVoiceId(null);
    setCurrentForm(nextForm);
    setMessage('Duplicated into a new unsaved voice.');
    setError(null);
  };

  const resetUnsavedEdits = () => {
    setCurrentForm(selectedVoice ? voiceToForm(selectedVoice) : emptyForm);
    setToneInput('');
    setPillarInput('');
    setExampleInput('');
    setBannedInput('');
    setMessage(selectedVoice ? 'Unsaved edits reset.' : 'Draft reset.');
    setError(null);
  };

  const addTone = () => {
    const nextTone = normalizeVoiceList([...form.toneChips, ...parseToneChips(toneInput)], 12);
    updateField('toneChips', nextTone);
    setToneInput('');
  };

  const addPillar = () => {
    const nextPillars = addVoiceListItem(form.contentPillars, pillarInput);
    updateField('contentPillars', nextPillars);
    setPillarInput('');
  };

  const addExample = () => {
    const nextExamples = addVoiceListItem(form.writingExamples, exampleInput);
    updateField('writingExamples', nextExamples);
    setExampleInput('');
  };

  const addBannedPhrase = () => {
    const nextPhrases = addVoiceListItem(form.bannedPhrases, bannedInput);
    updateField('bannedPhrases', nextPhrases);
    setBannedInput('');
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-0 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8">
        <DashboardPageHeader
          density="compact"
          icon={Sparkles}
          title="Voice"
          description="Manage voice profiles and audio transformation settings."
          actions={(
            <StudioHeaderControls
              selector={(
                <VoiceSelector
                  voices={voices}
                  selectedVoiceId={selectedVoiceId}
                  selectedVoice={selectedVoice}
                  draftName={form.name}
                  loading={loading || loadingOrganization}
                  onSelect={selectVoice}
                />
              )}
              action={(
                <ActionButton
                  type="button"
                  onClick={startNewVoice}
                  disabled={!canCreate || loading || loadingOrganization}
                  variant="primary"
                  className="h-11 w-full px-4 sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  New voice
                </ActionButton>
              )}
            />
          )}
        />
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
            <div className="h-[42rem] animate-pulse rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-6xl">
              <Card className="rounded-md">
                <CardContent className="p-0">
                {!canEdit && (
                  <div className="m-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                    {isDemoMode
                      ? 'Demo accounts can view voices but cannot change Studio settings.'
                      : 'You can view this voice, but you do not have permission to change it.'}
                  </div>
                )}

                <section className="space-y-5 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <SectionHeader
                      icon={<Sparkles className="h-4 w-4" />}
                      title="Voice identity"
                      description="Name the reusable system and choose whether it belongs to you or the team."
                    />
                    <StudioAccessControl
                      entityLabel="voice"
                      scope={selectedVoice?.scope ?? null}
                      canShare={canShareSelected}
                      canUnshare={canUnshareSelected}
                      loading={sharing}
                      onShare={() => { void shareVoice(); }}
                      onUnshare={() => { void unshareVoice(); }}
                      shareUnavailableMessage={selectedVoice?.canShare ? shareUnavailableMessage : null}
                      show={!isPersonalWorkspace}
                      className="w-full sm:w-auto"
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <FieldLabel htmlFor="brand-name">Voice name</FieldLabel>
                      <TextInput
                        id="brand-name"
                        value={form.name}
                        onChange={(value) => updateField('name', value)}
                        disabled={!canEdit}
                        placeholder="BeaconOps Default Voice"
                      />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel htmlFor="tone-input">Tone</FieldLabel>
                      <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                        {form.toneChips.map((tone, index) => (
                          <Chip
                            key={`${tone}-${index}`}
                            disabled={!canEdit}
                            onRemove={() => updateField('toneChips', removeVoiceListItem(form.toneChips, index))}
                          >
                            {tone}
                          </Chip>
                        ))}
                        {form.toneChips.length === 0 && (
                          <span className="px-1 py-1.5 text-sm text-slate-400">Add tone chips</span>
                        )}
                      </div>
                      <AddInlineItem
                        id="tone-input"
                        label="Add tone"
                        value={toneInput}
                        onChange={setToneInput}
                        onAdd={addTone}
                        disabled={!canEdit}
                        placeholder="Clear"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-5 border-t border-slate-100 p-5 dark:border-slate-800">
                  <SectionHeader
                    icon={<Users className="h-4 w-4" />}
                    title="Audience & Positioning"
                    description="Tell Studio who this voice is for and what point of view it should carry."
                  />
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabel htmlFor="brand-audience">Audience</FieldLabel>
                      <TextArea
                        id="brand-audience"
                        value={form.audience}
                        onChange={(value) => updateField('audience', value)}
                        disabled={!canEdit}
                        placeholder="Busy SaaS operators who care about pipeline, retention, launches, and distribution."
                        rows={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel htmlFor="brand-description">Positioning notes</FieldLabel>
                      <TextArea
                        id="brand-description"
                        value={form.description}
                        onChange={(value) => updateField('description', value)}
                        disabled={!canEdit}
                        placeholder="Sound like an experienced operator explaining what actually works."
                        rows={5}
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-5 border-t border-slate-100 p-5 dark:border-slate-800">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <SectionHeader
                      icon={<FileText className="h-4 w-4" />}
                      title="Content pillars"
                      description="Add the recurring themes this voice should return to."
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.contentPillars.map((pillar, index) => (
                      <Chip
                        key={`${pillar}-${index}`}
                        disabled={!canEdit}
                        onRemove={() => updateField('contentPillars', removeVoiceListItem(form.contentPillars, index))}
                      >
                        {pillar}
                      </Chip>
                    ))}
                    {form.contentPillars.length === 0 && (
                      <span className="text-sm text-slate-500 dark:text-slate-400">No pillars added yet.</span>
                    )}
                  </div>
                  <AddInlineItem
                    id="pillar-input"
                    label="Add content pillar"
                    value={pillarInput}
                    onChange={setPillarInput}
                    onAdd={addPillar}
                    disabled={!canEdit}
                    placeholder="Customer proof"
                  />
                </section>

                <section className="space-y-5 border-t border-slate-100 p-5 dark:border-slate-800">
                  <SectionHeader
                    icon={<ShieldCheck className="h-4 w-4" />}
                    title="Examples & Guardrails"
                    description="Use examples for positive direction and banned phrases for language to avoid."
                  />
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
                      <div className="mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Writing examples</h3>
                      </div>
                      <div className="space-y-2">
                        {form.writingExamples.map((example, index) => (
                          <div key={`example-${index}`} className="flex gap-2">
                            <label htmlFor={`writing-example-${index}`} className="sr-only">Writing example {index + 1}</label>
                            <input
                              id={`writing-example-${index}`}
                              value={example}
                              onChange={(event) => updateField('writingExamples', updateVoiceListItem(form.writingExamples, index, event.target.value))}
                              disabled={!canEdit}
                              className={inputClassName}
                            />
                            <ActionButton
                              type="button"
                              onClick={() => updateField('writingExamples', removeVoiceListItem(form.writingExamples, index))}
                              disabled={!canEdit}
                              variant="ghost"
                              className="h-10 w-10 flex-shrink-0 p-0 text-slate-500"
                              aria-label={`Remove writing example ${index + 1}`}
                            >
                              <X className="h-4 w-4" />
                            </ActionButton>
                          </div>
                        ))}
                        {form.writingExamples.length === 0 && (
                          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                            No examples added yet.
                          </p>
                        )}
                        <AddInlineItem
                          id="writing-example-input"
                          label="Add writing example"
                          value={exampleInput}
                          onChange={setExampleInput}
                          onAdd={addExample}
                          disabled={!canEdit}
                          placeholder="Example"
                        />
                      </div>
                    </div>

                    <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
                      <div className="mb-3 flex items-center gap-2">
                        <Ban className="h-4 w-4 text-slate-400" />
                        <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Banned phrases</h3>
                      </div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {form.bannedPhrases.map((phrase, index) => (
                          <Chip
                            key={`${phrase}-${index}`}
                            disabled={!canEdit}
                            onRemove={() => updateField('bannedPhrases', removeVoiceListItem(form.bannedPhrases, index))}
                          >
                            {phrase}
                          </Chip>
                        ))}
                        {form.bannedPhrases.length === 0 && (
                          <span className="text-sm text-slate-500 dark:text-slate-400">No banned phrases added yet.</span>
                        )}
                      </div>
                      <AddInlineItem
                        id="banned-phrase-input"
                        label="Add banned phrase"
                        value={bannedInput}
                        onChange={setBannedInput}
                        onAdd={addBannedPhrase}
                        disabled={!canEdit}
                        placeholder="Phrase"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-5 border-t border-slate-100 p-5 dark:border-slate-800">
                  <SectionHeader
                    icon={<Wand2 className="h-4 w-4" />}
                    title="Preferred CTA style"
                    description="Describe how Studio should invite the reader to act."
                  />
                  <div className="space-y-2">
                    <FieldLabel htmlFor="brand-cta">CTA preferences</FieldLabel>
                    <TextArea
                      id="brand-cta"
                      value={form.ctaPreferences}
                      onChange={(value) => updateField('ctaPreferences', value)}
                      disabled={!canEdit}
                      placeholder="Use soft, useful CTAs. Prefer helpful next steps over pushy sales language."
                      rows={3}
                    />
                  </div>
                </section>

                <div className="flex flex-col gap-3 border-t border-slate-100 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu
                      align="left"
                      portal
                      trigger={(
                        <ActionButton type="button" aria-label="Open voice actions">
                          <MoreHorizontal className="h-4 w-4" />
                          More actions
                        </ActionButton>
                      )}
                    >
                      <DropdownMenuLabel>Voice actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={duplicateSelectedVoice} disabled={!selectedVoice || !canCreate}>
                        <Copy className="h-4 w-4" />
                        Duplicate from selected
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={resetUnsavedEdits}>
                        <RotateCcw className="h-4 w-4" />
                        Reset unsaved edits
                      </DropdownMenuItem>
                    </DropdownMenu>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedVoice && (
                      <ActionButton
                        variant="danger"
                        type="button"
                        onClick={() => setDeleteOpen(true)}
                        disabled={!canEdit || deleting}
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Delete voice
                      </ActionButton>
                    )}
                    <ActionButton
                      variant="secondary"
                      type="button"
                      onClick={() => { void saveVoice('private'); }}
                      disabled={!canSaveNewVoicePrivately || !canEdit || saving || !form.name.trim()}
                      className={canSaveNewVoicePrivately ? undefined : 'hidden'}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save privately
                    </ActionButton>
                    <ActionButton
                      variant="primary"
                      type="button"
                      onClick={() => { void saveVoice(); }}
                      disabled={!canEdit || saving || !form.name.trim()}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {!selectedVoiceId && !isPersonalWorkspace ? 'Create team voice' : 'Save voice'}
                    </ActionButton>
                  </div>
                  </div>
                </CardContent>
              </Card>
            </div>
        )}
      </div>

      <StudioMobileActionBar
        primaryLabel={!selectedVoiceId && !isPersonalWorkspace ? 'Create team voice' : 'Save voice'}
        onPrimary={() => { void saveVoice(); }}
        disabled={!canEdit || !form.name.trim()}
        loading={saving}
        primaryIcon={<Save className="h-4 w-4" />}
        secondary={canSaveNewVoicePrivately ? (
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => { void saveVoice('private'); }}
            disabled={!canEdit || saving || !form.name.trim()}
            className="h-11"
          >
            Private
          </ActionButton>
        ) : undefined}
      />

      <ConfirmModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteVoice}
        title="Delete voice?"
        description="This removes the selected voice profile. Deleted voices are not archived in the current workspace."
        confirmText="Delete voice"
        isDestructive
      />
    </div>
  );
}
