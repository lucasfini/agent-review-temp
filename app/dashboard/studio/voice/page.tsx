"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Ban,
  Building2,
  FileText,
  Loader2,
  Megaphone,
  Palette,
  Plus,
  Save,
  Share2,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';

import ConfirmModal from '@/components/ui/confirm-modal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import type { BrandVoice } from '@/lib/brand-voices';

type FormState = {
  name: string;
  description: string;
  tone: string;
  audience: string;
  contentPillarsText: string;
  writingExamplesText: string;
  bannedPhrasesText: string;
  ctaPreferences: string;
};

const emptyForm: FormState = {
  name: 'Default voice',
  description: '',
  tone: '',
  audience: '',
  contentPillarsText: '',
  writingExamplesText: '',
  bannedPhrasesText: '',
  ctaPreferences: '',
};

function listToText(items: string[]): string {
  return items.join('\n');
}

function textToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function voiceToForm(voice: BrandVoice): FormState {
  return {
    name: voice.name,
    description: voice.description || '',
    tone: voice.tone || '',
    audience: voice.audience || '',
    contentPillarsText: listToText(voice.contentPillars),
    writingExamplesText: listToText(voice.writingExamples),
    bannedPhrasesText: listToText(voice.bannedPhrases),
    ctaPreferences: voice.ctaPreferences || '',
  };
}

function formToPayload(form: FormState, organizationId?: string | null) {
  return {
    organization_id: organizationId || undefined,
    name: form.name,
    description: form.description,
    tone: form.tone,
    audience: form.audience,
    contentPillars: textToList(form.contentPillarsText),
    writingExamples: textToList(form.writingExamplesText),
    bannedPhrases: textToList(form.bannedPhrasesText),
    ctaPreferences: form.ctaPreferences,
  };
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
      className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
    />
  );
}

