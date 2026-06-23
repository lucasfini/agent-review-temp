import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  showText?: boolean;
  showSubtitle?: boolean;
  size?: 'sm' | 'md' | 'lg';
  theme?: 'light' | 'dark';
  mode?: 'lockup' | 'icon' | 'wordmark';
};

const sizeStyles = {
  sm: {
    frame: 'h-9 w-9',
    icon: 'h-5 w-5',
    lockup: 'h-8 w-[12.25rem]',
    wordmark: 'h-7 w-36',
  },
  md: {
    frame: 'h-11 w-11',
    icon: 'h-6 w-6',
    lockup: 'h-10 w-[15.3125rem]',
    wordmark: 'h-8 w-40',
  },
  lg: {
    frame: 'h-14 w-14',
    icon: 'h-8 w-8',
    lockup: 'h-12 w-[18.375rem]',
    wordmark: 'h-10 w-52',
  },
} as const;

function getBrandAssetSrc(mode: NonNullable<BrandLogoProps['mode']>, theme: 'light' | 'dark') {
  if (mode === 'icon') {
    return theme === 'light' ? '/brand-icon-light.svg' : '/brand-icon-dark.svg';
  }

  const assetTheme = theme === 'dark' ? 'light' : 'dark';
  return `/brand-${mode}-${assetTheme}.svg`;
}

function BrandAsset({
  className,
  mode,
  theme,
}: {
  className?: string;
  mode: NonNullable<BrandLogoProps['mode']>;
  theme: 'light' | 'dark';
}) {
  return (
    <img
      src={getBrandAssetSrc(mode, theme)}
      alt="AudioRepurpose"
      className={cn('relative z-[1] block shrink-0', className)}
    />
  );
}

export default function BrandLogo({
  className,
  showText = true,
  showSubtitle = true,
  size = 'md',
  theme = 'light',
  mode,
}: BrandLogoProps) {
  const styles = sizeStyles[size];
  const resolvedMode = mode ?? (showText ? 'lockup' : 'icon');

  void showSubtitle;

  if (resolvedMode === 'icon') {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <div
          className={cn(
            'flex items-center justify-center',
            styles.frame
          )}
        >
          <BrandAsset className={styles.icon} mode="icon" theme={theme} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center', className)}>
      <div
        className={cn(
          'flex items-center justify-center',
          resolvedMode === 'wordmark' ? styles.wordmark : styles.lockup
        )}
      >
        <BrandAsset className="h-full w-full" mode={resolvedMode} theme={theme} />
      </div>
    </div>
  );
}
