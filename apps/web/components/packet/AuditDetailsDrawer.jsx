"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Copy, Check, ShieldCheck, HardDrive, FileText, Cpu, UserCheck } from "lucide-react";

function CopyableHash({ label, value, icon: Icon }) {
  const [copied, setCopied] = useState(false);
  const isAvailable = value && value !== "Not available";

  const handleCopy = async () => {
    if (!isAvailable) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  return (
    <div className="space-y-1.5 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono tracking-wider uppercase text-white/50 flex items-center gap-1.5">
          {Icon && <Icon className="h-3 w-3 text-[#00D604]" />}
          {label}
        </span>
        {isAvailable && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${label}`}
            className="inline-flex items-center gap-1 text-[10px] font-mono text-white/40 hover:text-[#00D604] transition-colors"
          >
            {copied ? (
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
      <p className="text-[11px] font-mono text-white/80 break-all leading-snug">
        {value || <span className="text-white/30 italic">Not available</span>}
      </p>
    </div>
  );
}

export default function AuditDetailsDrawer({ isOpen, onClose, packet, extraction, hiringRun, triggerElement }) {
  const restoreFocus = () => {
    const btn = document.getElementById("audit-details-trigger-btn") || triggerElement;
    if (btn && typeof btn.focus === "function") {
      btn.focus();
    }
  };

  const handleClose = () => {
    onClose();
    restoreFocus();
    setTimeout(restoreFocus, 50);
  };

  const specVersion = packet?.spec_version || "Not available";
  const rubricVersion = packet?.rubric_version || packet?.role_version || hiringRun?.rubric_approved_version || "Not available";
  const ledgerId = packet?.ledger_id || packet?.id || "Not available";
  const ledgerRevision = packet?.ledger_revision != null ? `REV ${packet.ledger_revision}` : "Not available";
  const candDocId = packet?.candidate_document_id || "Not available";
  const normSha256 = packet?.normalized_text_sha256 || "Not available";
  const fileSha256 = packet?.file_sha256 || packet?.file_hash || "Not available";
  const extractorVersion = packet?.extractor_version || "Not available";
  const kernelVersion = packet?.kernel_version || packet?.evaluation_version || "Not available";
  const evalVersion = packet?.evaluation_version || null;
  const actorId = packet?.actor_id || "Not available";
  const timestamp = packet?.evaluation_timestamp
    ? new Date(packet.evaluation_timestamp).toUTCString()
    : "Not available";
  const orgId = hiringRun?.org_id || extraction?.org_id || "Not available";

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            restoreFocus();
          }}
          className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md border-l border-white/10 bg-[#111111] p-6 shadow-2xl overflow-y-auto flex flex-col justify-between gap-6 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
        >
          <div className="space-y-6">
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="space-y-1">
                <DialogPrimitive.Title className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-[#00D604]" />
                  Audit Details & Provenance
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-white/50">
                  Technical execution metadata and cryptographic proof hashes.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                onClick={handleClose}
                className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#00D604]"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close Audit Details Drawer</span>
              </DialogPrimitive.Close>
            </div>

            <div className="space-y-3">
              <CopyableHash label="Packet Spec Version" value={specVersion} icon={ShieldCheck} />
              <CopyableHash label="Approved Rubric Version" value={rubricVersion} icon={ShieldCheck} />
              <CopyableHash label="Claim Ledger ID" value={ledgerId} icon={FileText} />
              <CopyableHash label="Ledger Revision" value={ledgerRevision} icon={FileText} />
              <CopyableHash label="Candidate Document ID" value={candDocId} icon={HardDrive} />
              <CopyableHash label="Normalized Text SHA-256" value={normSha256} icon={FileText} />
              <CopyableHash label="File SHA-256" value={fileSha256} icon={HardDrive} />
              <CopyableHash label="Extractor Version" value={extractorVersion} icon={Cpu} />
              <CopyableHash label="Kernel Version" value={kernelVersion} icon={Cpu} />
              {evalVersion && <CopyableHash label="Evaluation Version" value={evalVersion} icon={Cpu} />}
              <CopyableHash label="Evaluator Actor ID" value={actorId} icon={UserCheck} />
              <CopyableHash label="Evaluation Timestamp" value={timestamp} icon={FileText} />
              
              <div className="pt-2 border-t border-white/[0.06]">
                <CopyableHash label="Organization ID (Secondary Metadata)" value={orgId} icon={HardDrive} />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 text-center">
            <p className="text-[10px] font-mono text-white/30">
              workBYLiNE Proof Engine · Auditable Revision Ledger
            </p>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
