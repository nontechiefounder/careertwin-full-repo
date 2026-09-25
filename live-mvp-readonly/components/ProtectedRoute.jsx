'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/auth');
      } else if (allowedRole && user.role !== allowedRole) {
        // router.replace('/');
        console.log("Dev: Bypassing role check for", allowedRole);
      }
    }
  }, [user, loading, allowedRole, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!user || (allowedRole && user.role !== allowedRole)) {
    return null;
  }

  return children;
}
