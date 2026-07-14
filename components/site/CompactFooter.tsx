"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import BrandLogo from "@/components/site/BrandLogo";

export default function CompactFooter({ inDashboard = false }: { inDashboard?: boolean } = {}) {
  const pathname = usePathname();
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const activeTheme = resolvedTheme ?? theme;
  const logoTheme = mounted && activeTheme === "light" ? "light" : "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  if (pathname === "/" || pathname === "/product" || pathname.startsWith("/product/")) {
    return null;
  }

  // Prevent global footer from rendering on dashboard routes where it slides behind the transparent nav bar.
  // Instead, the dashboard layout renders it explicitly inside the main content area.
  if (pathname.startsWith("/dashboard") && !inDashboard) {
    return null;
  }

  return (
    <footer className={`border-t border-slate-200 dark:border-slate-900 bg-white/95 dark:bg-slate-950/95 ${inDashboard ? "mt-auto" : ""}`}>
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <BrandLogo size="sm" showSubtitle={false} theme={logoTheme} />
        </div>

        <div className="flex items-center gap-4">
          <Link href="/contact" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            Contact
          </Link>
          <Link href="/privacy" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            Terms
          </Link>
        </div>

        <p className="hidden sm:block">&copy; {new Date().getFullYear()} AudioRepurpose</p>
      </div>
    </footer>
  );
}
