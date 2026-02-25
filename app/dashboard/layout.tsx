"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';
import DashboardNav from '@/components/dashboard/nav';
import { Loader2 } from 'lucide-react';
import { CoverageProgressProvider } from '@/lib/context/coverage-progress';
import { CoverageBanner } from '@/app/dashboard/_banners/coverage-banner';

interface ActiveUpload {
  id: string;
  title: string;
  audio_file_name: string | null;
  status: 'uploading' | 'processing';
  processing_stage?: string;
  processing_progress?: number;
  processing_message?: string | null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signup');
    }
  }, [user, loading, router]);

  // Poll for in-progress uploads/transcriptions across the whole session
  useEffect(() => {
    if (!user?.id) return;

    const poll = async () => {
      try {
        const { data } = await supabase
          .from('projects')
          .select('id, title, audio_file_name, status, processing_stage, processing_progress, processing_message')
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <CoverageProgressProvider>
      <div className="h-screen flex overflow-hidden bg-gray-50">
        <DashboardNav />

        {/* Main content */}
        <div className="flex flex-col w-0 flex-1 overflow-hidden md:ml-64">
          <main className="flex-1 relative overflow-y-auto focus:outline-none">
            {children}
          </main>
        </div>

        {/* Global upload/transcription progress banner */}
        {activeUploads.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 md:left-64 z-50 bg-gray-900 text-white px-6 py-3 flex items-center gap-4 shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-blue-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {activeUploads[0].processing_message
                  ? `${activeUploads[0].processing_message} — "${activeUploads[0].title || activeUploads[0].audio_file_name}"`
                  : `Processing "${activeUploads[0].title || activeUploads[0].audio_file_name}"…`}
                {activeUploads.length > 1 && ` (+${activeUploads.length - 1} more)`}
              </p>
              <div className="mt-1 h-1 bg-gray-700 rounded-full overflow-hidden relative">
                {typeof activeUploads[0].processing_progress === 'number' && activeUploads[0].processing_progress > 0 ? (
                  <div
                    className="absolute inset-y-0 left-0 bg-blue-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(activeUploads[0].processing_progress, 5)}%` }}
                  />
                ) : (
                  <div
                    className="absolute inset-y-0 left-0 w-2/5 bg-blue-400 rounded-full"
                    style={{ animation: 'banner-sweep 1.5s ease-in-out infinite' }}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Coverage analysis banner — survives navigation via context */}
        <CoverageBanner />
      </div>
    </CoverageProgressProvider>
  );
}