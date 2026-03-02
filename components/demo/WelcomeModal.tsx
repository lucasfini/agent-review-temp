"use client";

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Mic, X, MapPin, Compass } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour?: () => void;
}

export function WelcomeModal({ isOpen, onClose, onStartTour }: WelcomeModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

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
    // Dispatch a custom event so the hub page can react without a full nav
    window.dispatchEvent(new CustomEvent('demoTourStart'));
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Mic className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Welcome to the Demo</h2>
            <p className="text-xs text-slate-400">AudioRepurpose</p>
          </div>
        </div>

        {/* Body */}
        <p className="text-slate-300 text-sm leading-relaxed mb-6">
          You're viewing a live demo account with real AI-processed podcasts. Take the guided
          tour to see every feature, or explore freely on your own.
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
            className="flex items-center justify-center gap-2 w-full text-slate-400 hover:text-slate-200 font-medium py-3 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors text-sm"
          >
            <Compass className="h-4 w-4" />
            Explore on my own
          </button>
        </div>

        {/* Fine print */}
        <p className="text-xs text-slate-600 text-center mt-5">
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
