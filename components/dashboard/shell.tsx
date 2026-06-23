import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type DashboardPageShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  maxWidth?: '5xl' | '6xl' | '7xl' | 'full';
};

const maxWidthClass: Record<NonNullable<DashboardPageShellProps['maxWidth']>, string> = {
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-none',
};

export function DashboardPageShell({
  children,
  className,
  contentClassName,
  maxWidth = '7xl',
}: DashboardPageShellProps) {
  return (
    <div
      className={cn(
        "min-h-full bg-slate-50 px-3 py-4 text-slate-900 dark:bg-slate-950 dark:text-slate-50 sm:px-6 sm:py-6",
        className
      )}
    >
      <div className={cn("mx-auto w-full", maxWidthClass[maxWidth], contentClassName)}>
        {children}
      </div>
    </div>
  );
}

type DashboardPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: DashboardPageHeaderProps) {
  return (
    <section
      className={cn(
        "mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5",
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
              {eyebrow}
            </p>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {description}
          </p>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {children && (
        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
          {children}
        </div>
      )}
    </section>
  );
}

export function DashboardPanel({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}
