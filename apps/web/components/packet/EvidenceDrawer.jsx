"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, FileText, Hash, Check, Copy, HardDrive, Layers, Compass } from "lucide-react";

export default function EvidenceDrawer({ isOpen, onClose, evidenceRef, triggerElement }) {
  const [copiedHash, setCopiedHash] = useState(false);
  const [lastRef, setLastRef] = useState(evidenceRef);

  if (evidenceRef && evidenceRef !== lastRef) {
    setLastRef(evidenceRef);
  }

  const activeRef = evidenceRef || lastRef;

  const restoreFocus = () => {
    const filename = activeRef?.filename;
    const triggerId = activeRef ? `evidence-citation-trigger-${activeRef.id || (filename ? filename.replace(/[^a-z0-9]/gi, '_') : '')}` : null;
    const focusTarget = (triggerId && document.getElementById(triggerId)) || (filename && document.querySelector(`button[aria-label*="${filename}"]`)) || triggerElement;
    
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  };

  const handleClose = () => {
    onClose();
    restoreFocus();
  };

  if (!activeRef) return null;

  const filename = activeRef.filename || "Not available";
  const sourceType = activeRef.mime_type || activeRef.source_type || (activeRef.filename?.endsWith(".pdf") ? "application/pdf" : "Not available");
  const excerpt = activeRef.excerpt || activeRef.text_span || activeRef.description || "Not available";
  
  let pageVal = activeRef.page ?? activeRef.source_offset?.page ?? null;
  let paraVal = activeRef.source_offset?.paragraph_id ?? null;
  let rowVal = activeRef.source_offset?.row_index ?? null;
  let locator = "Not available";

  if (typeof activeRef.locator === "object" && activeRef.locator !== null) {
    const parts = [];
    if (activeRef.locator.page != null) {
      pageVal = activeRef.locator.page;
      parts.push(`Page ${pageVal}`);
    }
    if (activeRef.locator.paragraph_id != null) {
      paraVal = activeRef.locator.paragraph_id;
      parts.push(`Paragraph ${paraVal}`);
    }
    if (activeRef.locator.row_index != null) {
      rowVal = activeRef.locator.row_index;
      parts.push(`Row ${rowVal}`);
    }
    if (parts.length > 0) locator = parts.join(" · ");
  } else if (typeof activeRef.locator === "string" && activeRef.locator) {
    locator = activeRef.locator;
  }

  if (pageVal != null && (locator === "Not available" || !locator)) {
    locator = `Page ${pageVal}`;
  }

  const startOffset = activeRef.source_offset?.start_offset ?? activeRef.start_offset ?? null;
  const endOffset = activeRef.source_offset?.end_offset ?? activeRef.end_offset ?? null;
  const excerptHash = activeRef.excerpt_hash || activeRef.source_offset?.excerpt_hash || "Not available";
  
  // PART 1.A: Strict File Hash Truth semantics
  // Physical File Hash must never substitute normalized_text_sha256
  const physicalFileHash = activeRef.file_sha256 || activeRef.file_hash || activeRef.sha256 || "Not available";
  const normTextSha256 = activeRef.normalized_text_sha256 || "Not available";

  const parserVersion = activeRef.parser_name || activeRef.parser_version || activeRef.parser || "Not available";
  const docId = activeRef.document_id || activeRef.source_document_id || activeRef.id || "Not available";

  const handleCopyHash = async () => {
    if (excerptHash === "Not available") return;
    try {
      await navigator.clipboard.writeText(excerptHash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    } catch (e) {}
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid="evidence-drawer"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            restoreFocus();
          }}
          className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg border-l border-white/10 bg-[#111111] p-6 shadow-2xl overflow-y-auto flex flex-col justify-between gap-6 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
        >
          <div className="space-y-6">
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="space-y-1">
                <DialogPrimitive.Title className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#00D604]" />
                  Evidence Source Citation
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-white/50 font-mono">
                  {filename !== "Not available" ? (sourceType && sourceType !== "Not available" ? (filename + " (" + sourceType + ")") : filename) : (filename + " (" + (sourceType || "Not available") + ")")}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                onClick={handleClose}
                className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#00D604]"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close Evidence Citation Drawer</span>
              </DialogPrimitive.Close>
            </div>

            {/* Bounded Excerpt Context Block */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[#00D604] font-bold flex items-center gap-1.5">
                <Layers className="h-3 w-3" />
                Document Excerpt Context
              </label>
              <div className="p-4 rounded-xl border border-[#00D604]/30 bg-[#00D604]/[0.03] text-xs text-white/90 leading-relaxed font-mono">
                &quot;{excerpt}&quot;
              </div>
            </div>

            {/* Provenance Metadata Grid */}
            <div className="space-y-3 pt-2">
              <div className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                  <Compass className="h-3 w-3 text-blue-400" />
                  Source Locator & Offsets
                </span>
                <p data-testid="citation-locator" className="text-xs font-mono text-white/80">{locator}</p>
                {pageVal != null && <p className="text-[11px] font-mono text-white/60">Page: {pageVal}</p>}
                {paraVal != null && <p className="text-[11px] font-mono text-white/60">Paragraph ID: {paraVal}</p>}
                {rowVal != null && <p className="text-[11px] font-mono text-white/60">Row Index: {rowVal}</p>}
                <p data-testid="citation-offsets" className="text-[11px] font-mono text-white/50">
                  Normalized-Text Slice: {startOffset != null && endOffset != null ? `[${startOffset} - ${endOffset}] (${endOffset - startOffset} characters)` : "Not available"}
                </p>
              </div>

              <div className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                    <Hash className="h-3 w-3 text-amber-400" />
                    Excerpt SHA-256 Hash
                  </span>
                  {excerptHash !== "Not available" && (
                    <button
                      type="button"
                      onClick={handleCopyHash}
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-white/40 hover:text-[#00D604] transition-colors"
                    >
                      {copiedHash ? (
                        <>
                          <Check className="h-3 w-3 text-[#00D604]" />
                          <span className="text-[#00D604]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <p data-testid="citation-excerpt-hash" className="text-[11px] font-mono text-white/80 break-all">{excerptHash}</p>
              </div>

              {/* PART 1.A: Separately labeled Physical File Hash & Normalized Text SHA-256 */}
              <div className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                  <HardDrive className="h-3 w-3 text-purple-400" />
                  Document & Parser Metadata
                </span>
                <p data-testid="citation-doc-id" className="text-[11px] font-mono text-white/80">Doc ID: {docId}</p>
                <p data-testid="citation-parser-name" className="text-[11px] font-mono text-white/60">Parser: {parserVersion}</p>
                <p data-testid="citation-file-hash" className="text-[10px] font-mono text-white/40 break-all">Physical File Hash: {physicalFileHash}</p>
                <p data-testid="citation-norm-text-hash" className="text-[10px] font-mono text-white/40 break-all">Normalized Text SHA-256: {normTextSha256}</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 text-center">
            <p className="text-[10px] font-mono text-white/30">
              Persisted EvidenceRef Provenance · workBYLiNE Proof Engine
            </p>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
