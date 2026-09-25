'use client';

import { AuthProvider } from '@/lib/auth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }) {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster position="bottom-right" theme="dark" />
      </TooltipProvider>
    </AuthProvider>
  );
}
