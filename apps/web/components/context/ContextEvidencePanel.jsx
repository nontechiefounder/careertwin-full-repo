"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import api from '@/lib/api';
import {
  FileText,
  Upload,
  RefreshCw,
  Search,
  AlertCircle,
  Clock,
  ChevronRight,
  Info,
  Trash2,
  X,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Database,
  Network,
  Cpu
} from 'lucide-react';

export default function ContextEvidencePanel({ hiringRunId, orgId, userRole = 'recruiter' }) {
  const [sources, setSources] = useState([]);
  const [selected, setSelected] = useState(null);
  const [inspectedDoc, setInspectedDoc] = useState(null);
  const [files, setFiles] = useState([]);
  const [sourceKey, setSourceKey] = useState('');
  const [revisionTarget, setRevisionTarget] = useState(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const [batchErrors, setBatchErrors] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [retrievalMode, setRetrievalMode] = useState('search');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [retryingSourceId, setRetryingSourceId] = useState(null);

  const fileInputRef = useRef(null);
  const activeRunRef = useRef(hiringRunId);
  const abortControllersRef = useRef(new Set());
  const idempotencyKeysRef = useRef(new WeakMap());

  const isAuditor = userRole === 'auditor';

  // Helper to register abort controller
  const createController = useCallback(() => {
    const controller = new AbortController();
    abortControllersRef.current.add(controller);
    return controller;
  }, []);

  const removeController = useCallback((controller) => {
    abortControllersRef.current.delete(controller);
  }, []);

  // Cancel all in-flight requests
  const abortAllInFlight = useCallback(() => {
    abortControllersRef.current.forEach((c) => {
      try { c.abort(); } catch (_) {}
    });
    abortControllersRef.current.clear();
  }, []);

  // Safe refresh ensuring run isolation
  const refresh = useCallback(async (targetRunId = activeRunRef.current) => {
    if (!targetRunId || targetRunId !== activeRunRef.current) return;
    const controller = createController();
    try {
      const res = await api.get(`/employer/context-sources?hiring_run_id=${encodeURIComponent(targetRunId)}`, {
        signal: controller.signal
      });
      if (activeRunRef.current !== targetRunId) return;
      setSources(res.data.sources || []);
      setError('');
    } catch (e) {
      if (activeRunRef.current !== targetRunId || e.name === 'CanceledError' || e.name === 'AbortError') return;
      setError(e.response?.data?.error || 'Could not load document status.');
    } finally {
      removeController(controller);
    }
  }, [createController, removeController]);

  // Effect: When hiringRunId changes, cancel in-flight requests and clear state completely
  useEffect(() => {
    activeRunRef.current = hiringRunId;
    abortAllInFlight();
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled || activeRunRef.current !== hiringRunId) return;
      // Reset run-specific state
      setSources([]);
      setSelected(null);
      setInspectedDoc(null);
      setFiles([]);
      setSourceKey('');
      setRevisionTarget(null);
      setUploadProgress('');
      setBatchErrors([]);
      setError('');
      setResult(null);
      setQuestion('');
      setBusy(false);
      setDeleteConfirm(false);
      setRetryingSourceId(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (hiringRunId) {
        refresh(hiringRunId);
      }
    });

    return () => {
      cancelled = true;
      abortAllInFlight();
    };
  }, [hiringRunId, abortAllInFlight, refresh]);

  // Continuous polling effect while any document version stage remains active
  useEffect(() => {
    const hasActiveStages = sources.some((s) =>
      s.state === 'pending' || s.state === 'processing' ||
      s.parsing_state === 'pending' || s.parsing_state === 'processing' ||
      s.indexing_state === 'pending' || s.indexing_state === 'running' || s.indexing_state === 'retrying' || s.indexing_state === 'partially_indexed' ||
      s.projection_state === 'pending' || s.projection_state === 'running'
    );
    if (!hasActiveStages) return;
    const currentRun = activeRunRef.current;
    const interval = setInterval(() => {
      if (activeRunRef.current === currentRun) {
        refresh(currentRun);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [sources, hiringRunId, refresh]);

  const latestSelected = sources.find((s) => s.source_id === selected);
  const active = (inspectedDoc && inspectedDoc.source_id === selected) ? inspectedDoc : latestSelected;

  async function inspectVersion(sourceId, versionNumber) {
    const targetRunId = activeRunRef.current;
    if (!sourceId || !targetRunId) return;
    const controller = createController();
    try {
      const qs = new URLSearchParams({ hiring_run_id: targetRunId });
      if (versionNumber != null) qs.set('version', String(versionNumber));
      const res = await api.get(
        `/employer/context-sources/${encodeURIComponent(sourceId)}/evidence?${qs.toString()}`,
        { signal: controller.signal }
      );
      if (activeRunRef.current !== targetRunId) return;
      setInspectedDoc(res.data);
    } catch (e) {
      if (activeRunRef.current !== targetRunId || e.name === 'CanceledError' || e.name === 'AbortError') return;
      setError(e.response?.data?.error || 'Could not load version details.');
    } finally {
      removeController(controller);
    }
  }

  async function upload(e) {
    e.preventDefault();
    const runForUpload = activeRunRef.current;
    if (!files.length || !runForUpload || isAuditor) return;
    setBusy(true);
    setError('');
    setBatchErrors([]);
    setUploadProgress('');

    const controller = createController();
    const errorsEncountered = [];
    const successfulIndices = new Set();
    let lastSuccessfulSourceId = null;

    try {
      for (let i = 0; i < files.length; i++) {
        const currentFile = files[i];
        if (files.length > 1) {
          setUploadProgress(`Uploading ${i + 1} of ${files.length}: ${currentFile.name}...`);
        } else {
          setUploadProgress(`Uploading ${currentFile.name}...`);
        }

        // Maintain persistent idempotency key per logical item without mutating state objects
        const existingKey = idempotencyKeysRef.current.get(currentFile);
        const idempotencyKey = existingKey || (
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `idem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        );
        if (!existingKey) {
          idempotencyKeysRef.current.set(currentFile, idempotencyKey);
        }

        const form = new FormData();
        form.set('file', currentFile);
        form.set('hiring_run_id', runForUpload);
        form.set('idempotency_key', idempotencyKey);

        if (revisionTarget && revisionTarget.source_id) {
          form.set('target_source_id', revisionTarget.source_id);
        }

        const keyToUse = (files.length === 1 && sourceKey.trim())
          ? sourceKey.trim()
          : currentFile.name;
        form.set('source_key', keyToUse);

        try {
          const response = await api.post('/employer/context-sources/upload', form, {
            headers: {
              'Content-Type': undefined,
              'Idempotency-Key': idempotencyKey
            },
            signal: controller.signal
          });

          if (activeRunRef.current !== runForUpload) return;
          successfulIndices.add(i);
          if (response.data?.source_id) {
            lastSuccessfulSourceId = response.data.source_id;
          }
        } catch (itemErr) {
          if (activeRunRef.current !== runForUpload || itemErr.name === 'CanceledError' || itemErr.name === 'AbortError') return;
          const rawErr = itemErr.response?.data?.error || itemErr.message || 'Upload failed';
          const displayErr = rawErr === 'FILE_TOO_LARGE' ? 'FILE_TOO_LARGE (exceeds 50 MB limit)' : rawErr;
          errorsEncountered.push({
            filename: currentFile.name,
            error: displayErr
          });
        }
      }

      if (lastSuccessfulSourceId) {
        setSelected(lastSuccessfulSourceId);
      }

      // Preserve failed items for retry with their existing idempotencyKey; remove succeeded items
      const remainingFiles = files.filter((_, idx) => !successfulIndices.has(idx));
      setFiles(remainingFiles);

      if (remainingFiles.length === 0) {
        setSourceKey('');
        setRevisionTarget(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }

      if (errorsEncountered.length > 0) {
        setBatchErrors(errorsEncountered);
      }

      await refresh(runForUpload);
    } catch (e) {
      if (activeRunRef.current !== runForUpload || e.name === 'CanceledError' || e.name === 'AbortError') return;
      setError(e.response?.data?.error || 'Batch upload encountered unexpected failure.');
    } finally {
      setUploadProgress('');
      removeController(controller);
      if (activeRunRef.current === runForUpload) {
        setBusy(false);
      }
    }
  }

  async function retrySource(sourceId) {
    const runForRetry = activeRunRef.current;
    if (!sourceId || !runForRetry || isAuditor) return;
    setRetryingSourceId(sourceId);
    setError('');

    const controller = createController();
    try {
      await api.post(`/employer/context-sources/${encodeURIComponent(sourceId)}/retry?hiring_run_id=${encodeURIComponent(runForRetry)}`, {
        hiring_run_id: runForRetry
      }, {
        signal: controller.signal
      });
      if (activeRunRef.current !== runForRetry) return;
      await refresh(runForRetry);
    } catch (e) {
      if (activeRunRef.current !== runForRetry || e.name === 'CanceledError' || e.name === 'AbortError') return;
      setError(e.response?.data?.error || 'Failed to trigger retry.');
    } finally {
      removeController(controller);
      setRetryingSourceId(null);
    }
  }

  async function deleteSource(sourceId) {
    const runForDelete = activeRunRef.current;
    if (!sourceId || !runForDelete || isAuditor) return;
    setBusy(true);
    setError('');

    const controller = createController();
    try {
      await api.delete(`/employer/context-sources/${encodeURIComponent(sourceId)}?hiring_run_id=${encodeURIComponent(runForDelete)}`, {
        signal: controller.signal
      });

      if (activeRunRef.current !== runForDelete) return;
      setSelected(null);
      setDeleteConfirm(false);
      await refresh(runForDelete);
    } catch (e) {
      if (activeRunRef.current !== runForDelete || e.name === 'CanceledError' || e.name === 'AbortError') return;
      setError(e.response?.data?.error || 'Failed to revoke document.');
    } finally {
      removeController(controller);
      if (activeRunRef.current === runForDelete) {
        setBusy(false);
      }
    }
  }

  async function search(e) {
    e.preventDefault();
    const runForSearch = activeRunRef.current;
    if (!runForSearch || question.trim().length < 3) return;
    setBusy(true);
    setError('');
    setResult(null);

    const controller = createController();
    try {
      let endpoint = '/employer/context-sources/search';
      if (retrievalMode === 'related') {
        endpoint = '/employer/context-sources/related';
      } else if (retrievalMode === 'qa') {
        endpoint = '/employer/context-sources/ask';
      }

      const r = await api.post(
        endpoint,
        { hiring_run_id: runForSearch, question: question.trim() },
        { signal: controller.signal }
      );

      if (activeRunRef.current !== runForSearch) return;
      setResult(r.data);
    } catch (e) {
      if (activeRunRef.current !== runForSearch || e.name === 'CanceledError' || e.name === 'AbortError') return;
      if (e.response?.status === 503 && (retrievalMode === 'qa' || e.response?.data?.error === 'FEATURE_GATED_GENERATION' || e.response?.data?.error === 'GENERATION_NOT_IMPLEMENTED' || e.response?.data?.error === 'BLOCKED_PENDING_KEY_ROTATION')) {
        setError('Generative Q&A is feature-gated until formal acceptance testing phase. Hybrid passage retrieval remains fully operational.');
      } else if (e.response?.status === 503 && (e.response?.data?.error === 'GRAPH_PROJECTION_UNAVAILABLE' || retrievalMode === 'related')) {
        setError('Knowledge graph retrieval is unavailable: graph service is currently unprovisioned or disabled.');
      } else {
        setError(e.response?.data?.error || 'Search failed.');
      }
    } finally {
      removeController(controller);
      if (activeRunRef.current === runForSearch) {
        setBusy(false);
      }
    }
  }

  const getStateBadge = (state) => {
    switch (state) {
      case 'completed':
      case 'pending':
        return {
          label: 'completed',
          className: 'bg-[#00D604]/15 text-[#00D604] border border-[#00D604]/30',
        };
      case 'partial':
        return {
          label: 'partial',
          className: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
        };
      case 'failed':
      default:
        return {
          label: state || 'failed',
          className: 'bg-red-500/15 text-red-400 border border-red-500/30',
        };
    }
  };

  const getSubsystemBadge = (status) => {
    switch (status) {
      case 'completed':
      case 'indexed':
      case 'projected':
        return { label: status, color: 'text-[#00D604] bg-[#00D604]/10 border-[#00D604]/30' };
      case 'partial':
      case 'lexical_only':
        return { label: status, color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' };
      case 'disabled':
      case 'unprojected':
      case 'missing':
        return { label: status, color: 'text-[#888888] bg-[#222222] border-[#343434]' };
      case 'pending':
      case 'reindex_required':
        return { label: status, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30 animate-pulse' };
      case 'running':
        return { label: 'running', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30 animate-pulse' };
      case 'retrying':
        return { label: 'retrying', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30 animate-pulse' };
      case 'failed':
      default:
        return { label: status || 'failed', color: 'text-red-400 bg-red-500/10 border-red-500/30' };
    }
  };

  return (
    <section
      aria-label="Context evidence"
      data-testid="context-evidence-panel"
      className="rounded-xl border border-[#343434] bg-[#141414] p-5 space-y-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[#F2F2F2] flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#00D604]" />
            Document Context & Evidence Repository
          </h2>
          <p className="text-xs text-[#A3A3A3] mt-1 leading-relaxed">
            Authoritative source material for recruiter review. Evidence retrieval does not verify competence or modify approved hiring rubrics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh(activeRunRef.current)}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#A3A3A3] hover:text-[#F2F2F2] hover:border-[#4A4A4A] transition-colors shrink-0 flex items-center gap-1.5 disabled:opacity-50"
          data-testid="refresh-context-sources-btn"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isAuditor && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-2.5 text-xs text-purple-200 flex items-center gap-2">
          <Info className="h-4 w-4 text-purple-400 shrink-0" />
          <span>Auditor Mode: Read-only access to evidence and audit ledgers. Document upload, revision, and revocation are restricted to recruiters and owners.</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-200 text-xs flex items-center gap-2"
          data-testid="context-evidence-error"
        >
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {batchErrors.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200 text-xs space-y-1">
          <div className="font-semibold flex items-center gap-1.5 text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Partial Batch Results (successful uploads preserved):
          </div>
          <ul className="list-disc list-inside text-[11px] space-y-0.5">
            {batchErrors.map((be, idx) => (
              <li key={idx}>
                <strong>{be.filename}</strong>: {be.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upload Form */}
      {!isAuditor && (
        <form onSubmit={upload} className="rounded-lg border border-[#262626] bg-[#1A1A1A] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#F2F2F2] flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5 text-[#00D604]" />
              Upload Candidate / Reference Documents
            </h3>
            {revisionTarget && (
              <div className="flex items-center gap-1.5 text-[11px] bg-[#00D604]/10 text-[#00D604] border border-[#00D604]/30 px-2 py-0.5 rounded">
                <span>Target: revising <strong>{revisionTarget.source_key}</strong> (v{revisionTarget.version + 1})</span>
                <button
                  type="button"
                  onClick={() => {
                    setRevisionTarget(null);
                    setSourceKey('');
                  }}
                  className="hover:text-white ml-1"
                  title="Cancel revision"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#A3A3A3] mb-1">
                Select Document(s) (.pdf, .docx, .txt, .md, .csv)
              </label>
              <input
                ref={fileInputRef}
                aria-label="Choose document"
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.csv"
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []).map((f) => {
                    f.idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
                      ? crypto.randomUUID()
                      : `idem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    return f;
                  });
                  setFiles(picked);
                  if (picked.length > 1) {
                    setRevisionTarget(null);
                    setSourceKey('');
                  }
                }}
                className="w-full text-xs text-[#A3A3A3] file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border file:border-[#343434] file:bg-[#222222] file:text-[#F2F2F2] file:text-xs file:font-medium hover:file:bg-[#2A2A2A] cursor-pointer"
              />
              {files.length > 1 && (
                <p className="text-[11px] text-[#00D604] mt-1.5">
                  {files.length} documents selected. Each will be assigned an independent server identity.
                </p>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#A3A3A3] mb-1">
                Source Key (display identifier)
              </label>
              <input
                value={sourceKey}
                disabled={files.length > 1}
                onChange={(e) => setSourceKey(e.target.value)}
                placeholder={files.length > 1 ? "Auto-assigned to each filename" : "Keep key to upload revised version"}
                className="w-full px-3 py-1.5 rounded-md border border-[#343434] bg-[#222222] text-xs text-[#F2F2F2] placeholder-[#666666] focus:outline-none focus:border-[#00D604] disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-[11px] text-[#888888]">
              {uploadProgress ? (
                <span className="text-[#00D604] animate-pulse">{uploadProgress}</span>
              ) : files.length > 0 ? (
                <span>Ready to upload {files.length} document{files.length > 1 ? 's' : ''}</span>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={busy || files.length === 0}
              className="px-3.5 py-1.5 rounded-lg border border-[#00D604]/50 bg-[#00D604] text-xs font-semibold text-[#0E0E0E] hover:bg-[#00D604]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              data-testid="upload-context-source-btn"
            >
              <Upload className="h-3.5 w-3.5" />
              {busy
                ? (uploadProgress || 'Processing...')
                : files.length > 1
                ? `Upload ${files.length} Documents & Queue Processing`
                : revisionTarget
                ? `Upload Revision (v${revisionTarget.version + 1})`
                : 'Upload & Queue Processing'}
            </button>
          </div>
        </form>
      )}

      {/* Sources List */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-[#A3A3A3] uppercase tracking-wider">
          Indexed Documents ({sources.length})
        </h3>
        {sources.length === 0 ? (
          <p className="text-xs text-[#666666] py-3 text-center border border-dashed border-[#262626] rounded-lg">
            No document evidence uploaded for this hiring run yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {sources.map((s) => {
              const isSelected = s.source_id === selected;
              const badge = getStateBadge(s.state);
              return (
                <div
                  key={s.source_id}
                  onClick={() => {
                    setSelected(s.source_id);
                    setInspectedDoc(null);
                    setDeleteConfirm(false);
                  }}
                  className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-[#00D604]/60 bg-[#00D604]/5'
                      : 'border-[#262626] bg-[#1A1A1A] hover:border-[#383838]'
                  }`}
                  data-testid={`context-source-item-${s.source_id}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="h-4 w-4 text-[#A3A3A3] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#F2F2F2] truncate">
                        {s.source_key || s.filename || s.source_id}
                      </div>
                      <div className="text-[10px] text-[#A3A3A3] font-mono mt-0.5 truncate">
                        v{s.version} • {s.source_id.slice(0, 18)}...
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-[#666666]" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Source Details Inspection */}
      {active && (
        <article
          className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-4 space-y-3"
          data-testid="active-source-inspector"
        >
          <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2">
            <div>
              <h4 className="text-xs font-semibold text-[#F2F2F2]">
                Source Inspection: {active.source_key || active.source_id}
              </h4>
              <div className="text-[10px] font-mono text-[#A3A3A3] mt-0.5 flex items-center gap-2 flex-wrap">
                <span data-testid="active-version-label">Version {active.version} (Job State: {active.state})</span>
                {(active.versions || latestSelected?.versions || []).length > 1 && (
                  <div className="inline-flex items-center gap-1 ml-1" data-testid="version-history-selector">
                    {(active.versions || latestSelected?.versions || []).map((v) => (
                      <button
                        key={v.version_id || v.version}
                        type="button"
                        onClick={() => inspectVersion(active.source_id, v.version)}
                        data-testid={`version-selector-btn-${v.version}`}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                          active.version === v.version
                            ? 'border-[#00D604] bg-[#00D604]/20 text-[#00D604]'
                            : 'border-[#343434] bg-[#222222] text-[#A3A3A3] hover:text-[#F2F2F2]'
                        }`}
                      >
                        v{v.version}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(active.state === 'failed' || active.parsing_state === 'failed' || active.indexing_state === 'failed' || active.projection_state === 'failed') && !isAuditor && (
                <button
                  type="button"
                  onClick={() => retrySource(active.source_id)}
                  disabled={retryingSourceId === active.source_id}
                  className="px-2.5 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-300 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className={`h-3 w-3 ${retryingSourceId === active.source_id ? 'animate-spin' : ''}`} />
                  Retry Processing
                </button>
              )}

              {!isAuditor && (
                <button
                  type="button"
                  onClick={() => {
                    setRevisionTarget(active);
                    setSourceKey(active.source_key || '');
                    if (fileInputRef.current) {
                      fileInputRef.current.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className="px-2.5 py-1 rounded border border-[#343434] bg-[#222222] text-[11px] text-[#A3A3A3] hover:text-[#00D604] hover:border-[#00D604]/40 transition-colors flex items-center gap-1.5"
                  title="Revise this document"
                >
                  <RotateCcw className="h-3 w-3" />
                  Revise Document
                </button>
              )}

              {!isAuditor && (!deleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(true)}
                  className="px-2.5 py-1 rounded border border-[#343434] bg-[#222222] text-[11px] text-[#A3A3A3] hover:text-red-400 hover:border-red-500/40 transition-colors flex items-center gap-1.5"
                  title="Revoke document"
                >
                  <Trash2 className="h-3 w-3" />
                  Revoke
                </button>
              ) : (
                <div className="flex flex-col gap-1.5 bg-red-500/10 border border-red-500/30 p-2 rounded text-[11px] max-w-sm">
                  <span className="text-red-300 font-medium">Revoke document from active indexes?</span>
                  <p className="text-[10px] text-red-200/80">
                    Tombstones document in search & graph indexes. Original raw document bytes are preserved in private storage.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => deleteSource(active.source_id)}
                      className="px-2 py-0.5 rounded bg-red-500 text-white font-semibold hover:bg-red-600 text-[10px]"
                    >
                      Confirm Revocation
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(false)}
                      className="text-[#A3A3A3] hover:underline text-[10px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subsystem States */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1">
            <div className="rounded border border-[#2A2A2A] bg-[#161616] p-2">
              <div className="text-[10px] text-[#888888] flex items-center gap-1">
                <Cpu className="h-3 w-3" /> Parsing Status
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {(() => {
                  const pStatus = active.parsing_state || active.state || 'missing';
                  return (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getSubsystemBadge(pStatus).color}`}>
                      {pStatus}
                    </span>
                  );
                })()}
              </div>
              {active.parsing_error && (
                <div className="text-[10px] text-red-400 mt-1 truncate" title={active.parsing_error}>
                  {active.parsing_error}
                </div>
              )}
            </div>

            <div className="rounded border border-[#2A2A2A] bg-[#161616] p-2">
              <div className="text-[10px] text-[#888888] flex items-center gap-1">
                <Database className="h-3 w-3" /> Semantic Search Index
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {(() => {
                  const iStatus = active.indexing_state || 'missing';
                  return (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getSubsystemBadge(iStatus).color}`}>
                      {iStatus}
                    </span>
                  );
                })()}
              </div>
            </div>

            <div className="rounded border border-[#2A2A2A] bg-[#161616] p-2">
              <div className="text-[10px] text-[#888888] flex items-center gap-1">
                <Network className="h-3 w-3" /> Role Knowledge Graph
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {(() => {
                  const gStatus = active.projection_state || 'disabled';
                  return (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getSubsystemBadge(gStatus).color}`}>
                      {gStatus}
                    </span>
                  );
                })()}
              </div>
              {active.projection_error && (
                <div className="text-[10px] text-amber-400 mt-1 truncate" title={active.projection_error}>
                  {active.projection_error}
                </div>
              )}
            </div>
          </div>

          {/* Partial Processing Notice */}
          {(active.state === 'partial' || active.parsing_state === 'partial') && (
            <div className="rounded border border-sky-500/40 bg-sky-500/10 p-2.5 text-xs text-sky-200 space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-sky-300">
                <Info className="h-3.5 w-3.5" />
                Partial Processing Notice:
              </div>
              <p className="text-[11px] leading-relaxed">
                Some pages or embedded diagrams in this document did not contain native digital text. Extracted text spans represent all successfully read native pages. Non-native pages require recruiter visual inspection of original bytes.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#A3A3A3]">
            <div>
              <span className="text-[#666666]">Original SHA-256:</span>{' '}
              <span className="font-mono text-[#CCCCCC] break-all">{active.original_sha256}</span>
            </div>
            <div>
              <span className="text-[#666666]">Parser Engine:</span>{' '}
              <span className="font-mono text-[#CCCCCC]">{active.parser || active.parser_engine || 'Unavailable'}</span>
            </div>
            <div>
              <span className="text-[#666666]">Pages with native text:</span>{' '}
              <span className="font-mono text-[#CCCCCC]">
                {active.pages_with_text != null ? active.pages_with_text : (active.pages_total || 1)} / {active.pages_total != null ? active.pages_total : 1}
              </span>
            </div>
            <div>
              <span className="text-[#666666]">Source Identity:</span>{' '}
              <span className="font-mono text-[#CCCCCC] break-all">{active.source_id}</span>
            </div>
          </div>

          {active.exceptions && active.exceptions.length > 0 && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
              <span className="font-semibold">Processing notices:</span>
              <ul className="list-disc list-inside mt-1">
                {active.exceptions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}

          {active.spans && active.spans.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-semibold text-[#A3A3A3] uppercase tracking-wider">
                Extracted Spans ({active.spans.length})
              </span>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {active.spans.map((s) => (
                  <blockquote
                    key={s.span_id}
                    className="p-2.5 rounded border border-[#2A2A2A] bg-[#141414] text-xs text-[#E5E5E5] space-y-1"
                  >
                    <p>{s.text}</p>
                    <footer className="text-[10px] text-[#777777] font-mono">
                      Page {s.page ?? 'unknown'}, offsets [{s.start}, {s.end}) Unicode code points.
                    </footer>
                  </blockquote>
                ))}
              </div>
            </div>
          )}
        </article>
      )}

      {/* Retrieval & Search Form */}
      <form onSubmit={search} className="rounded-lg border border-[#262626] bg-[#1A1A1A] p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[#F2F2F2] flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-[#00D604]" />
          Evidence Passage Retrieval & Inquiries
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[#A3A3A3] mb-1">
              Inquiry Mode
            </label>
            <select
              aria-label="Retrieval strategy"
              value={retrievalMode}
              onChange={(e) => {
                setRetrievalMode(e.target.value);
                setResult(null);
                setError('');
              }}
              className="w-full px-3 py-1.5 rounded-md border border-[#343434] bg-[#222222] text-xs text-[#F2F2F2] focus:outline-none focus:border-[#00D604]"
            >
              <option value="search">Verified Document & Semantic Search</option>
              <option value="related">Related Evidence via Role Knowledge Graph</option>
              <option value="qa">Evidence Q&A (Feature-Gated Model Flow)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-[#A3A3A3] mb-1">
              Query / Question
            </label>
            <input
              aria-label="Find evidence"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. distributed consensus replication experience"
              className="w-full px-3 py-1.5 rounded-md border border-[#343434] bg-[#222222] text-xs text-[#F2F2F2] placeholder-[#666666] focus:outline-none focus:border-[#00D604]"
            />
          </div>
        </div>

        {retrievalMode === 'related' && (
          <div className="rounded border border-blue-500/30 bg-blue-500/10 p-2.5 text-xs text-blue-200 flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <span>
              Knowledge graph connects derived entities from your role documents. If knowledge graph services are unprovisioned, queries safely fail closed with 503 rather than fabricating relationships.
            </span>
          </div>
        )}

        {retrievalMode === 'qa' && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200 flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Bounded LangGraph Question-Answering. Generated answers remain feature-gated until formal acceptance testing phase. If gated, engine abstains and returns 503.
            </span>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={busy || question.trim().length < 3}
            className="px-3.5 py-1.5 rounded-lg border border-[#343434] bg-[#222222] text-xs font-semibold text-[#F2F2F2] hover:bg-[#2A2A2A] hover:border-[#00D604]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            data-testid="search-passages-btn"
          >
            <Search className="h-3.5 w-3.5" />
            {busy ? 'Querying...' : retrievalMode === 'qa' ? 'Ask Question' : 'Search Passages'}
          </button>
        </div>
      </form>

      {/* Retrieval & QA Results */}
      {result && (
        <article
          className="rounded-lg border border-[#2A2A2A] bg-[#161616] p-4 space-y-3"
          data-testid="context-search-results"
        >
          <div className="border-b border-[#2A2A2A] pb-2">
            <div className="text-xs font-semibold text-[#F2F2F2]">
              {retrievalMode === 'qa' ? 'Generated Evidence Inquiry Result' : `Retrieved Evidence Passages (${result.passages?.length || 0})`}
            </div>
            {result.disclaimer && (
              <p className="text-[10px] text-amber-300/80 font-mono mt-0.5">
                {result.disclaimer}
              </p>
            )}
          </div>

          {result.status && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#888888]">Verification Status:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                result.status === 'GROUNDED' ? 'bg-[#00D604]/15 text-[#00D604]' : 'bg-amber-500/15 text-amber-300'
              }`}>
                {result.status}
              </span>
            </div>
          )}

          {result.answer && (
            <div className="p-3 rounded border border-[#262626] bg-[#1A1A1A] text-xs text-[#F2F2F2] space-y-2">
              <div className="font-semibold text-[#00D604]">Synthesized Answer:</div>
              <p className="leading-relaxed">{result.answer}</p>
            </div>
          )}

          {result.claims && result.claims.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-[#A3A3A3] uppercase tracking-wider">
                Claim Verification:
              </div>
              <ul className="space-y-1">
                {result.claims.map((c, i) => (
                  <li key={i} className="text-xs text-[#CCCCCC] p-2 rounded bg-[#141414] border border-[#222222]">
                    <div className="font-medium">{c.claim}</div>
                    <div className="text-[10px] text-[#777777] mt-0.5">
                      Support: {c.supported ? 'Supported' : 'Unverified'} • Source: {c.source_span || 'N/A'}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.passages && result.passages.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#A3A3A3] uppercase tracking-wider">
                Attributed Citations:
              </div>
              {result.passages.map((p, idx) => (
                <blockquote
                  key={p.span_id || idx}
                  className="p-3 rounded border border-[#262626] bg-[#1A1A1A] text-xs text-[#E5E5E5] space-y-1"
                >
                  <p>{p.text}</p>
                  <footer className="text-[10px] text-[#777777] font-mono flex items-center gap-3">
                    <span>Source: {p.source_id?.slice(0, 12)}...</span>
                    <span>Version: {p.version_id?.slice(0, 12)}...</span>
                    <span>Page: {p.page ?? 'unknown'}</span>
                    {p.rrf_score && <span>RRF Score: {p.rrf_score.toFixed(4)}</span>}
                  </footer>
                </blockquote>
              ))}
            </div>
          ) : !result.answer ? (
            <p className="text-xs text-[#666666] py-3 text-center border border-dashed border-[#262626] rounded-lg">
              No matching evidence passages found for this query.
            </p>
          ) : null}
        </article>
      )}
    </section>
  );
}
