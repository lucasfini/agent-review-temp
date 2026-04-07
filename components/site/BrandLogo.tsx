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
  },
  md: {
    frame: 'h-11 w-11',
    icon: 'h-6 w-6',
  },
  lg: {
    frame: 'h-14 w-14',
    icon: 'h-8 w-8',
  },
} as const;

function BrandIcon({
  className,
  theme,
}: {
  className?: string;
  theme: 'light' | 'dark';
}) {
  const src = theme === 'light' ? '/brand-icon-light.svg' : '/brand-icon-dark.svg';
  return (
    <img
      src={src}
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

  void showText;
  void showSubtitle;
  void mode;

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div
        className={cn(
          'flex items-center justify-center',
          styles.frame
        )}
      >
        <BrandIcon className={styles.icon} theme={theme} />
      </div>
    </div>
  );
}
