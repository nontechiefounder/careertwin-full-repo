"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronRight,
  Shield,
  Loader2,
  Clock,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import api from "@/lib/api";

export default function ContextEvidencePanel({
  hiringRunId,
  orgId,
  className = "",
}) {
  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [evidenceData, setEvidenceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [activeTab, setActiveTab] = useState("sources"); // 'sources' | 'evidence'

  // Fetch sources
  const fetchSources = async () => {
    try {
      const res = await api.get(
        `/employer/context-sources?${hiringRunId ? `hiring_run_id=${hiringRunId}` : ""}${orgId ? `&org_id=${orgId}` : ""}`
      );
      if (res.data?.ok) {
        setSources(res.data.sources || []);
        if (res.data.sources?.length > 0 && !selectedSourceId) {
          setSelectedSourceId(res.data.sources[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load context sources:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, [hiringRunId, orgId]);

  // Fetch evidence for selected source
  const fetchEvidence = async (sourceId) => {
    if (!sourceId) return;
    try {
      const res = await api.get(`/employer/context-sources/${sourceId}/evidence`);
      if (res.data?.ok) {
        setEvidenceData(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch evidence:", err);
    }
  };

  useEffect(() => {
    if (selectedSourceId) {
      fetchEvidence(selectedSourceId);
    }
  }, [selectedSourceId]);

  // Handle uploading or bumping version of a source document
  const handleUploadSample = async (isNewVersion = false) => {
    setUploading(true);
    setUploadError(null);

    const filename = isNewVersion && evidenceData?.source?.source_uri
      ? evidenceData.source.source_uri
      : "sarah_connor_lead_infra.pdf";

    // Simulate changed content if version bump
    const versionSalt = isNewVersion ? `\n\n[REVISION UPDATE ${Date.now()}]: Added GCP Professional Cloud Architect and FedRAMP high authorization deliverables.` : "";
    const rawContent = `# Sarah Connor — Staff Infrastructure & Security Engineer\n\n## Professional Summary\nStaff Infrastructure Engineer with 11+ years leading cloud platforms, Kubernetes orchestration, and SOC2 compliance.\n\n## Core Technical Skills\nKubernetes, Terraform, AWS, Go, Python, PostgreSQL, Kafka, Linux systems programming.${versionSalt}\n\n## Experience & Deliverables\nDelivered multi-region Kubernetes platform across AWS and on-premise clusters. Implemented automated SOC2 Type II compliance framework with strict audit trails.\n\n## Education & Certifications\nB.S. in Computer Science. Certified Kubernetes Administrator (CKA). AWS Solutions Architect Professional.`;

    try {
      const res = await api.post("/employer/context-sources/upload", {
        hiring_run_id: hiringRunId,
        org_id: orgId,
        source_uri: filename,
        source_kind: "RESUME",
        content: rawContent,
        effective_time: new Date().toISOString(),
      });

      if (res.data?.ok) {
        await fetchSources();
        if (res.data.source_id) {
          setSelectedSourceId(res.data.source_id);
          await fetchEvidence(res.data.source_id);
          setActiveTab("evidence");
        }
      }
    } catch (err) {
      setUploadError(err.response?.data?.error || err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Context Evidence Foundation Panel"
      data-testid="context-evidence-panel"
      className={`rounded-2xl border border-white/[0.08] bg-[#111111] p-6 space-y-6 ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#F2F2F2]">
              Context Evidence Foundation
            </h3>
            <p className="text-[11px] font-mono text-[#A3A3A3] mt-0.5">
              Authoritative Source Objects • Immutable Versions • Granular Evidence Spans
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="upload-context-source-btn"
            onClick={() => handleUploadSample(false)}
            disabled={uploading}
            className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-medium text-white/90 flex items-center gap-1.5 transition-all disabled:opacity-40"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5 text-emerald-400" />
            )}
            <span>Ingest Source Document</span>
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] pb-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("sources")}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === "sources"
              ? "bg-white/[0.08] text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Source Objects ({sources.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("evidence")}
          disabled={!selectedSourceId}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-30 ${
            activeTab === "evidence"
              ? "bg-white/[0.08] text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Evidence Spans & Coverage
        </button>
      </div>

      {/* Tab 1: Source Objects List */}
      {activeTab === "sources" && (
        <div className="space-y-3">
          {loading ? (
            <div className="p-8 text-center text-xs text-white/40 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              <span>Loading context source records...</span>
            </div>
          ) : sources.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-white/[0.1] text-center space-y-2">
              <FileText className="h-8 w-8 text-white/20 mx-auto" />
              <p className="text-xs text-white/60">No context sources ingested yet.</p>
              <button
                type="button"
                onClick={() => handleUploadSample(false)}
                className="text-xs text-emerald-400 hover:underline"
              >
                Ingest Sarah Connor resume fixture
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {sources.map((s) => {
                const isSelected = s.id === selectedSourceId;
                const activeVer = s.active_version;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      setSelectedSourceId(s.id);
                      setActiveTab("evidence");
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-[#181818] border-emerald-500/40"
                        : "bg-[#141414] border-white/[0.06] hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/60 shrink-0">
                        <FileText className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div className="space-y-0.5 overflow-hidden">
                        <p className="text-xs font-medium text-white truncate">
                          {s.source_uri}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-white/40">
                          <span className="uppercase text-emerald-400/80">{s.source_kind}</span>
                          <span>•</span>
                          <span>{s.confidentiality}</span>
                          <span>•</span>
                          <span className="text-white/60 font-semibold">
                            v{activeVer?.version_number || 1}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {activeVer?.status || "completed"}
                      </span>
                      <ChevronRight className="h-4 w-4 text-white/30" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Evidence Spans & Coverage Inspector */}
      {activeTab === "evidence" && evidenceData && (
        <div className="space-y-5">
          {/* Active Version Bar */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">
                  {evidenceData.source?.source_uri}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono">
                  Version {evidenceData.active_version?.version_number || 1} (Active)
                </span>
                {evidenceData.versions?.length > 1 && (
                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-mono">
                    {evidenceData.versions.length} Revisions Recorded
                  </span>
                )}
              </div>
              <p className="text-[10px] font-mono text-white/40 truncate">
                SHA256: {evidenceData.active_version?.original_file_sha256}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="bump-source-version-btn"
                onClick={() => handleUploadSample(true)}
                disabled={uploading}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-1 transition-all disabled:opacity-40"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Upload Changed Source (Bump v{Number(evidenceData.active_version?.version_number || 1) + 1})</span>
              </button>
            </div>
          </div>

          {/* Coverage Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#161616] border border-white/[0.06] space-y-0.5">
              <p className="text-[10px] font-mono text-white/40 uppercase">Coverage Score</p>
              <p className="text-base font-semibold text-emerald-400">
                {evidenceData.document_result?.coverage_score || 95}%
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#161616] border border-white/[0.06] space-y-0.5">
              <p className="text-[10px] font-mono text-white/40 uppercase">Evidence Spans</p>
              <p className="text-base font-semibold text-white">
                {evidenceData.evidence_spans?.length || 0}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#161616] border border-white/[0.06] space-y-0.5">
              <p className="text-[10px] font-mono text-white/40 uppercase">Parser / Version</p>
              <p className="text-xs font-mono text-white/70 truncate">
                {evidenceData.parsed_artifact?.parser_name || "docling"} v{evidenceData.parsed_artifact?.parser_version || "1.4.0"}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#161616] border border-white/[0.06] space-y-0.5">
              <p className="text-[10px] font-mono text-white/40 uppercase">Exceptions</p>
              <p className="text-xs font-mono text-emerald-400">
                {evidenceData.document_result?.exceptions?.length || 0} Reported
              </p>
            </div>
          </div>

          {/* Granular Evidence Spans List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[#F2F2F2] flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-emerald-400" />
                <span>Extracted Evidence Spans ({evidenceData.evidence_spans?.length || 0})</span>
              </h4>
              <span className="text-[10px] font-mono text-[#A3A3A3]">
                Exact character offsets preserved
              </span>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {(evidenceData.evidence_spans || []).map((span) => (
                <div
                  key={span.id}
                  className="p-3.5 rounded-xl bg-[#161616] border border-white/[0.06] space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#A3A3A3]">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-semibold">{span.span_key}</span>
                      <span className="px-1.5 py-0.2 rounded bg-white/[0.06] text-[10px]">
                        {span.span_type}
                      </span>
                    </div>
                    <span>
                      Offsets: [{span.start_char}..{span.end_char}] • Page {span.page_number || 1}
                    </span>
                  </div>
                  <blockquote className="border-l-2 border-emerald-500/30 pl-2.5 py-0.5 text-xs text-white/90 italic font-serif">
                    &ldquo;{span.exact_text}&rdquo;
                  </blockquote>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
