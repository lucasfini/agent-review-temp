"use client";

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import BrandLogo from '@/components/site/BrandLogo';
import { X, MapPin, Compass } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour?: () => void;
}

export function WelcomeModal({ isOpen, onClose, onStartTour }: WelcomeModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleStartTour = () => {
    onClose();
    onStartTour?.();
    // Signal the hub to start the tour
    localStorage.setItem('demoTourChapter', 'hub');
    if (pathname !== '/dashboard/hub') {
      router.push('/dashboard/hub');
      return;
    }
    // Dispatch a custom event so the hub page can react without a full nav
    window.dispatchEvent(new CustomEvent('demoTourStart'));
  };

  const logoTheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <BrandLogo showText={false} size="lg" theme={logoTheme} />
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Welcome to the Demo</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">AudioRepurpose</p>
          </div>
        </div>

        {/* Body */}
        <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Take the guided tour to see every feature, or explore freely on your own.
        </p>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleStartTour}
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            <MapPin className="h-4 w-4" />
            Start Guided Tour →
          </button>
          <button
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
          >
            <Compass className="h-4 w-4" />
            Explore on my own
          </button>
        </div>

        {/* Fine print */}
        <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-600">
          This is a read-only account.{' '}
          <Link href="/auth/signup" className="text-blue-500 hover:text-blue-400 transition-colors">
            Sign up
          </Link>{' '}
          to process your own audio.
        </p>
      </div>
    </div>
  );
}
