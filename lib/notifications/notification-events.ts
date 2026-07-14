import {
  createOrganizationNotification,
  type OrganizationNotification,
  type OrganizationNotificationType,
} from '@/lib/notifications/organization-notifications';
import { formatProductCredits } from '@/lib/billing/product-credits';

type NotifyInput = {
  organizationId?: string | null;
  actorUserId?: string | null;
  type: OrganizationNotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

type ProjectNotificationInput = {
  organizationId?: string | null;
  actorUserId?: string | null;
  projectId: string;
  projectTitle?: string | null;
  count?: number;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

type SimpleNotificationInput = {
  organizationId?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

export function projectNotificationHref(projectId?: string | null): string {
  return projectId ? `/dashboard/projects?id=${encodeURIComponent(projectId)}` : '/dashboard/projects';
}

function cleanLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || fallback;
}

function itemLabel(count: number | null | undefined): string {
  const value = Math.max(1, Number(count || 1));
  return `${value} ${value === 1 ? 'item' : 'items'}`;
}

function itemReadyBody(count: number | null | undefined, projectTitle: string | null | undefined): string {
  const value = Math.max(1, Number(count || 1));
  const verb = value === 1 ? 'is' : 'are';
  return `${itemLabel(value)} ${verb} ready in ${cleanLabel(projectTitle, 'this project')}.`;
}

export function notificationCopy() {
  return {
    contentGenerating: (count: number | null | undefined, projectTitle: string | null | undefined) => ({
      title: 'Content generating',
      body: `We're creating ${itemLabel(count)} for ${cleanLabel(projectTitle, 'this project')}.`,
    }),
    contentGenerated: (count: number | null | undefined, projectTitle: string | null | undefined) => ({
      title: 'Content generated',
      body: itemReadyBody(count, projectTitle),
    }),
    contentFailed: (projectTitle: string | null | undefined) => ({
      title: 'Content failed',
      body: `We couldn't create content for ${cleanLabel(projectTitle, 'this project')}. Try again.`,
    }),
    uploadStarted: (projectTitle: string | null | undefined) => ({
      title: 'Upload started',
      body: `${cleanLabel(projectTitle, 'Your file')} is uploading.`,
    }),
    uploadReceived: (projectTitle: string | null | undefined) => ({
      title: 'Upload received',
      body: `${cleanLabel(projectTitle, 'Your file')} is ready for transcription.`,
    }),
    uploadFailed: (projectTitle: string | null | undefined) => ({
      title: 'Upload failed',
      body: `We couldn't upload ${cleanLabel(projectTitle, 'your file')}. Try again.`,
    }),
    transcriptReady: (projectTitle: string | null | undefined) => ({
      title: 'Transcript ready',
      body: `${cleanLabel(projectTitle, 'Your project')} is ready to review.`,
    }),
    transcriptFailed: (projectTitle: string | null | undefined) => ({
      title: 'Transcript failed',
      body: `We couldn't transcribe ${cleanLabel(projectTitle, 'your project')}. Try again.`,
    }),
    importComplete: (sourceName: string | null | undefined, projectTitle: string | null | undefined) => ({
      title: 'Import complete',
      body: `${cleanLabel(sourceName, 'Your source')} was added as ${cleanLabel(projectTitle, 'a project')}.`,
    }),
    importFailed: (sourceName: string | null | undefined) => ({
      title: 'Import failed',
      body: `We couldn't import from ${cleanLabel(sourceName, 'that source')}. Try again or upload the file.`,
    }),
    planUpdated: (planName: string | null | undefined, scheduled = false) => ({
      title: 'Plan updated',
      body: scheduled
        ? `${cleanLabel(planName, 'Your plan')} will start on your next billing period.`
        : `${cleanLabel(planName, 'Your plan')} is now active.`,
    }),
    paymentFailed: () => ({
      title: 'Payment failed',
      body: 'Update billing to keep your workspace active.',
    }),
    creditsAdded: (credits: number | null | undefined) => ({
      title: 'Credits added',
      body: `${formatProductCredits(Number(credits || 0))} credits were added to your workspace.`,
    }),
    creditsLow: (credits: number | null | undefined) => ({
      title: 'Credits running low',
      body: `Your workspace has ${formatProductCredits(Number(credits || 0))} credits left.`,
    }),
    creditsDepleted: () => ({
      title: 'Credits used up',
      body: 'Add credits or upgrade to keep processing.',
    }),
    inviteSent: (email: string | null | undefined, role: string | null | undefined) => ({
      title: 'Invite sent',
      body: `${cleanLabel(email, 'A teammate')} was invited as ${cleanLabel(role, 'a member')}.`,
    }),
    memberJoined: (email: string | null | undefined) => ({
      title: 'Team member joined',
      body: `${cleanLabel(email, 'A teammate')} joined the workspace.`,
    }),
    roleUpdated: (email: string | null | undefined, role: string | null | undefined) => ({
      title: 'Role updated',
      body: `${cleanLabel(email, 'A teammate')} is now ${cleanLabel(role, 'a member')}.`,
    }),
    memberRemoved: (email: string | null | undefined) => ({
      title: 'Team member removed',
      body: `${cleanLabel(email, 'A teammate')} was removed from the workspace.`,
    }),
    sharedWithTeam: (name: string | null | undefined) => ({
      title: 'Shared with team',
      body: `${cleanLabel(name, 'This item')} is now available to the team.`,
    }),
    movedToPrivate: (name: string | null | undefined) => ({
      title: 'Moved to private',
      body: `${cleanLabel(name, 'This item')} is no longer shared with the team.`,
    }),
    addedToLibrary: (name: string | null | undefined) => ({
      title: 'Added to library',
      body: `${cleanLabel(name, 'This item')} was added to the content library.`,
    }),
  };
}

export async function notifyOrganization(input: NotifyInput): Promise<OrganizationNotification | null> {
  if (!input.organizationId) return null;

  try {
    return await createOrganizationNotification({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId || null,
      type: input.type,
      title: input.title,
      body: input.body || null,
      href: input.href || null,
      idempotencyKey: input.idempotencyKey || null,
      metadata: {
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.metadata || {}),
      },
    });
  } catch (error) {
    console.warn('[NOTIFICATIONS] Failed to create notification:', error);
    return null;
  }
}

export async function notifyContentGenerationStarted(input: ProjectNotificationInput) {
  const copy = notificationCopy().contentGenerating(input.count, input.projectTitle);
  return notifyOrganization({
    ...input,
    type: 'content_generation_started',
    title: copy.title,
    body: copy.body,
    href: projectNotificationHref(input.projectId),
    idempotencyKey: input.idempotencyKey || `content_generation_started:${input.projectId}`,
  });
}

export async function notifyContentGenerated(input: ProjectNotificationInput) {
  const copy = notificationCopy().contentGenerated(input.count, input.projectTitle);
  return notifyOrganization({
    ...input,
    type: 'content_generated',
    title: copy.title,
    body: copy.body,
    href: projectNotificationHref(input.projectId),
    idempotencyKey: input.idempotencyKey || `content_generated:${input.projectId}:${input.count || 1}`,
  });
}

export async function notifyContentGenerationFailed(input: ProjectNotificationInput) {
  const copy = notificationCopy().contentFailed(input.projectTitle);
  return notifyOrganization({
    ...input,
    type: 'content_generation_failed',
    title: copy.title,
    body: copy.body,
    href: projectNotificationHref(input.projectId),
    idempotencyKey: input.idempotencyKey || `content_generation_failed:${input.projectId}`,
  });
}

export async function notifyUploadStarted(input: ProjectNotificationInput) {
  const copy = notificationCopy().uploadStarted(input.projectTitle);
  return notifyOrganization({
    ...input,
    type: 'upload_started',
    title: copy.title,
    body: copy.body,
    href: projectNotificationHref(input.projectId),
    idempotencyKey: input.idempotencyKey || `upload_started:${input.projectId}`,
  });
}

export async function notifyUploadReceived(input: ProjectNotificationInput) {
  const copy = notificationCopy().uploadReceived(input.projectTitle);
  return notifyOrganization({
    ...input,
    type: 'upload_completed',
    title: copy.title,
    body: copy.body,
    href: projectNotificationHref(input.projectId),
    idempotencyKey: input.idempotencyKey || `upload_received:${input.projectId}`,
  });
}

export async function notifyUploadFailed(input: ProjectNotificationInput) {
  const copy = notificationCopy().uploadFailed(input.projectTitle);
  return notifyOrganization({
    ...input,
    type: 'upload_failed',
    title: copy.title,
    body: copy.body,
    href: projectNotificationHref(input.projectId),
    idempotencyKey: input.idempotencyKey || `upload_failed:${input.projectId}`,
  });
}

export async function notifyTranscriptReady(input: ProjectNotificationInput) {
  const copy = notificationCopy().transcriptReady(input.projectTitle);
  return notifyOrganization({
    ...input,
    type: 'transcription_completed',
    title: copy.title,
    body: copy.body,
    href: projectNotificationHref(input.projectId),
    idempotencyKey: input.idempotencyKey || `transcript_ready:${input.projectId}`,
  });
}

export async function notifyTranscriptFailed(input: ProjectNotificationInput) {
  const copy = notificationCopy().transcriptFailed(input.projectTitle);
  return notifyOrganization({
    ...input,
    type: 'transcription_failed',
    title: copy.title,
    body: copy.body,
    href: projectNotificationHref(input.projectId),
    idempotencyKey: input.idempotencyKey || `transcript_failed:${input.projectId}`,
  });
}

export async function notifyImportComplete(input: ProjectNotificationInput & { sourceName?: string | null }) {
  const copy = notificationCopy().importComplete(input.sourceName, input.projectTitle);
  return notifyOrganization({
    ...input,
    type: 'integration_import_completed',
    title: copy.title,
    body: copy.body,
    href: projectNotificationHref(input.projectId),
    idempotencyKey: input.idempotencyKey || `import_complete:${input.sourceName || 'source'}:${input.projectId}`,
  });
}

export async function notifyImportFailed(input: SimpleNotificationInput & { sourceName?: string | null }) {
  const copy = notificationCopy().importFailed(input.sourceName);
  return notifyOrganization({
    ...input,
    type: 'integration_import_failed',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/integrations',
    idempotencyKey: input.idempotencyKey || null,
  });
}

export async function notifyPlanUpdated(input: SimpleNotificationInput & { planName?: string | null; scheduled?: boolean }) {
  const copy = notificationCopy().planUpdated(input.planName, input.scheduled);
  return notifyOrganization({
    ...input,
    type: 'plan_changed',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/billing',
  });
}

export async function notifyPaymentFailed(input: SimpleNotificationInput) {
  const copy = notificationCopy().paymentFailed();
  return notifyOrganization({
    ...input,
    type: 'payment_failed',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/billing',
  });
}

export async function notifyCreditsAdded(input: SimpleNotificationInput & { credits?: number | null }) {
  const copy = notificationCopy().creditsAdded(input.credits);
  return notifyOrganization({
    ...input,
    type: 'top_up_purchased',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/billing',
  });
}

export async function notifyCreditsLow(input: SimpleNotificationInput & { credits?: number | null }) {
  const copy = notificationCopy().creditsLow(input.credits);
  return notifyOrganization({
    ...input,
    type: 'credits_low',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/billing',
  });
}

export async function notifyCreditsDepleted(input: SimpleNotificationInput) {
  const copy = notificationCopy().creditsDepleted();
  return notifyOrganization({
    ...input,
    type: 'credits_depleted',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/billing',
  });
}

export async function notifyInviteSent(input: SimpleNotificationInput & { email?: string | null; role?: string | null }) {
  const copy = notificationCopy().inviteSent(input.email, input.role);
  return notifyOrganization({
    ...input,
    type: 'team_member_invited',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/team',
  });
}

export async function notifyMemberJoined(input: SimpleNotificationInput & { email?: string | null }) {
  const copy = notificationCopy().memberJoined(input.email);
  return notifyOrganization({
    ...input,
    type: 'team_member_joined',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/team',
  });
}

export async function notifyRoleUpdated(input: SimpleNotificationInput & { email?: string | null; role?: string | null }) {
  const copy = notificationCopy().roleUpdated(input.email, input.role);
  return notifyOrganization({
    ...input,
    type: 'team_member_role_changed',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/team',
  });
}

export async function notifyMemberRemoved(input: SimpleNotificationInput & { email?: string | null }) {
  const copy = notificationCopy().memberRemoved(input.email);
  return notifyOrganization({
    ...input,
    type: 'team_member_removed',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/team',
  });
}

export async function notifySharedWithTeam(input: SimpleNotificationInput & { name?: string | null; href?: string | null }) {
  const copy = notificationCopy().sharedWithTeam(input.name);
  return notifyOrganization({
    ...input,
    type: 'asset_shared',
    title: copy.title,
    body: copy.body,
    href: input.href || '/dashboard/studio',
  });
}

export async function notifyMovedToPrivate(input: SimpleNotificationInput & { name?: string | null; href?: string | null }) {
  const copy = notificationCopy().movedToPrivate(input.name);
  return notifyOrganization({
    ...input,
    type: 'asset_unshared',
    title: copy.title,
    body: copy.body,
    href: input.href || '/dashboard/studio',
  });
}

export async function notifyAddedToLibrary(input: SimpleNotificationInput & { name?: string | null; projectId?: string | null }) {
  const copy = notificationCopy().addedToLibrary(input.name);
  return notifyOrganization({
    ...input,
    type: 'library_item_added',
    title: copy.title,
    body: copy.body,
    href: '/dashboard/library',
  });
}
