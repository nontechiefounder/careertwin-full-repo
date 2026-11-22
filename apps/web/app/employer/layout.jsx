'use client';

import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceSupportGate from "@/components/DeviceSupportGate";

export default function EmployerLayout({ children }) {
  return (
    <ProtectedRoute allowedRole="employer">
      <DeviceSupportGate>
        {children}
      </DeviceSupportGate>
    </ProtectedRoute>
  );
}
