import Link from 'next/link';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
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
        "min-h-full bg-slate-50 px-3 py-4 text-slate-900 transition-colors dark:bg-[#061126] dark:text-slate-100 sm:px-6 sm:py-6",
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
  icon?: LucideIcon;
  actions?: ReactNode;
  tabs?: ReactNode;
  children?: ReactNode;
  density?: 'default' | 'compact';
  className?: string;
};

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  tabs,
  children,
  density = 'default',
  className,
}: DashboardPageHeaderProps) {
  const compact = density === 'compact';

  return (
    <section
      className={cn(
        "mb-6 transition-colors",
        className
      )}
    >
      <div className={cn(
        "flex flex-col lg:flex-row lg:items-end lg:justify-between",
        compact ? "gap-3" : "gap-4"
      )}>
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon && (
            <span className={cn(
              "hidden flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
              compact ? "h-10 w-10" : "h-12 w-12"
            )}>
              <Icon className={cn(compact ? "h-5 w-5" : "h-6 w-6")} />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className={cn(
                "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400",
                compact ? "mb-1" : "mb-1.5"
              )}>
                {eyebrow}
              </p>
            )}
            <h1 className={cn(
              "font-bold tracking-tight text-slate-950 dark:text-white",
              compact ? "text-3xl" : "text-3xl"
            )}>
              {title}
            </h1>
            <p className={cn(
              "max-w-3xl text-base leading-6 text-slate-600 dark:text-slate-300",
              compact ? "mt-2" : "mt-2"
            )}>
              {description}
            </p>
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {actions}
          </div>
        )}
      </div>
      {(tabs || children) && (
        <div className="mt-4">
          {tabs || children}
        </div>
      )}
    </section>
  );
}

type DashboardHeaderActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary';
  children: ReactNode;
};

export function DashboardHeaderAction({
  href,
  icon: Icon,
  variant = 'secondary',
  children,
  className,
  ...props
}: DashboardHeaderActionProps) {
  const actionClassName = cn(
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60',
    variant === 'primary'
      ? 'border border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700'
      : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10',
    className
  );
  const content = (
    <>
      {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={actionClassName}>
        {content}
      </Link>
    );
  }

  return (
    <button {...props} className={actionClassName}>
      {content}
    </button>
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
