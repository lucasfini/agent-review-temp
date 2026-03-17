import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  theme?: 'light' | 'dark';
};

const sizeStyles = {
  sm: {
    iconWrap: 'h-6 w-6 rounded-md',
    icon: 'h-3.5 w-3.5',
    text: 'text-sm',
  },
  md: {
    iconWrap: 'h-8 w-8 rounded-lg',
    icon: 'h-4 w-4',
    text: 'text-[15px]',
  },
  lg: {
    iconWrap: 'h-10 w-10 rounded-xl',
    icon: 'h-5 w-5',
    text: 'text-xl',
  },
} as const;

export default function BrandLogo({
  className,
  showText = true,
  size = 'md',
  theme = 'light',
}: BrandLogoProps) {
  const styles = sizeStyles[size];
  const isDark = theme === 'dark';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'relative flex items-center justify-center overflow-visible bg-blue-600',
          styles.iconWrap
        )}
      >
        <Mic className={cn('text-white', styles.icon)} />
      </div>
      {showText && (
        <span className={cn('font-bold tracking-tight', styles.text, isDark ? 'text-white' : 'text-gray-900')}>
          AudioRepurpose
        </span>
      )}
    </div>
  );
}
