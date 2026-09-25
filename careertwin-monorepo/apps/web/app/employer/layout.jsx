'use client';

import ProtectedRoute from "@/components/ProtectedRoute";

export default function EmployerLayout({ children }) {
  return (
    <ProtectedRoute allowedRole="employer">
      {children}
    </ProtectedRoute>
  );
}
