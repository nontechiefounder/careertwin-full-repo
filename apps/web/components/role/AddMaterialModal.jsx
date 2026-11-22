"use client";

import { useState, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  X, Upload, FileText, User, RefreshCw, AlertCircle, CheckCircle2,
  Loader2, ShieldCheck, HelpCircle
} from "lucide-react";

/**
 * AddMaterialModal — Unified, typed intake flow supporting:
 * 1. Reference Role Context (rubrics, team guides, role specifications)
 * 2. Candidate Document (resumes, work samples, portfolios)
 * 3. Document Revision (superseding a prior authorized source)
 */
export default function AddMaterialModal({
  isOpen,
  onClose,
  hiringRunId,
  roleTitle,
  existingSources = [],
  onUploadSuccess,
  defaultType = "role_context"
}) {
  const [materialType, setMaterialType] = useState(defaultType); // 'role_context' | 'candidate_doc' | 'revision'
  const [files, setFiles] = useState([]);
  const [sourceKey, setSourceKey] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [targetSourceId, setTargetSourceId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [errors, setErrors] = useState([]);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      setFiles(selected);
      if (selected.length === 1 && !sourceKey) {
        setSourceKey(selected[0].name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files.length) {
      toast.error("Please select at least one document to upload.");
      return;
    }

    if (materialType === "revision" && !targetSourceId) {
      toast.error("Please select the target document being revised.");
      return;
    }

    setUploading(true);
    setErrors([]);
    setUploadProgress("Preparing upload...");

    const successfulUploads = [];
    const failedUploads = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}...`);

        const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `idem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("hiring_run_id", hiringRunId);
        formData.append("idempotency_key", idempotencyKey);

        let endpoint = "/employer/context-sources/upload";

        if (materialType === "candidate_doc") {
          endpoint = "/employer/candidate-documents/upload";
          formData.append("candidate_name", candidateName.trim() || file.name.replace(/\.[^/.]+$/, ""));
        } else {
          // Role Context or Revision
          const keyToUse = (files.length === 1 && sourceKey.trim()) ? sourceKey.trim() : file.name;
          formData.append("source_key", keyToUse);
          if (materialType === "revision" && targetSourceId) {
            formData.append("target_source_id", targetSourceId);
          }
        }

        try {
          const res = await api.post(endpoint, formData, {
            headers: { "Content-Type": undefined, "Idempotency-Key": idempotencyKey }
          });
          successfulUploads.push({ file: file.name, data: res.data });
        } catch (itemErr) {
          const errMsg = itemErr.response?.data?.details || itemErr.response?.data?.error || itemErr.message || "Upload failed";
          failedUploads.push({ file: file.name, error: errMsg });
        }
      }

      if (successfulUploads.length > 0) {
        toast.success(`Successfully uploaded ${successfulUploads.length} material document(s)`);
        if (onUploadSuccess) onUploadSuccess();
      }

      if (failedUploads.length > 0) {
        setErrors(failedUploads);
        toast.error(`${failedUploads.length} document(s) failed validation or upload.`);
      } else {
        // Reset and close
        setFiles([]);
        setSourceKey("");
        setCandidateName("");
        setTargetSourceId("");
        onClose();
      }
    } catch (err) {
      toast.error(err.message || "Unexpected failure during material ingestion.");
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl rounded-2xl border border-white/[0.12] bg-[#121212] p-6 shadow-2xl relative text-white space-y-5"
        role="dialog"
        aria-labelledby="add-material-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div>
            <h2 id="add-material-title" className="text-base font-semibold text-white/95">
              Add Material to Role
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              {roleTitle ? `${roleTitle} · ` : ""}Typed evidence and context intake
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Typed Intake Selector */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setMaterialType("role_context")}
            className={`p-3 rounded-xl border text-left transition-all ${
              materialType === "role_context"
                ? "border-[#00D604]/40 bg-[#00D604]/10 text-white"
                : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white/80 hover:bg-white/[0.04]"
            }`}
          >
            <FileText className={`h-4 w-4 mb-1.5 ${materialType === "role_context" ? "text-[#00D604]" : "text-white/40"}`} />
            <div className="text-xs font-semibold">Role Context</div>
            <div className="text-[10px] text-white/40 mt-0.5">Rubrics, engineering guides, specs</div>
          </button>

          <button
            type="button"
            onClick={() => setMaterialType("candidate_doc")}
            className={`p-3 rounded-xl border text-left transition-all ${
              materialType === "candidate_doc"
                ? "border-blue-500/40 bg-blue-500/10 text-white"
                : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white/80 hover:bg-white/[0.04]"
            }`}
          >
            <User className={`h-4 w-4 mb-1.5 ${materialType === "candidate_doc" ? "text-blue-400" : "text-white/40"}`} />
            <div className="text-xs font-semibold">Candidate Document</div>
            <div className="text-[10px] text-white/40 mt-0.5">Resume, work samples, portfolio</div>
          </button>

          <button
            type="button"
            onClick={() => setMaterialType("revision")}
            className={`p-3 rounded-xl border text-left transition-all ${
              materialType === "revision"
                ? "border-amber-500/40 bg-amber-500/10 text-white"
                : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white/80 hover:bg-white/[0.04]"
            }`}
          >
            <RefreshCw className={`h-4 w-4 mb-1.5 ${materialType === "revision" ? "text-amber-400" : "text-white/40"}`} />
            <div className="text-xs font-semibold">Document Revision</div>
            <div className="text-[10px] text-white/40 mt-0.5">Supersede existing source</div>
          </button>
        </div>

        {/* Dynamic Fields Based on Typed Destination */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {materialType === "candidate_doc" && (
            <div>
              <label className="block text-xs font-mono text-white/60 uppercase tracking-wider mb-1">
                Candidate Name / Identifier
              </label>
              <input
                type="text"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="e.g. Alex Morgan"
                className="w-full h-9 rounded-lg border border-white/[0.12] bg-[#1a1a1a] px-3 text-xs text-white placeholder:text-white/30 focus:border-[#00D604]/50 focus:outline-none"
              />
            </div>
          )}

          {materialType === "revision" && (
            <div>
              <label className="block text-xs font-mono text-white/60 uppercase tracking-wider mb-1">
                Select Source Document to Revise *
              </label>
              <select
                value={targetSourceId}
                onChange={(e) => setTargetSourceId(e.target.value)}
                className="w-full h-9 rounded-lg border border-white/[0.12] bg-[#1a1a1a] px-3 text-xs text-white focus:border-amber-500/50 focus:outline-none"
                required
              >
                <option value="">Select an existing source...</option>
                {existingSources.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.source_key || s.display_name || s.id} (v{s.current_version_number || 1})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-amber-300/80 mt-1">
                Uploading a revision creates a new immutable version and triggers approval review.
              </p>
            </div>
          )}

          {materialType === "role_context" && (
            <div>
              <label className="block text-xs font-mono text-white/60 uppercase tracking-wider mb-1">
                Document Label / Reference Key (Optional)
              </label>
              <input
                type="text"
                value={sourceKey}
                onChange={(e) => setSourceKey(e.target.value)}
                placeholder="e.g. backend_engineering_rubric_2026"
                className="w-full h-9 rounded-lg border border-white/[0.12] bg-[#1a1a1a] px-3 text-xs text-white placeholder:text-white/30 focus:border-[#00D604]/50 focus:outline-none"
              />
            </div>
          )}

          {/* Dropzone Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/[0.12] hover:border-[#00D604]/40 rounded-xl p-6 text-center cursor-pointer bg-white/[0.01] hover:bg-white/[0.03] transition-all"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple={materialType !== "revision"}
              accept=".pdf,.txt,.md"
              className="hidden"
            />
            <Upload className="h-6 w-6 text-white/30 mx-auto mb-2" />
            <p className="text-xs font-medium text-white/80">
              Click to select or drop files here
            </p>
            <p className="text-[10px] text-white/40 mt-1">
              Supported formats: PDF, Markdown, Text (up to 15MB)
            </p>
          </div>

          {/* Selected File Chips */}
          {files.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs">
                  <span className="truncate max-w-[340px] text-white/90">{file.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-white/40">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-white/40 hover:text-rose-400 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Batch Error Display */}
          {errors.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 space-y-1 text-xs text-rose-300">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-4 w-4" /> Upload Errors
              </div>
              {errors.map((err, i) => (
                <div key={i} className="text-[11px] font-mono">
                  {err.file}: {err.error}
                </div>
              ))}
            </div>
          )}

          {/* Progress Indicator */}
          {uploadProgress && (
            <div className="flex items-center gap-2 text-xs font-mono text-[#00D604]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {uploadProgress}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || files.length === 0}
              className="px-4 py-2 rounded-xl bg-[#00D604] text-black font-semibold text-xs hover:bg-[#00D604]/90 transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-md"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ingesting Material...
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" /> Ingest {files.length} Document{files.length === 1 ? "" : "s"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

