"use client";

import { useState, useEffect, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';
import DashboardNav from '@/components/dashboard/nav';
import { Loader2 } from 'lucide-react';
import { CoverageProgressProvider } from '@/lib/context/coverage-progress';
import { CoverageBanner } from '@/app/dashboard/_banners/coverage-banner';
import { DemoBanner } from '@/components/demo/DemoBanner';
import { FirstLoginWelcomeModal } from '@/components/dashboard/first-login-welcome-modal';
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
  const [showFirstLoginWelcome, setShowFirstLoginWelcome] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const forceWelcomePreview = searchParams.get('welcome') === '1';
  const hideDemoChromeForCapture = searchParams.get('capture') === '1';
  const isUploadRoute = pathname === '/dashboard/upload';
  const { activeProjects: activeUploads } = useActiveProcessingProjects(user?.id, 5, {
    pollingEnabled: !isUploadRoute,
    pollIntervalMs: 5000,
  });

  const usesDocumentFlow = pathname === '/dashboard/settings'
    || pathname === '/dashboard/billing'
    || pathname === '/dashboard/usage'
    || pathname === '/dashboard/contact'
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

  useEffect(() => {
    if (loading || !user || isDemoMode) return;
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const hasSeenWelcome = typeof meta.dashboard_welcome_seen_at === 'string' && meta.dashboard_welcome_seen_at.length > 0;
    if (!hasSeenWelcome || forceWelcomePreview) {
      setShowFirstLoginWelcome(true);
    }
  }, [loading, user, isDemoMode, forceWelcomePreview]);

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

  const dismissFirstLoginWelcome = async () => {
    try {
      await supabase.auth.updateUser({
        data: {
          dashboard_welcome_seen_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.warn('Failed to persist welcome modal dismissal:', error);
    } finally {
      setShowFirstLoginWelcome(false);
    }
  };

  return (
    <CoverageProgressProvider>
      <div className={`${usesDocumentFlow ? 'min-h-screen' : 'h-screen'} flex flex-col ${usesDocumentFlow ? 'overflow-visible' : 'overflow-hidden'} bg-slate-50 dark:bg-slate-950`}>
        {isDemoMode && !hideDemoChromeForCapture && <DemoBanner />}
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
            <main className={`${usesDocumentFlow ? 'overflow-visible' : 'flex-1 overflow-y-auto'} relative focus:outline-none${displayedUploads.length > 0 ? ' pb-16' : ''}`}>
              {children}
            </main>
            {usesDocumentFlow && <CompactFooter inDashboard={true} />}
          </div>

          {/* Global upload/transcription progress banner */}
          {displayedUploads.length > 0 && (
            <div
              className={`fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-lg transition-[left] duration-200 ease-out dark:border-transparent dark:bg-gray-900 dark:text-white sm:px-6 sm:py-3 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}
            >
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-blue-400" />
              <div className="flex-1 min-w-0">
                {(() => {
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

                  return (
                    <>
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
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Coverage analysis banner — survives navigation via context */}
          <CoverageBanner />
        </div>
      </div>
      {!isDemoMode && (
        <FirstLoginWelcomeModal
          isOpen={showFirstLoginWelcome}
          onClose={dismissFirstLoginWelcome}
          onGoToUpload={async () => {
            await dismissFirstLoginWelcome();
            router.push('/dashboard/upload');
          }}
        />
      )}

    </CoverageProgressProvider>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UploadProgressSyncProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </UploadProgressSyncProvider>
  );
}
