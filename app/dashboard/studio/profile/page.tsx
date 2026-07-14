"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Building2,
  Check,
  Globe2,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserRound,
} from 'lucide-react';

import {
  StudioAccessControl,
  StudioHeaderControls,
  StudioMobileActionBar,
  useStudioWorkspace,
} from '@/components/dashboard/studio/studio-page-header';
import { ActionButton, ActionSelectTrigger } from '@/components/dashboard/action-controls';
import { DashboardPageHeader } from '@/components/dashboard/shell';
import ConfirmModal from '@/components/ui/confirm-modal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth/context';
import type { CreatorProfile } from '@/lib/creator-profiles';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import { cn } from '@/lib/utils';

type ProfileForm = {
  name: string;
  website: string;
  positioning: string;
  audience: string;
  contentGoal: string;
  isDefault: boolean;
};

type StudioSaveVisibility = 'private' | 'team';

const emptyProfileForm: ProfileForm = {
  name: 'Main profile',
  website: '',
  positioning: '',
  audience: '',
  contentGoal: '',
  isDefault: false,
};

const inputClassName =
  'mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900';

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

function formToPayload(
  form: ProfileForm,
  organizationId?: string | null,
  visibility?: StudioSaveVisibility
) {
  return {
    organization_id: organizationId || undefined,
    visibility,
    name: form.name,
    website: form.website,
    positioning: form.positioning,
    audience: form.audience,
    contentGoal: form.contentGoal,
    isDefault: form.isDefault,
  };
}

