"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic } from "lucide-react";

export default function CompactFooter() {
  const pathname = usePathname();

  if (pathname === "/") {
    return null;
  }

  return (
    <footer className="border-t border-slate-900 bg-slate-950/95">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-slate-400">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600/90">
            <Mic className="h-3.5 w-3.5 text-white" />
          </div>
          <span>AudioRepurpose</span>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-slate-300 transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-slate-300 transition-colors">
            Terms
          </Link>
        </div>

        <p className="hidden sm:block">&copy; {new Date().getFullYear()} AudioRepurpose</p>
      </div>
    </footer>
  );
}
