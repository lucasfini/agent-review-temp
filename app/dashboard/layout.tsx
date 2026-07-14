"use client";

import { useState, useEffect, Suspense } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import DashboardNav from '@/components/dashboard/nav';
import DashboardTopBar from '@/components/dashboard/top-bar';
import { Loader2 } from 'lucide-react';
import { CoverageProgressProvider } from '@/lib/context/coverage-progress';
import { CoverageBanner } from '@/app/dashboard/_banners/coverage-banner';
import { GuidedOnboardingModal } from '@/components/dashboard/guided-onboarding-modal';
import CompactFooter from '@/components/site/CompactFooter';
import { calculateOverallProgress, getUserFacingProcessingMessage } from '@/lib/tier-progress-config';
import { normalizeTier } from '@/lib/tier-config';
import { useActiveProcessingProjects, type ActiveProcessingProject } from '@/lib/hooks/useActiveProcessingProjects';
import { UploadProgressSyncProvider, useUploadProgressSync, type SyncedUploadProgressItem } from '@/lib/context/upload-progress-sync';

function isSyncedUploadProgressItem(
  upload: ActiveProcessingProject | SyncedUploadProgressItem
): upload is SyncedUploadProgressItem {
  return 'processingTier' in upload;
}

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { syncedUploads } = useUploadProgressSync();

  const { user, loading, isDemoMode } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isUploadRoute = pathname === '/dashboard/upload';
  const isProjectsRoute = pathname === '/dashboard/projects';
  const { activeProjects: activeUploads } = useActiveProcessingProjects(user?.id, 5, {
    pollingEnabled: !isUploadRoute,
    pollIntervalMs: 5000,
  });

  const usesDocumentFlow = pathname === '/dashboard/settings'
    || pathname.startsWith('/dashboard/billing')
    || pathname === '/dashboard/notifications'
    || pathname === '/dashboard/usage'
    || pathname === '/dashboard/team'
    || pathname === '/dashboard/integrations'
    || pathname === '/dashboard/contact'
    || pathname.startsWith('/dashboard/studio')
    || pathname.startsWith('/dashboard/library')
    || pathname.startsWith('/dashboard/agency')
    || pathname === '/dashboard/onboarding'
    || pathname === '/dashboard/brand-voice'
    || pathname === '/dashboard/campaigns'
    || pathname === '/dashboard/analytics';
  const syncedProjectIds = new Set(syncedUploads.map((upload) => upload.projectId).filter(Boolean));
  const displayedUploads = isUploadRoute
    ? syncedUploads
    : [
        ...syncedUploads,
        ...activeUploads.filter((project) => !syncedProjectIds.has(project.id)),
      ];

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <CoverageProgressProvider>
      <div className={`${usesDocumentFlow ? 'min-h-screen' : 'h-screen'} flex flex-col ${usesDocumentFlow ? 'overflow-visible' : 'overflow-hidden'} bg-slate-50 dark:bg-slate-950`}>
        <div className={`flex flex-1 flex-col md:flex-row ${usesDocumentFlow ? 'overflow-visible' : 'overflow-hidden'}`}>
          <Suspense fallback={<div className="hidden md:block md:w-64 md:flex-shrink-0" />}>
            <DashboardNav
              isCollapsed={isSidebarCollapsed}
              onCollapseChange={setIsSidebarCollapsed}
            />
          </Suspense>

          {/* Main content */}
          <div
            className={`flex flex-col min-w-0 w-full md:w-0 flex-1 transition-[margin] duration-200 ease-out ${usesDocumentFlow ? 'overflow-visible' : 'overflow-hidden'} ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}
          >
            <DashboardTopBar />
            <main className={`${usesDocumentFlow ? 'overflow-visible' : (isProjectsRoute ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto')} relative focus:outline-none${displayedUploads.length > 0 && !isProjectsRoute ? ' pb-24 md:pb-16' : ''}`}>
              {children}
            </main>
            {usesDocumentFlow && <CompactFooter inDashboard={true} />}
          </div>

          {/* Global upload/transcription progress banner */}
          {displayedUploads.length > 0 && (
            (() => {
              const activeUpload = displayedUploads[0];
              const isSyncedUpload = isSyncedUploadProgressItem(activeUpload);
              const stage = isSyncedUpload
                ? activeUpload.processingStage || 'pending'
                : activeUpload.processing_stage || (activeUpload.status === 'uploading' ? 'uploading' : 'transcribing');
              const tier = normalizeTier(
                isSyncedUpload
                  ? activeUpload.processingTier
                  : activeUpload.performance_level || 'content_kit'
              );
              const overallProgress = isSyncedUpload
                ? Math.min(100, Math.max(0, Math.round(activeUpload.progress)))
                : calculateOverallProgress(
                    tier,
                    stage,
                    typeof activeUpload.processing_progress === 'number' ? activeUpload.processing_progress : 0
                  );
              const message = isSyncedUpload
                ? (activeUpload.processingMessage || getUserFacingProcessingMessage(tier, stage, undefined))
                : getUserFacingProcessingMessage(
                    tier,
                    stage,
                    activeUpload.processing_message
                  );
              const title = isSyncedUpload
                ? activeUpload.title
                : activeUpload.title || activeUpload.audio_file_name;
              const destinationProjectId = isSyncedUpload
                ? activeUpload.projectId
                : activeUpload.id;
              const destinationPath = isUploadRoute
                ? '/dashboard/upload'
                : `/dashboard/projects?id=${destinationProjectId}`;

              return (
                <>
                  <button
                    type="button"
                    onClick={() => router.push(destinationPath)}
                    className="fixed inset-x-3 bottom-3 z-30 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-left text-slate-900 shadow-[0_18px_50px_-20px_rgba(15,23,42,0.35)] backdrop-blur transition-colors hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-white dark:hover:bg-slate-900 md:hidden"
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
                  >
                    <div className="flex items-start gap-3">
                      <Loader2 className="mt-0.5 h-4 w-4 animate-spin flex-shrink-0 text-blue-500 dark:text-blue-300" />
                      <div className="min-w-0 flex-1">
                        <p className="max-h-10 overflow-hidden text-sm font-medium leading-5">
                          {message}
                          <span className="text-slate-400"> — </span>
                          <span className="text-slate-600 dark:text-slate-300">&ldquo;{title}&rdquo;</span>
                        </p>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-all duration-500 dark:bg-blue-400"
                              style={{ width: `${overallProgress}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-300">
                            {overallProgress}%
                          </span>
                        </div>
                        {displayedUploads.length > 1 && (
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {displayedUploads.length - 1} more upload{displayedUploads.length > 2 ? 's' : ''} running
                          </p>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push(destinationPath)}
                    className={`fixed bottom-0 left-0 right-0 z-50 hidden items-center gap-3 border-t border-slate-200 bg-white px-3 py-2 text-left text-slate-900 shadow-lg transition-[left] duration-200 ease-out dark:border-transparent dark:bg-gray-900 dark:text-white sm:px-6 sm:py-3 md:flex ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}
                  >
                    <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-blue-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-snug">
                        {message}
                        <span className="text-slate-400"> — </span>
                        <span className="text-slate-600 dark:text-slate-300 truncate">&ldquo;{title}&rdquo;</span>
                        {displayedUploads.length > 1 && <span className="text-slate-400"> +{displayedUploads.length - 1} more</span>}
                      </p>
                      <div className="mt-1 flex items-center gap-3">
                        <div className="h-1 flex-1 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden relative">
                          <div
                            className="absolute inset-y-0 left-0 bg-blue-400 rounded-full transition-all duration-500"
                            style={{ width: `${overallProgress}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-300 tabular-nums">
                          {overallProgress}%
                        </span>
                      </div>
                    </div>
                  </button>
                </>
              );
            })()
          )}

          {/* Coverage analysis banner — survives navigation via context */}
          <CoverageBanner />
        </div>
      </div>
      {!isDemoMode && (
        <GuidedOnboardingModal />
      )}

    </CoverageProgressProvider>
  );
}

function DashboardLayoutFallback() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto mb-4" />
        <p className="text-slate-500 dark:text-slate-400">Loading dashboard...</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UploadProgressSyncProvider>
      <Suspense fallback={<DashboardLayoutFallback />}>
        <DashboardLayoutContent>{children}</DashboardLayoutContent>
      </Suspense>
    </UploadProgressSyncProvider>
  );
}