function formatUpdatedDate(value?: string | null): string {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved yet';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
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

function ProfileSelector({
  profiles,
  selectedProfileId,
  selectedProfile,
  draftName,
  loading,
  onSelectProfile,
}: {
  profiles: CreatorProfile[];
  selectedProfileId: string | null;
  selectedProfile: CreatorProfile | null;
  draftName: string;
  loading?: boolean;
  onSelectProfile: (profile: CreatorProfile) => void;
}) {
  const selectedLabel = selectedProfile?.name || draftName.trim() || 'New profile draft';
  const selectedScope = selectedProfile
    ? selectedProfile.scope === 'organization' ? 'Team' : 'Private'
    : 'Draft';
  const SelectedIcon = selectedProfile?.scope === 'organization' ? Building2 : selectedProfile ? Globe2 : UserRound;
  const trigger = (
    <ActionSelectTrigger
      icon={<SelectedIcon className="h-4 w-4" />}
      label={loading ? 'Loading profiles' : selectedLabel}
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
        <DropdownMenuLabel>Select profile</DropdownMenuLabel>
        {profiles.length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">
            No saved profiles yet.
          </div>
        ) : (
          profiles.map((profile) => {
            const active = profile.id === selectedProfileId;
            const ProfileIcon = profile.scope === 'organization' ? Building2 : Globe2;

            return (
              <DropdownMenuItem
                key={profile.id}
                onClick={() => onSelectProfile(profile)}
                className="items-start gap-3 px-3 py-3"
              >
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  <ProfileIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{profile.name}</span>
                    {profile.isDefault && <Badge variant="info">Default</Badge>}
                    {active && <Check className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-300" />}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{profile.scope === 'organization' ? 'Team' : 'Private'}</span>
                    <span aria-hidden="true">·</span>
                    <span>Updated {formatUpdatedDate(profile.updatedAt)}</span>
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

export default function StudioProfilePage() {
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
  } = useStudioWorkspace();
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
  const canCreate = !isDemoMode;
  const canEdit = !isDemoMode && (selectedProfile ? Boolean(selectedProfile.canEdit) : true);
  const isPersonalWorkspace = organization?.type === 'personal_legacy';
  const shareUnavailableMessage = isPersonalWorkspace ? 'Switch to a team workspace first.' : null;
  const canShareSelectedProfile = !isDemoMode && Boolean(selectedProfile?.canShare) && !isPersonalWorkspace;
  const canSaveNewProfilePrivately = !selectedProfileId && !isPersonalWorkspace;

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

  const saveProfile = async (visibility?: StudioSaveVisibility) => {
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
          body: JSON.stringify(formToPayload(form, organizationId, isUpdate ? undefined : visibility)),
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
      setMessage(isUpdate
        ? 'Profile updated.'
        : savedProfile.scope === 'organization'
          ? 'Team profile created.'
          : 'Private profile created.');
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
    if (isPersonalWorkspace) {
      setError('Switch to a team workspace before publishing this profile.');
      return;
    }

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
        throw new Error(payload.error || 'Failed to publish profile');
      }

      const sharedProfile = payload.creatorProfile as CreatorProfile;
      setProfiles((current) => {
        const withoutDuplicate = current.filter((profile) => profile.id !== sharedProfile.id);
        return [sharedProfile, ...withoutDuplicate];
      });
      setSelectedProfileId(sharedProfile.id);
      setForm(profileToForm(sharedProfile));
      setMessage('Profile published to your team.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to publish profile');
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
        throw new Error(payload.error || 'Failed to move profile to private');
      }

      const privateProfile = payload.creatorProfile as CreatorProfile | null | undefined;
      const remaining = profiles.filter((profile) => profile.id !== selectedProfile.id);
      const nextProfiles = privateProfile ? [privateProfile, ...remaining] : remaining;
      const nextProfile = privateProfile
        || remaining.find((profile) => profile.id === selectedProfile.sharedFromProfileId)
        || remaining.find((profile) => profile.isDefault)
        || remaining[0]
        || null;
      setProfiles(nextProfiles);
      setSelectedProfileId(nextProfile?.id || null);
      setForm(nextProfile ? profileToForm(nextProfile) : emptyProfileForm);
      setMessage('Profile moved to private.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Failed to move profile to private');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-0 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8">
        <DashboardPageHeader
          density="compact"
          icon={Building2}
          title="Profile"
          description="Manage your account details, preferences, and workspace identity."
          actions={(
            <StudioHeaderControls
              selector={(
                <ProfileSelector
                  profiles={profiles}
                  selectedProfileId={selectedProfileId}
                  selectedProfile={selectedProfile}
                  draftName={form.name}
                  loading={loading || loadingOrganization}
                  onSelectProfile={selectProfile}
                />
              )}
              action={(
                <ActionButton
                  type="button"
                  onClick={startNewProfile}
                  disabled={!canCreate || loading || loadingOrganization}
                  variant="primary"
                  className="h-11 w-full px-4 sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  New profile
                </ActionButton>
              )}
            />
          )}
        />
        {(error || message) && (
          <div
            role="status"
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
              <CardHeader className="border-b border-slate-100 p-5 dark:border-slate-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-base">
                      {selectedProfile ? 'Edit content profile' : 'Create content profile'}
                    </CardTitle>
                    <CardDescription className="mt-2 leading-5">
                      Add key context about your brand, audience, and goals to improve every output.
                    </CardDescription>
                  </div>
                  <StudioAccessControl
                    entityLabel="profile"
                    scope={selectedProfile?.scope ?? null}
                    canShare={canShareSelectedProfile}
                    canUnshare={!isDemoMode && Boolean(selectedProfile?.canUnshare)}
                    loading={sharing}
                    onShare={() => { void shareProfile(); }}
                    onUnshare={() => { void unshareProfile(); }}
                    shareUnavailableMessage={selectedProfile?.canShare ? shareUnavailableMessage : null}
                    show={!isPersonalWorkspace}
                    className="w-full sm:w-auto"
                  />
                </div>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                  {!canEdit && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                      {isDemoMode
                        ? 'Demo accounts can view profiles but cannot change Studio settings.'
                        : 'You can view this profile, but you do not have permission to change it.'}
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="profile-name">Profile name *</FieldLabel>
                      <TextInput
                        id="profile-name"
                        value={form.name}
                        onChange={(value) => updateField('name', value)}
                        disabled={!canEdit}
                        placeholder="Hotspot Profile"
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="profile-website">Website</FieldLabel>
                      <TextInput
                        id="profile-website"
                        type="url"
                        value={form.website}
                        onChange={(value) => updateField('website', value)}
                        disabled={!canEdit}
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel htmlFor="profile-positioning">Positioning *</FieldLabel>
                    <TextArea
                      id="profile-positioning"
                      value={form.positioning}
                      onChange={(value) => updateField('positioning', value)}
                      disabled={!canEdit}
                      placeholder="What should the Studio understand about your value proposition and differentiators?"
                      rows={4}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="profile-audience">Audience *</FieldLabel>
                      <TextArea
                        id="profile-audience"
                        value={form.audience}
                        onChange={(value) => updateField('audience', value)}
                        disabled={!canEdit}
                        placeholder="Who is this content for? Be specific about roles, seniority, and company type."
                        rows={4}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="profile-goal">Content goals *</FieldLabel>
                      <TextArea
                        id="profile-goal"
                        value={form.contentGoal}
                        onChange={(value) => updateField('contentGoal', value)}
                        disabled={!canEdit}
                        placeholder="What outcomes should generated content help achieve?"
                        rows={4}
                      />
                    </div>
                  </div>

                  <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={form.isDefault}
                      onChange={(event) => updateField('isDefault', event.target.checked)}
                      disabled={!canEdit}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span>
                      <span className="block font-semibold">Use as default profile</span>
                      <span className="mt-1 block text-slate-500 dark:text-slate-400">
                        New content generated in Studio will use this profile unless a different profile is selected.
                      </span>
                    </span>
                  </label>

                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedProfile && (
                        <ActionButton
                          variant="danger"
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          disabled={!canEdit || deleting}
                        >
                          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </ActionButton>
                      )}
                      <ActionButton
                        variant="secondary"
                        type="button"
                        onClick={() => { void saveProfile('private'); }}
                        disabled={!canSaveNewProfilePrivately || !canEdit || saving || !form.name.trim()}
                        className={canSaveNewProfilePrivately ? undefined : 'hidden'}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save privately
                      </ActionButton>
                      <ActionButton
                        variant="primary"
                        type="button"
                        onClick={() => { void saveProfile(); }}
                        disabled={!canEdit || saving || !form.name.trim()}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {!selectedProfileId && !isPersonalWorkspace ? 'Create team profile' : 'Save profile'}
                      </ActionButton>
                    </div>
                  </div>
                </CardContent>
              </Card>
          </div>
        )}
      </div>

      <StudioMobileActionBar
        primaryLabel={!selectedProfileId && !isPersonalWorkspace ? 'Create team profile' : 'Save profile'}
        onPrimary={() => { void saveProfile(); }}
        disabled={!canEdit || !form.name.trim()}
        loading={saving}
        primaryIcon={<Save className="h-4 w-4" />}
        secondary={canSaveNewProfilePrivately ? (
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => { void saveProfile('private'); }}
            disabled={!canEdit || saving || !form.name.trim()}
            className="h-11"
          >
            Private
          </ActionButton>
        ) : undefined}
      />

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
