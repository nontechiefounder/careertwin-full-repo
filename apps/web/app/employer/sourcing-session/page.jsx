"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function SourcingSessionIndex() {
  const router = useRouter();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadActiveSession() {
      try {
        // Find most recent sourcing session
        const res = await api.get('/employer/sourcing-sessions');
        const sessions = res.data?.sessions || [];
        if (sessions.length > 0) {
          router.replace(`/employer/sourcing-session/${sessions[0].id}`);
          return;
        }

        // Fallback: check runs and create/find session
        const runsRes = await api.get('/employer/hiring-runs');
        const runs = runsRes.data?.runs || [];
        if (runs.length > 0) {
          router.replace(`/employer/sourcing-session/${runs[0].id}`);
          return;
        }

        router.replace('/employer');
      } catch (e) {
        console.warn('Sourcing session resolution failed:', e.message);
        router.replace('/employer');
      }
    }

    loadActiveSession();
  }, [router]);

  return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white font-mono">
      <Loader2 className="h-6 w-6 text-green-400 animate-spin mb-3" />
      <p className="text-xs text-white/50">Loading Sourcing Session...</p>
    </div>
  );
}

