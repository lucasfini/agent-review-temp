"use client";

import Link from 'next/link';
import { Eye } from 'lucide-react';

export function DemoBanner() {
  return (
    <div className="flex-shrink-0 w-full bg-amber-50 dark:bg-amber-950/60 border-b border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-200 z-50">
      <div className="flex items-center justify-center gap-3 px-4 py-2 text-sm">
        <Eye className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="font-medium">Demo Account — Read-only view.</span>
        <span className="hidden sm:inline text-amber-700/70 dark:text-amber-300/70">Sign up free to upload your own audio.</span>
        <Link
          href="/auth/signup"
          className="flex-shrink-0 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
        >
          Get Started →
        </Link>
      </div>
    </div>
  );
}
