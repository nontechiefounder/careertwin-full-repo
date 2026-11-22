"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import ResearchQAPanel from "@/components/research/ResearchQAPanel";
import api from "@/lib/api";

export default function DedicatedResearchPage({ params }) {
  const { id } = use(params);
  const [roleId, setRoleId] = useState(null);

  useEffect(() => {
    let mounted = true;
    api
      .get(`/employer/brief/${id}`)
      .then((res) => {
        if (mounted && res.data) {
          setRoleId(res.data.role_id || res.data.brief?.role_id || null);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F2F2F2] flex flex-col font-sans">
      <header className="border-b border-white/[0.08] bg-[#0E0E0E]/80 backdrop-blur sticky top-0 z-20 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link
            href={`/employer/brief/${id}`}
            className="flex items-center gap-2 text-xs text-[#A3A3A3] hover:text-[#F2F2F2] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Role Brief</span>
          </Link>
          <div className="flex items-center gap-2 text-xs font-mono text-white/50">
            <Sparkles className="h-3.5 w-3.5 text-[#00D604]" />
            <span>Role & Company Research Workspace</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        <ResearchQAPanel hiringRunId={id} roleId={roleId} />
      </main>
    </div>
  );
}
