"use client";

import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  Loader2,
  Palette,
  Plus,
  Save,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';

import ConfirmModal from '@/components/ui/confirm-modal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/context';
import type { CreatorProfile } from '@/lib/creator-profiles';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { withOrganizationId } from '@/lib/organizations/current-organization';

type ProfileForm = {
  name: string;
  website: string;
  positioning: string;
  audience: string;
  contentGoal: string;
  isDefault: boolean;
};

const emptyProfileForm: ProfileForm = {
  name: 'Main profile',
  website: '',
  positioning: '',
  audience: '',
  contentGoal: '',
  isDefault: false,
};

function profileToForm(profile: CreatorProfile): ProfileForm {
  return {
    name: profile.name,
    website: profile.website || '',
    positioning: profile.positioning || '',
    audience: profile.audience || '',
    contentGoal: profile.contentGoal || '',
    isDefault: profile.isDefault,
  };
}

function formToPayload(form: ProfileForm, organizationId?: string | null) {
  return {
    organization_id: organizationId || undefined,
    name: form.name,
    website: form.website,
    positioning: form.positioning,
    audience: form.audience,
    contentGoal: form.contentGoal,
    isDefault: form.isDefault,
  };
}

function TextField({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
      {label}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
      />
    </label>
  );
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  rows = 4,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
      {label}
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
      />
    </label>
  );
}

function StudioToolLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: ElementType;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[7.25rem] flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-blue-800 dark:hover:bg-blue-950/20"
    >
      <span className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-blue-100 group-hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:group-hover:bg-blue-950 dark:group-hover:text-blue-300">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
          <span className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</span>
        </span>
      </span>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
        Open
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export default function StudioProfilePage() {
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
  } = useCurrentOrganization();
  const [profiles, setProfiles] = useState<CreatorProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyProfileForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId]
  );
  const privateProfiles = useMemo(
    () => profiles.filter((profile) => profile.scope !== 'organization'),
    [profiles]
  );
  const workspaceProfiles = useMemo(
    () => profiles.filter((profile) => profile.scope === 'organization'),
    [profiles]
  );
  const canCreate = !isDemoMode;
  const canEdit = !isDemoMode && (selectedProfile ? Boolean(selectedProfile.canEdit) : true);
  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, [session?.access_token]);

  const loadProfiles = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(withOrganizationId('/api/creator-profiles', organizationId), {
        headers: authHeaders,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load profiles');
      }

      const nextProfiles = Array.isArray(payload.creatorProfiles)
        ? payload.creatorProfiles as CreatorProfile[]
        : [];
      setProfiles(nextProfiles);

      const nextProfile = nextProfiles.find((profile) => profile.isDefault) || nextProfiles[0] || null;
      setSelectedProfileId(nextProfile?.id || null);
      setForm(nextProfile ? profileToForm(nextProfile) : {
        ...emptyProfileForm,
        name: organization?.name ? `${organization.name} profile` : emptyProfileForm.name,
        isDefault: nextProfiles.length === 0,
      });
    } catch (loadError) {
      setProfiles([]);
      setSelectedProfileId(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, organization?.name, organizationId]);

  useEffect(() => {
    if (loadingOrganization) return;
    void loadProfiles();
  }, [loadProfiles, loadingOrganization]);

  const selectProfile = (profile: CreatorProfile) => {
    setSelectedProfileId(profile.id);
    setForm(profileToForm(profile));
    setError(null);
    setMessage(null);
  };

  const startNewProfile = () => {
    setSelectedProfileId(null);
    setForm({
      ...emptyProfileForm,
      name: profiles.length === 0 && organization?.name ? `${organization.name} profile` : 'New profile',
      isDefault: profiles.length === 0,
    });
    setError(null);
    setMessage(null);
  };

  const updateField = <K extends keyof ProfileForm>(field: K, value: ProfileForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const saveProfile = async () => {
    if (!canEdit || !organizationId) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const isUpdate = Boolean(selectedProfileId);
      const response = await fetch(
        isUpdate
          ? withOrganizationId(`/api/creator-profiles/${selectedProfileId}`, organizationId)
          : withOrganizationId('/api/creator-profiles', organizationId),
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
        throw new Error(payload.error || 'Failed to save profile');
      }

      const savedProfile = payload.creatorProfile as CreatorProfile;
      setProfiles((current) => {
        const next = current.map((profile) => (
          savedProfile.isDefault && profile.id !== savedProfile.id
            ? { ...profile, isDefault: false }
            : profile
        ));
        if (isUpdate) {
          return next.map((profile) => profile.id === savedProfile.id ? savedProfile : profile);
        }
        return [savedProfile, ...next];
      });
      setSelectedProfileId(savedProfile.id);
      setForm(profileToForm(savedProfile));
      setMessage(isUpdate ? 'Profile updated.' : 'Profile created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async () => {
    if (!canEdit || !organizationId || !selectedProfileId) return;

    setDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/creator-profiles/${selectedProfileId}`, organizationId), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete profile');
      }

      const remaining = profiles.filter((profile) => profile.id !== selectedProfileId);
      const nextProfile = remaining.find((profile) => profile.isDefault) || remaining[0] || null;
      setProfiles(remaining);
      setSelectedProfileId(nextProfile?.id || null);
      setForm(nextProfile ? profileToForm(nextProfile) : emptyProfileForm);
      setMessage('Profile deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete profile');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const shareProfile = async () => {
    if (!selectedProfile?.canShare || !organizationId) return;

    setSharing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/creator-profiles/${selectedProfile.id}/share`, organizationId), {
        method: 'POST',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to share profile');
      }

      const sharedProfile = payload.creatorProfile as CreatorProfile;
      setProfiles((current) => {
        const withoutDuplicate = current.filter((profile) => profile.id !== sharedProfile.id);
        return [sharedProfile, ...withoutDuplicate];
      });
      setSelectedProfileId(sharedProfile.id);
      setForm(profileToForm(sharedProfile));
      setMessage('Profile shared with this workspace.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to share profile');
    } finally {
      setSharing(false);
    }
  };

  const unshareProfile = async () => {
    if (!selectedProfile?.canUnshare || !organizationId) return;

    setSharing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(withOrganizationId(`/api/creator-profiles/${selectedProfile.id}/share`, organizationId), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to unshare profile');
      }

      const remaining = profiles.filter((profile) => profile.id !== selectedProfile.id);
      const nextProfile = remaining.find((profile) => profile.id === selectedProfile.sharedFromProfileId)
        || remaining.find((profile) => profile.isDefault)
        || remaining[0]
        || null;
      setProfiles(remaining);
      setSelectedProfileId(nextProfile?.id || null);
      setForm(nextProfile ? profileToForm(nextProfile) : emptyProfileForm);
      setMessage('Profile removed from this workspace.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to unshare profile');
    } finally {
      setSharing(false);
    }
  };

  const renderProfileButton = (profile: CreatorProfile) => {
    const active = profile.id === selectedProfileId;
    return (
      <button
        key={profile.id}
        type="button"
        onClick={() => selectProfile(profile)}
        className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
          active
            ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-100'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
        }`}
      >
        <div className="flex items-start gap-3">
          <UserRound className={`mt-0.5 h-4 w-4 flex-shrink-0 ${active ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400'}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{profile.name}</p>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {profile.audience || profile.contentGoal || profile.positioning || 'No details yet'}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            <Badge variant={profile.scope === 'organization' ? 'secondary' : 'outline'}>
              {profile.scope === 'organization' ? 'Workspace' : 'Private'}
            </Badge>
            {profile.isDefault && (
              <Badge variant="success">
                Default
              </Badge>
            )}
          </div>
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
              <Sparkles className="h-3.5 w-3.5" />
              Studio
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Profile
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Create the creator, channel, or workspace context that should guide generated content.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organization && <Badge variant="outline">Workspace: {organization.name}</Badge>}
            {isDemoMode && <Badge variant="warning">Demo</Badge>}
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
          <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
            <div className="h-[34rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
            <div className="h-[34rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>Profiles</CardTitle>
                      <CardDescription>Choose which creator context to edit.</CardDescription>
                    </div>
                    <button
                      type="button"
                      onClick={startNewProfile}
                      disabled={!canCreate}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                      aria-label="Create profile"
                      title="Create profile"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {profiles.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center dark:border-slate-700">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                        <UserRound className="h-5 w-5" />
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        No profiles yet
                      </h3>
                      <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Create one profile for yourself, a show, a channel, or a workspace.
                      </p>
                      <button
                        type="button"
                        onClick={startNewProfile}
                        disabled={!canCreate}
                        className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        Create Profile
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {privateProfiles.length > 0 && (
                        <div className="space-y-2">
                          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            My private
                          </p>
                          {privateProfiles.map(renderProfileButton)}
                        </div>
                      )}
                      {workspaceProfiles.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Workspace shared
                          </p>
                          {workspaceProfiles.map(renderProfileButton)}
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
                      <CardTitle>{selectedProfile ? 'Edit profile' : 'Create profile'}</CardTitle>
                      <CardDescription>
                        This is the creator context the generator can use before applying Voice and Plan details.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedProfile?.canShare && (
                        <button
                          type="button"
                          onClick={shareProfile}
                          disabled={sharing}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/60 dark:bg-slate-950 dark:text-blue-300 dark:hover:bg-blue-950/30"
                        >
                          {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                          Share
                        </button>
                      )}
                      {selectedProfile?.canUnshare && (
                        <button
                          type="button"
                          onClick={unshareProfile}
                          disabled={sharing}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                          {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                          Unshare
                        </button>
                      )}
                      {selectedProfile && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          disabled={!canEdit || deleting}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={saveProfile}
                        disabled={!canEdit || saving || !form.name.trim()}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {selectedProfile ? 'Save changes' : 'Create profile'}
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!canEdit && (
                    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                      {isDemoMode
                        ? 'Demo accounts can view profiles but cannot change Studio settings.'
                        : 'You can view this profile, but you do not have permission to change it.'}
                    </div>
                  )}

                  <div className="grid gap-5">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
                      <TextField
                        id="profile-name"
                        label="Profile name"
                        value={form.name}
                        onChange={(value) => updateField('name', value)}
                        disabled={!canEdit}
                        placeholder="Main creator, podcast, product, or channel"
                      />
                      <TextField
                        id="profile-website"
                        label="Website"
                        type="url"
                        value={form.website}
                        onChange={(value) => updateField('website', value)}
                        disabled={!canEdit}
                        placeholder="https://..."
                      />
                    </div>

                    <TextAreaField
                      id="profile-positioning"
                      label="Positioning"
                      value={form.positioning}
                      onChange={(value) => updateField('positioning', value)}
                      disabled={!canEdit}
                      placeholder="What should the generator understand about this creator, show, channel, or workspace?"
                      rows={4}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <TextAreaField
                        id="profile-audience"
                        label="Audience"
                        value={form.audience}
                        onChange={(value) => updateField('audience', value)}
                        disabled={!canEdit}
                        placeholder="Who is this content for?"
                        rows={4}
                      />
                      <TextAreaField
                        id="profile-goal"
                        label="First content goal"
                        value={form.contentGoal}
                        onChange={(value) => updateField('contentGoal', value)}
                        disabled={!canEdit}
                        placeholder="What should the next few generated pieces help accomplish?"
                        rows={4}
                      />
                    </div>

                    <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={form.isDefault}
                        onChange={(event) => updateField('isDefault', event.target.checked)}
                        disabled={!canEdit}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <span>
                        <span className="block font-semibold">Use as the default profile</span>
                        <span className="mt-1 block text-slate-500 dark:text-slate-400">
                          New content settings will prefill this profile, but creators can choose None or another profile per content piece.
                        </span>
                      </span>
                    </label>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <StudioToolLink
                href="/dashboard/studio/voice"
                icon={Palette}
                title="Voice"
                description="Tune tone, examples, phrases to avoid, and CTA preferences."
              />
              <StudioToolLink
                href="/dashboard/studio/plans"
                icon={FolderKanban}
                title="Plans"
                description="Set a goal, audience, and channels for launch or recurring content."
              />
              <StudioToolLink
                href="/dashboard/upload"
                icon={Upload}
                title="Upload"
                description="Add source audio, then choose Profile, Voice, Plan, and Library when generating."
              />
            </div>

            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  Profiles connect Studio to projects at generation time. Upload and transcription stay the same; the selected Profile helps shape the draft when content is generated.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete profile?"
        description="Generated content that already used this profile will keep its saved metadata, but future generation cannot select this profile."
        confirmText="Delete profile"
        cancelText="Cancel"
        isDestructive
        onConfirm={deleteProfile}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
