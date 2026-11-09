'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from './theme-provider';

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'text-sm',
        },
      }}
    />
  );
}
