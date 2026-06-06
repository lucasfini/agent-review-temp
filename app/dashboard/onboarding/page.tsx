"use client";

import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  CreditCard,
  FolderKanban,
  Loader2,
  Palette,
  Save,
  SkipForward,
  Upload,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/context';
import type { BrandVoice } from '@/lib/brand-voices';
import { formatSubscriptionStatus } from '@/lib/billing/subscription-ui';
import type { OrganizationSubscription } from '@/lib/billing/subscriptions';
import type { Campaign } from '@/lib/campaigns-content-library';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import {
  updateCurrentOrganizationOnboarding,
  withOrganizationId,
  type OrganizationOnboardingProfileInput,
} from '@/lib/organizations/current-organization';
import { cn } from '@/lib/utils';

type BrandVoiceForm = {
  id: string | null;
  name: string;
  description: string;
  tone: string;
  audience: string;
  contentPillarsText: string;
  bannedPhrasesText: string;
  ctaPreferences: string;
};

type CampaignForm = {
  id: string | null;
  name: string;
  objective: string;
  audience: string;
  channelsText: string;
};

type OrganizationProfileForm = OrganizationOnboardingProfileInput;

const defaultBrandVoiceForm: BrandVoiceForm = {
  id: null,
  name: 'Default brand voice',
  description: '',
  tone: '',
  audience: '',
  contentPillarsText: '',
  bannedPhrasesText: '',
  ctaPreferences: '',
};

