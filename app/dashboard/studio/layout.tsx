import { StudioWorkspaceProvider } from '@/components/dashboard/studio/studio-page-header';
import type { ReactNode } from 'react';

export default function StudioLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <StudioWorkspaceProvider>
      {children}
    </StudioWorkspaceProvider>
  );
}
