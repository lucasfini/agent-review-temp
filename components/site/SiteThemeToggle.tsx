"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

type SiteThemeToggleProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizeClass = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-11 w-11",
} satisfies Record<NonNullable<SiteThemeToggleProps["size"]>, string>;

const iconSizeClass = {
  sm: "h-4 w-4",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} satisfies Record<NonNullable<SiteThemeToggleProps["size"]>, string>;

export default function SiteThemeToggle({
  className,
  size = "md",
}: SiteThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeTheme = resolvedTheme ?? theme ?? "light";
  const isDark = mounted ? activeTheme === "dark" : false;
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-theme-toggle
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:focus-visible:ring-offset-slate-950",
        sizeClass[size],
        className,
      )}
    >
      {mounted ? (
        <Icon aria-hidden="true" className={iconSizeClass[size]} />
      ) : (
        <span aria-hidden="true" className={cn("rounded-full bg-current opacity-40", iconSizeClass[size])} />
      )}
    </button>
  );
}