const defaultCampaignForm: CampaignForm = {
  id: null,
  name: 'First content campaign',
  objective: '',
  audience: '',
  channelsText: 'LinkedIn\nEmail',
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

function brandVoiceToForm(voice: BrandVoice): BrandVoiceForm {
  return {
    id: voice.id,
    name: voice.name,
    description: voice.description || '',
    tone: voice.tone || '',
    audience: voice.audience || '',
    contentPillarsText: listToText(voice.contentPillars),
    bannedPhrasesText: listToText(voice.bannedPhrases),
    ctaPreferences: voice.ctaPreferences || '',
  };
}

function campaignToForm(campaign: Campaign): CampaignForm {
  return {
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective || '',
    audience: campaign.audience || '',
    channelsText: listToText(campaign.channels),
  };
}

function parseProfile(value: unknown): OrganizationProfileForm {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const profile = value as Record<string, unknown>;
  return {
    website: typeof profile.website === 'string' ? profile.website : '',
    description: typeof profile.description === 'string' ? profile.description : '',
    audience: typeof profile.audience === 'string' ? profile.audience : '',
    contentGoal: typeof profile.contentGoal === 'string' ? profile.contentGoal : '',
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

function StatusRow({
  complete,
  icon: Icon,
  label,
  detail,
}: {
  complete: boolean;
  icon: ElementType;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className={cn(
        'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md',
        complete
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400'
      )}>
        {complete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
          {!complete && <Circle className="h-2.5 w-2.5 text-slate-300 dark:text-slate-600" />}
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { session, isDemoMode } = useAuth();
  const {
    organization,
    organizationId,
    loading: loadingOrganization,
    refresh: refreshOrganization,
  } = useCurrentOrganization();
  const [organizationName, setOrganizationName] = useState('');
  const [profile, setProfile] = useState<OrganizationProfileForm>({});
  const [brandVoice, setBrandVoice] = useState<BrandVoiceForm>(defaultBrandVoiceForm);
  const [campaign, setCampaign] = useState<CampaignForm>(defaultCampaignForm);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [canManageBrandVoice, setCanManageBrandVoice] = useState(false);
  const [canManageCampaigns, setCanManageCampaigns] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session?.access_token]);

  const canManage = Boolean(canManageBrandVoice || canManageCampaigns) && !isDemoMode;
  const onboardingCompleted = Boolean(organization?.onboarding?.completedAt);
  const onboardingSkipped = Boolean(organization?.onboarding?.skippedAt) && !onboardingCompleted;

  const loadSetup = useCallback(async () => {
    if (loadingOrganization) return;
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [brandResponse, campaignResponse, subscriptionResponse] = await Promise.all([
        fetch(withOrganizationId('/api/brand-voices', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/campaigns', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/subscriptions/current', organizationId), {
          headers: authHeaders,
          cache: 'no-store',
        }),
      ]);

      const brandPayload = await brandResponse.json().catch(() => ({}));
      const campaignPayload = await campaignResponse.json().catch(() => ({}));
      const subscriptionPayload = await subscriptionResponse.json().catch(() => ({}));

      if (!brandResponse.ok) throw new Error(brandPayload.error || 'Failed to load brand voice setup');
      if (!campaignResponse.ok) throw new Error(campaignPayload.error || 'Failed to load campaign setup');

      const voices = Array.isArray(brandPayload.brandVoices) ? brandPayload.brandVoices as BrandVoice[] : [];
      const campaigns = Array.isArray(campaignPayload.campaigns) ? campaignPayload.campaigns as Campaign[] : [];

      setCanManageBrandVoice(Boolean(brandPayload.membership?.canManageBrandVoice));
      setCanManageCampaigns(Boolean(campaignPayload.membership?.canManageCampaignLibrary));
      setBrandVoice(voices[0] ? brandVoiceToForm(voices[0]) : defaultBrandVoiceForm);
      setCampaign(campaigns[0] ? campaignToForm(campaigns[0]) : defaultCampaignForm);
      setSubscription(subscriptionResponse.ok ? subscriptionPayload.subscription || null : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load onboarding setup');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, loadingOrganization, organizationId]);

  useEffect(() => {
    if (!organization) return;
    setOrganizationName(organization.name);
    setProfile(parseProfile(organization.onboarding?.metadata?.profile));
  }, [organization]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  const updateProfile = <K extends keyof OrganizationProfileForm>(field: K, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const updateBrandVoice = <K extends keyof BrandVoiceForm>(field: K, value: BrandVoiceForm[K]) => {
    setBrandVoice((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const updateCampaign = <K extends keyof CampaignForm>(field: K, value: CampaignForm[K]) => {
    setCampaign((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const saveOrganizationProfile = async (options: { completed?: boolean; skipped?: boolean } = {}) => {
    if (!organizationId) return null;
    const updated = await updateCurrentOrganizationOnboarding({
      name: organizationName,
      profile,
      onboardingCompleted: options.completed,
      onboardingSkipped: options.skipped,
    }, session?.access_token, organizationId);
    await refreshOrganization();
    return updated;
  };

  const saveBrandVoice = async () => {
    if (!organizationId || !canManageBrandVoice || !brandVoice.name.trim()) return null;
    const isUpdate = Boolean(brandVoice.id);
    const response = await fetch(
      isUpdate
        ? withOrganizationId(`/api/brand-voices/${brandVoice.id}`, organizationId)
        : withOrganizationId('/api/brand-voices', organizationId),
      {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: organizationId,
          name: brandVoice.name,
          description: brandVoice.description,
          tone: brandVoice.tone,
          audience: brandVoice.audience || profile.audience,
          contentPillars: textToList(brandVoice.contentPillarsText),
          bannedPhrases: textToList(brandVoice.bannedPhrasesText),
          ctaPreferences: brandVoice.ctaPreferences,
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Failed to save brand voice');
    const saved = payload.brandVoice as BrandVoice;
    setBrandVoice(brandVoiceToForm(saved));
    return saved;
  };

  const saveCampaign = async () => {
    if (!organizationId || !canManageCampaigns || !campaign.name.trim()) return null;
    const isUpdate = Boolean(campaign.id);
    const response = await fetch(
      isUpdate
        ? withOrganizationId(`/api/campaigns/${campaign.id}`, organizationId)
        : withOrganizationId('/api/campaigns', organizationId),
      {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: organizationId,
          name: campaign.name,
          status: isUpdate ? undefined : 'planned',
          objective: campaign.objective || profile.contentGoal,
          audience: campaign.audience || profile.audience,
          channels: textToList(campaign.channelsText),
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Failed to save campaign');
    const saved = payload.campaign as Campaign;
    setCampaign(campaignToForm(saved));
    return saved;
  };

  const saveSetup = async (complete = false) => {
    if (!canManage || !organizationId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await saveOrganizationProfile();
      await saveBrandVoice();
      await saveCampaign();
      if (complete) {
        await updateCurrentOrganizationOnboarding({
          onboardingCompleted: true,
        }, session?.access_token, organizationId);
        await refreshOrganization();
        setMessage('Onboarding completed. Your workspace is ready for content generation.');
      } else {
        setMessage('Onboarding setup saved.');
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save onboarding setup');
    } finally {
      setSaving(false);
    }
  };

  const skipSetup = async () => {
    if (!organizationId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await saveOrganizationProfile({ skipped: true });
      setMessage('Onboarding skipped. You can return to setup from the sidebar.');
      router.push('/dashboard/hub');
    } catch (skipError) {
      setError(skipError instanceof Error ? skipError.message : 'Failed to skip onboarding');
    } finally {
      setSaving(false);
    }
  };

  const profileComplete = Boolean(organizationName.trim() && (profile.description || profile.contentGoal || profile.audience));
  const brandComplete = Boolean(brandVoice.id || brandVoice.name.trim());
  const campaignComplete = Boolean(campaign.id || campaign.name.trim());
  const billingLabel = formatSubscriptionStatus(subscription?.status);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Setup
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
              Workspace Setup
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Set up the workspace profile, voice, and first campaign so generated content starts with the right context.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organization && <Badge variant="outline">{organization.name}</Badge>}
            {onboardingCompleted && <Badge variant="success">Complete</Badge>}
            {onboardingSkipped && <Badge variant="secondary">Skipped</Badge>}
            {isDemoMode && <Badge variant="warning">Demo</Badge>}
          </div>
        </div>

        {(error || message) && (
          <div
            className={cn(
              'mb-5 rounded-lg border px-4 py-3 text-sm',
              error
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
            )}
          >
            {error || message}
          </div>
        )}

        {loading || loadingOrganization ? (
          <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="h-72 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
            <div className="h-[42rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Setup Status</CardTitle>
                  <CardDescription>Complete what helps your first generation run.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <StatusRow complete={profileComplete} icon={Building2} label="Organization profile" detail="Name, audience, and content goal." />
                  <StatusRow complete={brandComplete} icon={Palette} label="Brand voice" detail="Reusable tone and writing rules." />
                  <StatusRow complete={campaignComplete} icon={FolderKanban} label="First campaign" detail="Context for the first content goal." />
                  <StatusRow complete={Boolean(subscription)} icon={CreditCard} label="Billing entry" detail={billingLabel} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Next Actions</CardTitle>
                  <CardDescription>Keep moving after setup.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Link
                    href="/dashboard/upload"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    <Upload className="h-4 w-4" />
                    Add source material
                  </Link>
                  <Link
                    href="/dashboard/campaigns"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <FolderKanban className="h-4 w-4" />
                    Open campaigns
                  </Link>
                  <Link
                    href="/dashboard/billing"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <CreditCard className="h-4 w-4" />
                    Review billing
                  </Link>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              {!canManage && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                  Organization setup is read-only for your role. Existing dashboard routes remain available.
                </div>
              )}

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-slate-400" />
                    <div>
                      <CardTitle>Organization Profile</CardTitle>
                      <CardDescription>Basic context that belongs to the current workspace.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      id="organization-name"
                      label="Organization name"
                      value={organizationName}
                      onChange={setOrganizationName}
                      disabled={!canManage || saving}
                    />
                    <TextField
                      id="organization-website"
                      label="Website"
                      value={profile.website || ''}
                      onChange={(value) => updateProfile('website', value)}
                      disabled={!canManage || saving}
                      placeholder="https://example.com"
                      type="url"
                    />
                  </div>
                  <TextAreaField
                    id="organization-description"
                    label="Positioning"
                    value={profile.description || ''}
                    onChange={(value) => updateProfile('description', value)}
                    disabled={!canManage || saving}
                    placeholder="What the company does, who it serves, and what makes the point of view distinct."
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextAreaField
                      id="organization-audience"
                      label="Primary audience"
                      value={profile.audience || ''}
                      onChange={(value) => updateProfile('audience', value)}
                      disabled={!canManage || saving}
                      placeholder="Who should this content speak to?"
                      rows={3}
                    />
                    <TextAreaField
                      id="organization-goal"
                      label="First content goal"
                      value={profile.contentGoal || ''}
                      onChange={(value) => updateProfile('contentGoal', value)}
                      disabled={!canManage || saving}
                      placeholder="Example: turn customer calls into launch campaign posts."
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Palette className="h-5 w-5 text-slate-400" />
                    <div>
                      <CardTitle>Brand Voice</CardTitle>
                      <CardDescription>Create or update the default voice used during generation.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      id="brand-voice-name"
                      label="Profile name"
                      value={brandVoice.name}
                      onChange={(value) => updateBrandVoice('name', value)}
                      disabled={!canManageBrandVoice || saving}
                    />
                    <TextField
                      id="brand-tone"
                      label="Tone"
                      value={brandVoice.tone}
                      onChange={(value) => updateBrandVoice('tone', value)}
                      disabled={!canManageBrandVoice || saving}
                      placeholder="Clear, expert, direct"
                    />
                  </div>
                  <TextAreaField
                    id="brand-description"
                    label="Voice notes"
                    value={brandVoice.description}
                    onChange={(value) => updateBrandVoice('description', value)}
                    disabled={!canManageBrandVoice || saving}
                    placeholder="How should the company sound?"
                    rows={3}
                  />
                  <div className="grid gap-4 md:grid-cols-3">
                    <TextAreaField
                      id="brand-audience"
                      label="Audience"
                      value={brandVoice.audience}
                      onChange={(value) => updateBrandVoice('audience', value)}
                      disabled={!canManageBrandVoice || saving}
                      rows={4}
                    />
                    <TextAreaField
                      id="brand-pillars"
                      label="Content pillars"
                      value={brandVoice.contentPillarsText}
                      onChange={(value) => updateBrandVoice('contentPillarsText', value)}
                      disabled={!canManageBrandVoice || saving}
                      placeholder={'One per line\nProduct education\nCustomer proof'}
                      rows={4}
                    />
                    <TextAreaField
                      id="brand-banned"
                      label="Banned phrases"
                      value={brandVoice.bannedPhrasesText}
                      onChange={(value) => updateBrandVoice('bannedPhrasesText', value)}
                      disabled={!canManageBrandVoice || saving}
                      placeholder={'One per line\nRevolutionary\nGame-changing'}
                      rows={4}
                    />
                  </div>
                  <TextAreaField
                    id="brand-cta"
                    label="CTA preference"
                    value={brandVoice.ctaPreferences}
                    onChange={(value) => updateBrandVoice('ctaPreferences', value)}
                    disabled={!canManageBrandVoice || saving}
                    placeholder="How should generated content ask readers to take the next step?"
                    rows={3}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <FolderKanban className="h-5 w-5 text-slate-400" />
                    <div>
                      <CardTitle>First Campaign</CardTitle>
                      <CardDescription>Optional campaign context for the first content run.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      id="campaign-name"
                      label="Campaign name"
                      value={campaign.name}
                      onChange={(value) => updateCampaign('name', value)}
                      disabled={!canManageCampaigns || saving}
                    />
                    <TextField
                      id="campaign-audience"
                      label="Audience"
                      value={campaign.audience}
                      onChange={(value) => updateCampaign('audience', value)}
                      disabled={!canManageCampaigns || saving}
                      placeholder="RevOps leaders, founders, product marketers"
                    />
                  </div>
                  <TextAreaField
                    id="campaign-objective"
                    label="Objective"
                    value={campaign.objective}
                    onChange={(value) => updateCampaign('objective', value)}
                    disabled={!canManageCampaigns || saving}
                    placeholder="What should the next generated content support?"
                    rows={3}
                  />
                  <TextAreaField
                    id="campaign-channels"
                    label="Channels"
                    value={campaign.channelsText}
                    onChange={(value) => updateCampaign('channelsText', value)}
                    disabled={!canManageCampaigns || saving}
                    placeholder={'One per line\nLinkedIn\nEmail'}
                    rows={3}
                  />
                </CardContent>
              </Card>

              <div className="sticky bottom-0 z-10 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    {onboardingCompleted ? 'Setup is marked complete.' : 'Save setup or mark onboarding complete.'}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={skipSetup}
                      disabled={saving || !canManage}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      <SkipForward className="h-4 w-4" />
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={() => saveSetup(false)}
                      disabled={saving || !canManage || !organizationName.trim()}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => saveSetup(true)}
                      disabled={saving || !canManage || !organizationName.trim()}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Complete setup
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
