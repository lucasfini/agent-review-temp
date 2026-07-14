import type { SVGProps } from 'react';

import { cn } from '@/lib/utils';

type LogoSize = 'sm' | 'md' | 'lg';
type LogoTheme = 'light' | 'dark';

type LogoIconProps = SVGProps<SVGSVGElement> & {
  size?: LogoSize;
  decorative?: boolean;
};

type LogoWordmarkProps = {
  className?: string;
  size?: LogoSize;
  theme?: LogoTheme;
  'aria-hidden'?: boolean;
};

type LogoLockupProps = {
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  size?: LogoSize;
  theme?: LogoTheme;
  ariaLabel?: string;
};

const iconSizeClass: Record<LogoSize, string> = {
  sm: 'h-8 w-10',
  md: 'h-10 w-12',
  lg: 'h-12 w-14',
};

const wordmarkSizeClass: Record<LogoSize, string> = {
  sm: 'text-[1.05rem]',
  md: 'text-xl',
  lg: 'text-2xl',
};

const lockupGapClass: Record<LogoSize, string> = {
  sm: 'gap-2',
  md: 'gap-2.5',
  lg: 'gap-3',
};

export function LogoIcon({
  className,
  size = 'md',
  decorative = false,
  ...props
}: LogoIconProps) {
  const accessibilityProps = decorative
    ? { 'aria-hidden': true }
    : { role: 'img' as const, 'aria-label': props['aria-label'] ?? 'AudioRepurpose' };

  return (
    <svg
      viewBox="0 0 124 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('block shrink-0', iconSizeClass[size], className)}
      {...accessibilityProps}
      {...props}
    >
      <rect x="5" y="39" width="9" height="18" rx="4.5" fill="#1463FF" />
      <rect x="19" y="32" width="10" height="32" rx="5" fill="#178BFF" />
      <rect x="34" y="24" width="10" height="48" rx="5" fill="#27A9FF" />
      <rect x="49" y="30" width="10" height="36" rx="5" fill="#1463FF" />
      <rect x="64" y="10" width="10" height="76" rx="5" fill="#1D6DFF" />
      <rect x="79" y="30" width="10" height="36" rx="5" fill="#2AAFFF" />
      <rect x="94" y="24" width="10" height="48" rx="5" fill="#178BFF" />
      <rect x="109" y="32" width="10" height="32" rx="5" fill="#38BDF8" />
    </svg>
  );
}

export function LogoWordmark({
  className,
  size = 'md',
  theme = 'light',
  'aria-hidden': ariaHidden,
}: LogoWordmarkProps) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline whitespace-nowrap font-sans leading-none tracking-normal',
        wordmarkSizeClass[size],
        className,
      )}
      aria-hidden={ariaHidden}
    >
      <span className={cn('font-extrabold', theme === 'dark' ? 'text-slate-50' : 'text-[#050B24]')}>
        Audio
      </span>
      <span className={cn('font-medium', theme === 'dark' ? 'text-slate-300' : 'text-[#334155]')}>
        Repurpose
      </span>
    </span>
  );
}

export function LogoLockup({
  className,
  iconClassName,
  wordmarkClassName,
  size = 'md',
  theme = 'light',
  ariaLabel = 'AudioRepurpose',
}: LogoLockupProps) {
  return (
    <span
      className={cn('inline-flex items-center', lockupGapClass[size], className)}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <LogoIcon size={size} decorative className={iconClassName} />
      <LogoWordmark size={size} theme={theme} className={wordmarkClassName} aria-hidden={Boolean(ariaLabel)} />
    </span>
  );
}
