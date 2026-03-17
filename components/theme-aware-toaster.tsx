"use client";

import { useTheme } from 'next-themes';
import { Toaster } from 'sonner';

export function ThemeAwareToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={(resolvedTheme as 'light' | 'dark') ?? 'dark'}
      position="top-right"
      richColors
    />
  );
}
