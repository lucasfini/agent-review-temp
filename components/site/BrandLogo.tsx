import {
  LogoIcon,
  LogoLockup,
  LogoWordmark,
} from '@/components/site/AudioRepurposeLogo';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  showText?: boolean;
  showSubtitle?: boolean;
  size?: 'sm' | 'md' | 'lg';
  theme?: 'light' | 'dark';
  mode?: 'lockup' | 'icon' | 'wordmark';
};

export { LogoIcon, LogoLockup, LogoWordmark };

export default function BrandLogo({
  className,
  showText = true,
  showSubtitle = true,
  size = 'md',
  theme = 'light',
  mode,
}: BrandLogoProps) {
  const resolvedMode = mode ?? (showText ? 'lockup' : 'icon');

  void showSubtitle;

  if (resolvedMode === 'icon') {
    return (
      <span className={cn('inline-flex items-center justify-center', className)}>
        <LogoIcon size={size} />
      </span>
    );
  }

  if (resolvedMode === 'wordmark') {
    return (
      <span className={cn('inline-flex items-center', className)} aria-label="AudioRepurpose" role="img">
        <LogoWordmark size={size} theme={theme} aria-hidden />
      </span>
    );
  }

  return (
    <LogoLockup
      className={className}
      size={size}
      theme={theme}
    />
  );
}
