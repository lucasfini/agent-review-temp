"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  FolderKanban,
  Loader2,
  Mic2,
  PenLine,
  Upload,
  UserRound,
  Volume2,
} from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/context';
import { isRequiredOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

type OnboardingState = {
  status: OnboardingStatus;
  stepIndex: number;
  totalSteps: number;
  profile: {
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
  };
  workspace: {
    id: string;
    name: string;
    type: string;
    role?: string;
    status?: string;
  } | null;
};

type GuidedOnboardingModalProps = {
  onActiveChange?: (active: boolean) => void;
};

type StatusUpdateOptions = {
  skipped?: boolean;
  destination?: string;
  metadata?: Record<string, unknown>;
};

const stepLabels = ['Account', 'Workspace', 'Studio Profile', 'Voice', 'Plan', 'Upload'];

const inputClassName =
  'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900';

const textareaClassName = cn(inputClassName, 'min-h-24 resize-y leading-6');

const emptyStudioProfileForm = {
  name: 'Main profile',
  website: '',
  positioning: '',
  audience: '',
  contentGoal: '',
};

const emptyVoiceForm = {
  name: 'Default voice',
  tone: '',
  audience: '',
  description: '',
  contentPillars: '',
};

const emptyPlanForm = {
  name: 'First content plan',
  objective: '',
  audience: '',
  channels: '',
};

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusCopy(status: OnboardingStatus) {
  if (status === 'profile_pending') {
    return {
      title: 'Finish your account profile',
      description: 'Add your name so account activity, workspace setup, and generated content are tied to the right person.',
      Icon: UserRound,
    };
  }

  if (status === 'workspace_pending') {
    return {
      title: 'Set up workspace identity',
      description: 'Name the workspace that will hold uploads, generated content, team settings, and billing. You can skip this and keep using a personal workspace.',
      Icon: Building2,
    };
  }

  if (status === 'profile_intro_pending') {
    return {
      title: 'Create a Studio profile',
      description: 'Give Studio brand, audience, and content-goal context so generated drafts are specific instead of generic.',
      Icon: FileText,
    };
  }

  if (status === 'voice_intro_pending') {
    return {
      title: 'Create a brand voice',
      description: 'Save a reusable voice profile for tone, audience, and language preferences.',
      Icon: Volume2,
    };
  }

  if (status === 'plan_intro_pending') {
    return {
      title: 'Create a content plan',
      description: 'Save a lightweight plan for campaign objective, audience, and channels.',
      Icon: FolderKanban,
    };
  }

  return {
    title: 'You are ready to upload',
    description: 'Upload a call, demo, webinar, podcast, meeting, interview, or internal update. AudioRepurpose will turn it into transcripts, insights, quotes, and reusable drafts.',
    Icon: Upload,
  };
}

function FieldLabel({
  htmlFor,
  children,
  help,
  example,
}: {
  htmlFor: string;
  children: ReactNode;
  help: string;
  example: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        {children}
      </label>
      <HoverCardPrimitive.Root openDelay={100} closeDelay={80}>
        <HoverCardPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={`Help for ${String(children)}`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold leading-none text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-300"
          >
            ?
          </button>
        </HoverCardPrimitive.Trigger>
        <HoverCardPrimitive.Portal>
          <HoverCardPrimitive.Content
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            className="z-50 w-[min(17rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xl outline-none dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-xs leading-5 text-slate-700 dark:text-slate-200">{help}</p>
            <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Example:</span> {example}
            </p>
          </HoverCardPrimitive.Content>
        </HoverCardPrimitive.Portal>
      </HoverCardPrimitive.Root>
    </div>
  );
}

export function GuidedOnboardingModal({ onActiveChange }: GuidedOnboardingModalProps) {
  const { session, user, loading: authLoading, isDemoMode } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '' });
  const [workspaceForm, setWorkspaceForm] = useState({ name: '', roleTitle: '', teamSize: '' });
  const [studioProfileForm, setStudioProfileForm] = useState(emptyStudioProfileForm);
  const [voiceForm, setVoiceForm] = useState(emptyVoiceForm);
  const [planForm, setPlanForm] = useState(emptyPlanForm);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, [session?.access_token]);

  const loadState = useCallback(async () => {
    if (!user?.id || isDemoMode) {
      setState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/onboarding/status', {
        headers: authHeaders,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load onboarding');
      }

      const nextState = payload as OnboardingState;
      setState(nextState);
      setProfileForm({
        firstName: nextState.profile.firstName || '',
        lastName: nextState.profile.lastName || '',
      });
      setWorkspaceForm((current) => ({
        ...current,
        name: current.name || nextState.workspace?.name || '',
      }));
      setStudioProfileForm((current) => ({
        ...current,
        name: current.name || (nextState.workspace?.name ? `${nextState.workspace.name} profile` : 'Main profile'),
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load onboarding');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isDemoMode, user?.id]);

  useEffect(() => {
    if (!authLoading) {
      void loadState();
    }
  }, [authLoading, loadState]);

  const open = Boolean(!authLoading && !loading && state && state.status !== 'complete' && !isDemoMode);
  const required = state ? isRequiredOnboardingStatus(state.status) : false;

  useEffect(() => {
    onActiveChange?.(open);
  }, [onActiveChange, open]);

  useEffect(() => {
    if (!open || !state) return;
    if (required && pathname !== '/dashboard/onboarding') {
      router.replace('/dashboard/onboarding');
    }
  }, [open, pathname, required, router, state]);

  useEffect(() => {
    if (!state || state.status !== 'complete' || pathname !== '/dashboard/onboarding') return;
    router.replace('/dashboard');
  }, [pathname, router, state]);

  const updateStatus = async (status: OnboardingStatus, options: StatusUpdateOptions = {}) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/onboarding/status', {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          skipped: options.skipped || undefined,
          metadata: options.metadata,
        }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update onboarding');
      }
      setState(payload as OnboardingState);
      if (options.destination) {
        router.push(options.destination);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update onboarding');
    } finally {
      setSaving(false);
    }
  };

  const saveAccountProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/onboarding/profile', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileForm),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save profile');
      }
      setState(payload as OnboardingState);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const saveWorkspace = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/onboarding/workspace', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(workspaceForm),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create workspace');
      }
      setState(payload as OnboardingState);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to create workspace');
    } finally {
      setSaving(false);
    }
  };

  const saveStudioProfile = async () => {
    const name = studioProfileForm.name.trim();
    if (!name) {
      setError('Profile name is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/creator-profiles', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          website: studioProfileForm.website,
          positioning: studioProfileForm.positioning,
          audience: studioProfileForm.audience,
          contentGoal: studioProfileForm.contentGoal,
          isDefault: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create Studio profile');
      }
      await updateStatus('voice_intro_pending', {
        metadata: {
          studioProfileSavedAt: new Date().toISOString(),
          creatorProfileId: payload.creatorProfile?.id,
        },
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to create Studio profile');
      setSaving(false);
    }
  };

  const saveVoice = async () => {
    const name = voiceForm.name.trim();
    if (!name) {
      setError('Voice name is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/brand-voices', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          tone: voiceForm.tone,
          audience: voiceForm.audience,
          description: voiceForm.description,
          contentPillars: splitList(voiceForm.contentPillars),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create brand voice');
      }
      await updateStatus('plan_intro_pending', {
        metadata: {
          voiceSavedAt: new Date().toISOString(),
          brandVoiceId: payload.brandVoice?.id,
        },
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to create brand voice');
      setSaving(false);
    }
  };

  const savePlan = async () => {
    const name = planForm.name.trim();
    if (!name) {
      setError('Plan name is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          objective: planForm.objective,
          audience: planForm.audience,
          channels: splitList(planForm.channels),
          approvalRequired: false,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create content plan');
      }
      await updateStatus('upload_intro_pending', {
        metadata: {
          planSavedAt: new Date().toISOString(),
          campaignId: payload.campaign?.id,
        },
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to create content plan');
      setSaving(false);
    }
  };

  const skipCurrentStep = async () => {
    if (!state) return;

    if (state.status === 'workspace_pending') {
      await updateStatus('profile_intro_pending', {
        skipped: true,
        metadata: { workspaceSkippedAt: new Date().toISOString() },
      });
    } else if (state.status === 'profile_intro_pending') {
      await updateStatus('voice_intro_pending', {
        skipped: true,
        metadata: { studioProfileSkippedAt: new Date().toISOString() },
      });
    } else if (state.status === 'voice_intro_pending') {
      await updateStatus('plan_intro_pending', {
        skipped: true,
        metadata: { voiceSkippedAt: new Date().toISOString() },
      });
    } else if (state.status === 'plan_intro_pending') {
      await updateStatus('upload_intro_pending', {
        skipped: true,
        metadata: { planSkippedAt: new Date().toISOString() },
      });
    } else if (state.status === 'upload_intro_pending') {
      await updateStatus('complete', {
        skipped: true,
        destination: '/dashboard',
        metadata: { uploadIntroSkippedAt: new Date().toISOString() },
      });
    }
  };

  const completeOnboarding = async (destination: string, skipped = false) => {
    await updateStatus('complete', { skipped, destination });
  };

  if (!open || !state) return null;

  const progress = Math.max(1, Math.min(state.totalSteps, state.stepIndex));
  const copy = statusCopy(state.status);
  const CopyIcon = copy.Icon;

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next && !required && state.status !== 'complete') {
        void updateStatus('complete', { skipped: true });
      }
    }}>
      <DialogContent
        className={cn(
          'w-[calc(100vw-1rem)] max-w-[660px] gap-0 overflow-hidden rounded-xl border-slate-200 bg-white p-0 shadow-2xl sm:w-[min(92vw,660px)] dark:border-slate-800 dark:bg-slate-950',
          required && '[&>button]:hidden'
        )}
      >
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-h-[min(760px,calc(100dvh-6rem))]">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-5 dark:border-slate-800 dark:bg-slate-900/70 sm:px-7">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                Step {progress} of {state.totalSteps}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {stepLabels.map((label, index) => {
                  const active = index + 1 <= progress;
                  return (
                    <span
                      key={label}
                      className={cn(
                        'h-1.5 flex-1 rounded-full',
                        active ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-800'
                      )}
                      title={label}
                    />
                  );
                })}
              </div>
            </div>

            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 text-2xl font-semibold leading-tight text-slate-950 dark:text-slate-50">
                <CopyIcon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                {copy.title}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {copy.description}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-5 py-5 dark:bg-slate-950 sm:px-7 sm:py-6">
            {state.status === 'profile_pending' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel
                    htmlFor="onboarding-first-name"
                    help="Your given name for account personalization."
                    example="Lucas"
                  >
                    First name
                  </FieldLabel>
                  <input
                    id="onboarding-first-name"
                    value={profileForm.firstName}
                    onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))}
                    disabled={saving}
                    autoComplete="given-name"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="onboarding-last-name"
                    help="Your family name for profile and team records."
                    example="North"
                  >
                    Last name
                  </FieldLabel>
                  <input
                    id="onboarding-last-name"
                    value={profileForm.lastName}
                    onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))}
                    disabled={saving}
                    autoComplete="family-name"
                    className={inputClassName}
                  />
                </div>
              </div>
            )}

            {state.status === 'workspace_pending' && (
              <div className="space-y-4">
                <div>
                  <FieldLabel
                    htmlFor="onboarding-workspace-name"
                    help="The team or company space for projects."
                    example="Acme Content Team"
                  >
                    Workspace name
                  </FieldLabel>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="onboarding-workspace-name"
                      value={workspaceForm.name}
                      onChange={(event) => setWorkspaceForm((current) => ({ ...current, name: event.target.value }))}
                      disabled={saving}
                      className={cn(inputClassName, 'pl-9')}
                      placeholder="Acme Content Team"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel
                      htmlFor="onboarding-role"
                      help="Your main responsibility in the workspace."
                      example="Marketing lead"
                    >
                      Role/title
                    </FieldLabel>
                    <input
                      id="onboarding-role"
                      value={workspaceForm.roleTitle}
                      onChange={(event) => setWorkspaceForm((current) => ({ ...current, roleTitle: event.target.value }))}
                      disabled={saving}
                      className={inputClassName}
                      placeholder="Marketing lead"
                    />
                  </div>
                  <div>
                    <FieldLabel
                      htmlFor="onboarding-team-size"
                      help="Approximate number of teammates using this."
                      example="1-5"
                    >
                      Team size
                    </FieldLabel>
                    <input
                      id="onboarding-team-size"
                      value={workspaceForm.teamSize}
                      onChange={(event) => setWorkspaceForm((current) => ({ ...current, teamSize: event.target.value }))}
                      disabled={saving}
                      className={inputClassName}
                      placeholder="1-5"
                    />
                  </div>
                </div>
              </div>
            )}

            {state.status === 'profile_intro_pending' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel
                      htmlFor="studio-profile-name"
                      help="A label for this brand or creator context."
                      example="Main profile"
                    >
                      Profile name
                    </FieldLabel>
                    <input
                      id="studio-profile-name"
                      value={studioProfileForm.name}
                      onChange={(event) => setStudioProfileForm((current) => ({ ...current, name: event.target.value }))}
                      disabled={saving}
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <FieldLabel
                      htmlFor="studio-profile-website"
                      help="A site Studio can reference for context."
                      example="https://example.com"
                    >
                      Website
                    </FieldLabel>
                    <input
                      id="studio-profile-website"
                      type="url"
                      value={studioProfileForm.website}
                      onChange={(event) => setStudioProfileForm((current) => ({ ...current, website: event.target.value }))}
                      disabled={saving}
                      className={inputClassName}
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel
                    htmlFor="studio-profile-positioning"
                    help="What makes your offer different."
                    example="Workflow automation for B2B content teams."
                  >
                    Positioning
                  </FieldLabel>
                  <textarea
                    id="studio-profile-positioning"
                    value={studioProfileForm.positioning}
                    onChange={(event) => setStudioProfileForm((current) => ({ ...current, positioning: event.target.value }))}
                    disabled={saving}
                    className={textareaClassName}
                    placeholder="What should Studio understand about your offer and differentiators?"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel
                      htmlFor="studio-profile-audience"
                      help="Who your content should speak to."
                      example="B2B founders and marketing leads."
                    >
                      Audience
                    </FieldLabel>
                    <textarea
                      id="studio-profile-audience"
                      value={studioProfileForm.audience}
                      onChange={(event) => setStudioProfileForm((current) => ({ ...current, audience: event.target.value }))}
                      disabled={saving}
                      className={textareaClassName}
                      placeholder="Who is this content for?"
                    />
                  </div>
                  <div>
                    <FieldLabel
                      htmlFor="studio-profile-goal"
                      help="The outcome your content should support."
                      example="Turn demos into launch content."
                    >
                      Content goal
                    </FieldLabel>
                    <textarea
                      id="studio-profile-goal"
                      value={studioProfileForm.contentGoal}
                      onChange={(event) => setStudioProfileForm((current) => ({ ...current, contentGoal: event.target.value }))}
                      disabled={saving}
                      className={textareaClassName}
                      placeholder="What should this content help accomplish?"
                    />
                  </div>
                </div>
              </div>
            )}

            {state.status === 'voice_intro_pending' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel
                      htmlFor="voice-name"
                      help="A reusable name for this writing style."
                      example="Default voice"
                    >
                      Voice name
                    </FieldLabel>
                    <input
                      id="voice-name"
                      value={voiceForm.name}
                      onChange={(event) => setVoiceForm((current) => ({ ...current, name: event.target.value }))}
                      disabled={saving}
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <FieldLabel
                      htmlFor="voice-tone"
                      help="How the content should sound."
                      example="Clear, direct, expert"
                    >
                      Tone
                    </FieldLabel>
                    <input
                      id="voice-tone"
                      value={voiceForm.tone}
                      onChange={(event) => setVoiceForm((current) => ({ ...current, tone: event.target.value }))}
                      disabled={saving}
                      className={inputClassName}
                      placeholder="Clear, direct, expert"
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel
                    htmlFor="voice-audience"
                    help="The reader this voice is written for."
                    example="Operators evaluating AI workflows."
                  >
                    Audience
                  </FieldLabel>
                  <textarea
                    id="voice-audience"
                    value={voiceForm.audience}
                    onChange={(event) => setVoiceForm((current) => ({ ...current, audience: event.target.value }))}
                    disabled={saving}
                    className={textareaClassName}
                    placeholder="Who should this voice speak to?"
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="voice-description"
                    help="Style rules, phrases, or things to avoid."
                    example="Specific, concise, no hype."
                  >
                    Voice notes
                  </FieldLabel>
                  <textarea
                    id="voice-description"
                    value={voiceForm.description}
                    onChange={(event) => setVoiceForm((current) => ({ ...current, description: event.target.value }))}
                    disabled={saving}
                    className={textareaClassName}
                    placeholder="Point of view, style rules, phrases to favor, or what to avoid."
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="voice-pillars"
                    help="Core topics this voice should return to."
                    example="Customer education, product proof"
                  >
                    Content pillars
                  </FieldLabel>
                  <textarea
                    id="voice-pillars"
                    value={voiceForm.contentPillars}
                    onChange={(event) => setVoiceForm((current) => ({ ...current, contentPillars: event.target.value }))}
                    disabled={saving}
                    className={cn(textareaClassName, 'min-h-20')}
                    placeholder="One per line or comma-separated"
                  />
                </div>
              </div>
            )}

            {state.status === 'plan_intro_pending' && (
              <div className="space-y-4">
                <div>
                  <FieldLabel
                    htmlFor="plan-name"
                    help="A short name for this content plan."
                    example="Launch repurposing plan"
                  >
                    Plan name
                  </FieldLabel>
                  <input
                    id="plan-name"
                    value={planForm.name}
                    onChange={(event) => setPlanForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={saving}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="plan-objective"
                    help="What this plan should accomplish."
                    example="Create weekly sales-led posts."
                  >
                    Objective
                  </FieldLabel>
                  <textarea
                    id="plan-objective"
                    value={planForm.objective}
                    onChange={(event) => setPlanForm((current) => ({ ...current, objective: event.target.value }))}
                    disabled={saving}
                    className={textareaClassName}
                    placeholder="What should this recurring content plan accomplish?"
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="plan-audience"
                    help="The target reader for plan outputs."
                    example="B2B buyers comparing tools."
                  >
                    Audience
                  </FieldLabel>
                  <textarea
                    id="plan-audience"
                    value={planForm.audience}
                    onChange={(event) => setPlanForm((current) => ({ ...current, audience: event.target.value }))}
                    disabled={saving}
                    className={textareaClassName}
                    placeholder="Who should the outputs target?"
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="plan-channels"
                    help="Where the repurposed content will go."
                    example="LinkedIn, newsletter, blog"
                  >
                    Channels
                  </FieldLabel>
                  <textarea
                    id="plan-channels"
                    value={planForm.channels}
                    onChange={(event) => setPlanForm((current) => ({ ...current, channels: event.target.value }))}
                    disabled={saving}
                    className={cn(textareaClassName, 'min-h-20')}
                    placeholder="LinkedIn, newsletter, blog, internal update"
                  />
                </div>
              </div>
            )}

            {state.status === 'upload_intro_pending' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">What happens next</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      Upload any recording and the app will process it into a transcript, speaker-aware notes, insights, quotes, and reusable drafts.
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                  {['Transcript', 'Speaker detection', 'Summaries and insights', 'Quotes and key moments', 'Publish-ready drafts'].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
              {required && (
                <div className="min-h-5 w-full text-xs text-slate-500 dark:text-slate-400">
                  Account name is required. Everything after this can be skipped.
                </div>
              )}
              <div className="mt-3 flex w-full gap-2">
                {!required && (
                  <button
                    type="button"
                    onClick={() => void skipCurrentStep()}
                    disabled={saving}
                    className="inline-flex min-h-11 basis-1/4 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Skip
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (state.status === 'profile_pending') void saveAccountProfile();
                    else if (state.status === 'workspace_pending') void saveWorkspace();
                    else if (state.status === 'profile_intro_pending') void saveStudioProfile();
                    else if (state.status === 'voice_intro_pending') void saveVoice();
                    else if (state.status === 'plan_intro_pending') void savePlan();
                    else void completeOnboarding('/dashboard/upload');
                  }}
                  disabled={saving}
                  className={cn(
                    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60',
                    required ? 'w-full' : 'basis-3/4'
                  )}
                >
                  {saving
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : state.status === 'profile_pending'
                      ? <PenLine className="h-4 w-4" />
                      : state.status === 'workspace_pending'
                        ? <Building2 className="h-4 w-4" />
                        : state.status === 'upload_intro_pending'
                          ? <Mic2 className="h-4 w-4" />
                          : <ArrowRight className="h-4 w-4" />}
                  {state.status === 'profile_pending'
                    ? 'Next'
                    : state.status === 'workspace_pending'
                      ? 'Save workspace'
                      : state.status === 'profile_intro_pending'
                        ? 'Save profile'
                        : state.status === 'voice_intro_pending'
                          ? 'Save voice'
                          : state.status === 'plan_intro_pending'
                            ? 'Save plan'
                            : 'Upload first recording'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
