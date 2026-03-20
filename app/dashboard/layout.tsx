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
import { WelcomeModal } from '@/components/demo/WelcomeModal';
import { FirstLoginWelcomeModal } from '@/components/dashboard/first-login-welcome-modal';
import { calculateOverallProgress, getUserFacingProcessingMessage, type ProcessingStage } from '@/lib/tier-progress-config';
import { normalizeTier } from '@/lib/tier-config';

interface ActiveUpload {
  id: string;
  title: string;
  audio_file_name: string | null;
  status: 'uploading' | 'processing';
  processing_stage?: ProcessingStage;
  processing_progress?: number;
  processing_message?: string | null;
  performance_level?: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, isDemoMode } = useAuth();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showFirstLoginWelcome, setShowFirstLoginWelcome] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const forceWelcomePreview = searchParams.get('welcome') === '1';

  const usesDocumentFlow = pathname === '/dashboard/settings'
    || pathname === '/dashboard/billing'
    || pathname === '/dashboard/usage'
    || pathname === '/dashboard/contact'
    || pathname === '/dashboard/analytics';

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  // Show welcome modal for demo users on first visit
  useEffect(() => {
    if (!isDemoMode) return;
    const seen = localStorage.getItem('demoWelcomeSeen');
    if (forceWelcomePreview || !seen) {
      setShowWelcomeModal(true);
    }
  }, [isDemoMode, forceWelcomePreview]);

  useEffect(() => {
    if (loading || !user || isDemoMode) return;
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const hasSeenWelcome = typeof meta.dashboard_welcome_seen_at === 'string' && meta.dashboard_welcome_seen_at.length > 0;
    if (!hasSeenWelcome || forceWelcomePreview) {
      setShowFirstLoginWelcome(true);
    }
  }, [loading, user, isDemoMode, forceWelcomePreview]);

  // Poll for in-progress uploads/transcriptions across the whole session
  useEffect(() => {
    if (!user?.id) return;

    const poll = async () => {
      try {
        const { data } = await supabase
          .from('projects')
          .select('id, title, audio_file_name, status, processing_stage, processing_progress, processing_message, performance_level')
          .eq('user_id', user.id)
          .in('status', ['uploading', 'processing'])
          .order('created_at', { ascending: false })
          .limit(5);
        setActiveUploads((data || []) as ActiveUpload[]);
      } catch {
        // Non-fatal — banner just won't show
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [user?.id]);

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
        {isDemoMode && <DemoBanner />}
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
            <main className={`${usesDocumentFlow ? 'overflow-visible' : 'flex-1 overflow-y-auto'} relative focus:outline-none${activeUploads.length > 0 ? ' pb-16' : ''}`}>
              {children}
            </main>
          </div>

          {/* Global upload/transcription progress banner */}
          {activeUploads.length > 0 && (
            <div
              className={`fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-lg transition-[left] duration-200 ease-out dark:border-transparent dark:bg-gray-900 dark:text-white sm:px-6 sm:py-3 ${isSidebarCollapsed ? 'md:left-20' : 'md:left-64'}`}
            >
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-blue-400" />
              <div className="flex-1 min-w-0">
                {(() => {
                  const activeUpload = activeUploads[0];
                  const stage = activeUpload.processing_stage ||
                    (activeUpload.status === 'uploading' ? 'uploading' : 'transcribing');
                  const tier = normalizeTier(activeUpload.performance_level || 'content_kit');
                  const overallProgress = calculateOverallProgress(
                    tier,
                    stage,
                    typeof activeUpload.processing_progress === 'number' ? activeUpload.processing_progress : 0
                  );
                  const message = getUserFacingProcessingMessage(
                    tier,
                    stage,
                    activeUpload.processing_message
                  );

                  return (
                    <>
                      <p className="text-sm font-medium truncate leading-snug">
                        {message}
                        <span className="text-slate-400"> — </span>
                        <span className="text-slate-600 dark:text-slate-300 truncate">&ldquo;{activeUpload.title || activeUpload.audio_file_name}&rdquo;</span>
                        {activeUploads.length > 1 && <span className="text-slate-400"> +{activeUploads.length - 1} more</span>}
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

      {/* Demo welcome modal */}
      {isDemoMode && (
        <WelcomeModal
          isOpen={showWelcomeModal}
          onClose={() => {
            localStorage.setItem('demoWelcomeSeen', '1');
            setShowWelcomeModal(false);
          }}
        />
      )}

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

      {/* Floating restart tour button — demo only */}
      {isDemoMode && (
        <button
          onClick={() => {
            localStorage.removeItem('demoWelcomeSeen');
            setShowWelcomeModal(true);
          }}
          className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-full shadow-lg transition-colors"
          title="Restart guided tour"
          aria-label="Restart guided tour"
        >
          🗺 Tour
        </button>
      )}
    </CoverageProgressProvider>
  );
}
