"use client";

import { usePathname } from "next/navigation";

import SiteThemeToggle from "@/components/site/SiteThemeToggle";

export default function RouteThemeControl() {
  const pathname = usePathname();

  if (
    pathname === "/" ||
    pathname === "/product" ||
    pathname.startsWith("/product/") ||
    pathname === "/pricing" ||
    pathname === "/whats-new" ||
    pathname === "/built-for" ||
    pathname.startsWith("/built-for/") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-[60] print:hidden">
      <SiteThemeToggle className="backdrop-blur" />
    </div>
  );
}
