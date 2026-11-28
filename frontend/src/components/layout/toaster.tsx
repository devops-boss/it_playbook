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
      className="print:hidden"
      toastOptions={{
        className: 'print:hidden',
        classNames: {
          toast: 'text-sm print:hidden',
        },
      }}
    />
  );
}