export default function BrandVoicePage() {
  const { session, isDemoMode } = useAuth();
  const { organization, organizationId, loading: loadingOrganization } = useCurrentOrganization();
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

  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.id === selectedVoiceId) || null,
    [selectedVoiceId, voices]
  );
  const privateVoices = useMemo(
    () => voices.filter((voice) => voice.scope !== 'organization'),
    [voices]
  );
  const workspaceVoices = useMemo(
    () => voices.filter((voice) => voice.scope === 'organization'),
    [voices]
  );
  const canCreate = !isDemoMode;
  const canEdit = !isDemoMode && (selectedVoice ? Boolean(selectedVoice.canEdit) : true);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session?.access_token]);

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
      setSelectedVoiceId(nextSelected?.id || null);
      setForm(nextSelected ? voiceToForm(nextSelected) : emptyForm);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load voices');
      setVoices([]);
      setSelectedVoiceId(null);
      setForm(emptyForm);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadVoices();
  }, [loadVoices, loadingOrganization]);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const selectVoice = (voice: BrandVoice) => {
    setSelectedVoiceId(voice.id);
    setForm(voiceToForm(voice));
    setError(null);
    setMessage(null);
  };

  const startNewVoice = () => {
    setSelectedVoiceId(null);
    setForm(emptyForm);
    setError(null);
    setMessage(null);
  };

  const saveVoice = async () => {
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
          body: JSON.stringify(formToPayload(form, organizationId)),
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
      setForm(voiceToForm(savedVoice));
      setMessage(isUpdate ? 'Brand voice updated.' : 'Brand voice created.');
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
      setForm(nextSelected ? voiceToForm(nextSelected) : emptyForm);
      setMessage('Voice deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete voice');
    } finally {
      setDeleting(false);
    }
  };

  const shareVoice = async () => {
    if (!selectedVoice?.canShare || !organizationId) return;
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
        throw new Error(payload.error || 'Failed to share voice');
      }

      const sharedVoice = payload.brandVoice as BrandVoice;
      setVoices((current) => {
        const withoutDuplicate = current.filter((voice) => voice.id !== sharedVoice.id);
        return [sharedVoice, ...withoutDuplicate];
      });
      setSelectedVoiceId(sharedVoice.id);
      setForm(voiceToForm(sharedVoice));
      setMessage('Voice shared with this workspace.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to share voice');
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
        throw new Error(payload.error || 'Failed to unshare voice');
      }

      const remaining = voices.filter((voice) => voice.id !== selectedVoice.id);
      const nextSelected = remaining.find((voice) => voice.id === selectedVoice.sharedFromVoiceId)
        || remaining[0]
        || null;
      setVoices(remaining);
      setSelectedVoiceId(nextSelected?.id || null);
      setForm(nextSelected ? voiceToForm(nextSelected) : emptyForm);
      setMessage('Voice removed from this workspace.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to unshare voice');
    } finally {
      setSharing(false);
    }
  };

  const renderVoiceButton = (voice: BrandVoice) => {
    const active = voice.id === selectedVoiceId;
    return (
      <button
        key={voice.id}
        type="button"
        onClick={() => selectVoice(voice)}
        className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
          active
            ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-100'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
        }`}
      >
        <div className="flex items-start gap-2">
          <Sparkles className={`mt-0.5 h-4 w-4 flex-shrink-0 ${active ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400'}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{voice.name}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {voice.tone || voice.audience || 'No tone or audience set yet'}
            </p>
          </div>
          <Badge variant={voice.scope === 'organization' ? 'secondary' : 'outline'}>
            {voice.scope === 'organization' ? 'Workspace' : 'Private'}
          </Badge>
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
              <Palette className="h-3.5 w-3.5" />
              Studio
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Voice
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Capture how your content should sound, who it should speak to, and which phrases Studio should reuse or avoid.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organization && (
              <Badge variant="outline" className="w-fit">
                Workspace: {organization.name}
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

        {loading || loadingOrganization ? (
          <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="h-72 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
            <div className="h-[36rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <Card className="h-fit">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Voices</CardTitle>
                    <CardDescription>
                      Reusable writing styles for your content.
                    </CardDescription>
                  </div>
                  <button
                    type="button"
                    onClick={startNewVoice}
                    disabled={!canCreate}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                    aria-label="Create voice"
                    title="Create voice"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {voices.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center dark:border-slate-700">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                      <Palette className="h-5 w-5" />
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      No voices yet
                    </h3>
                    <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">
                      Add a default voice so generated content can reuse your tone, audience, examples, and language rules.
                    </p>
                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={startNewVoice}
                        disabled={!canCreate}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        Create Voice
                      </button>
                      <Link
                        href="/dashboard/studio/profile"
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                      >
                        <Building2 className="h-4 w-4" />
                        Open Profile
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {privateVoices.length > 0 && (
                      <div className="space-y-2">
                        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          My private
                        </p>
                        {privateVoices.map(renderVoiceButton)}
                      </div>
                    )}
                    {workspaceVoices.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Workspace shared
                        </p>
                        {workspaceVoices.map(renderVoiceButton)}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>{selectedVoice ? 'Edit voice' : 'Create voice'}</CardTitle>
                    <CardDescription>
                      These fields define reusable writing guidance for later content generation.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedVoice?.canShare && (
                      <button
                        type="button"
                        onClick={shareVoice}
                        disabled={sharing}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/60 dark:bg-slate-950 dark:text-blue-300 dark:hover:bg-blue-950/30"
                      >
                        {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                        Share
                      </button>
                    )}
                    {selectedVoice?.canUnshare && (
                      <button
                        type="button"
                        onClick={unshareVoice}
                        disabled={sharing}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                      >
                        {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                        Unshare
                      </button>
                    )}
                    {selectedVoice && (
                      <button
                        type="button"
                        onClick={() => setDeleteOpen(true)}
                        disabled={!canEdit || deleting}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={saveVoice}
                      disabled={!canEdit || saving || !form.name.trim()}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {selectedVoice ? 'Save changes' : 'Create voice'}
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!canEdit && (
                  <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                    {isDemoMode
                      ? 'Demo accounts can view voices but cannot change Studio settings.'
                      : 'You can view this voice, but you do not have permission to change it.'}
                  </div>
                )}

                <div className="grid gap-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="brand-name">Voice name</FieldLabel>
                      <TextInput
                        id="brand-name"
                        value={form.name}
                        onChange={(value) => updateField('name', value)}
                        disabled={!canEdit}
                        placeholder="Default voice"
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="brand-tone">Tone</FieldLabel>
                      <TextInput
                        id="brand-tone"
                        value={form.tone}
                        onChange={(value) => updateField('tone', value)}
                        disabled={!canEdit}
                        placeholder="Clear, expert, direct, warm"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <FieldLabel htmlFor="brand-description">Positioning and style notes</FieldLabel>
                    </div>
                    <TextArea
                      id="brand-description"
                      value={form.description}
                      onChange={(value) => updateField('description', value)}
                      disabled={!canEdit}
                      placeholder="Describe how the company should sound and what makes the point of view distinct."
                    />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-400" />
                      <FieldLabel htmlFor="brand-audience">Audience</FieldLabel>
                    </div>
                    <TextArea
                      id="brand-audience"
                      value={form.audience}
                      onChange={(value) => updateField('audience', value)}
                      disabled={!canEdit}
                      placeholder="Who the content is for, what they care about, and what they already understand."
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-slate-400" />
                        <FieldLabel htmlFor="brand-pillars">Content pillars</FieldLabel>
                      </div>
                      <TextArea
                        id="brand-pillars"
                        value={form.contentPillarsText}
                        onChange={(value) => updateField('contentPillarsText', value)}
                        disabled={!canEdit}
                        placeholder={'One per line\nCustomer proof\nFounder POV\nProduct education'}
                        rows={6}
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <Megaphone className="h-4 w-4 text-slate-400" />
                        <FieldLabel htmlFor="brand-examples">Writing examples</FieldLabel>
                      </div>
                      <TextArea
                        id="brand-examples"
                        value={form.writingExamplesText}
                        onChange={(value) => updateField('writingExamplesText', value)}
                        disabled={!canEdit}
                        placeholder={'One example or link per line\nExample post opening\nNewsletter intro'}
                        rows={6}
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <Ban className="h-4 w-4 text-slate-400" />
                        <FieldLabel htmlFor="brand-banned">Banned phrases</FieldLabel>
                      </div>
                      <TextArea
                        id="brand-banned"
                        value={form.bannedPhrasesText}
                        onChange={(value) => updateField('bannedPhrasesText', value)}
                        disabled={!canEdit}
                        placeholder={'One per line\nRevolutionary\nGame-changing\nUnlock your potential'}
                        rows={6}
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel htmlFor="brand-cta">Preferred CTA style</FieldLabel>
                    <TextArea
                      id="brand-cta"
                      value={form.ctaPreferences}
                      onChange={(value) => updateField('ctaPreferences', value)}
                      disabled={!canEdit}
                      placeholder="Describe how calls to action should sound and what actions are preferred."
                      rows={3}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteVoice}
        title="Delete voice?"
        description="This removes the selected voice profile."
        confirmText="Delete"
        isDestructive
      />
    </div>
  );
}
