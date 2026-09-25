"use client";

import ClaimStateBadge from "./ClaimStateBadge";
import EvidenceCitation from "./EvidenceCitation";
import { FileCode2, Info, AlertTriangle } from "lucide-react";

export default function ClaimLedger({ packet, claims = [], evidenceRefs = [], onSelectEvidence }) {
  // Extract canonical claim ledger array
  const rawClaims = packet?.claim_ledger || (Array.isArray(packet?.claims) ? packet.claims : claims) || [];
  const rawRefs = packet?.evidence_refs || evidenceRefs || [];

  // Helper map for fast explicit evidence lookup by ID
  const refMap = new Map();
  if (Array.isArray(rawRefs)) {
    rawRefs.forEach((r) => {
      if (r && r.id) refMap.set(r.id, r);
    });
  }

  // PART 1.B: Packet-level claim edge resolution
  // Support packet.claim_edges or packet.edges mapping edge.claim_id -> edge.evidence_id
  const edgeMap = new Map();
  const rawEdges = packet?.claim_edges || packet?.edges || [];
  if (Array.isArray(rawEdges)) {
    rawEdges.forEach((e) => {
      if (e && e.claim_id && e.evidence_id) {
        if (!edgeMap.has(e.claim_id)) {
          edgeMap.set(e.claim_id, []);
        }
        edgeMap.get(e.claim_id).push(e.evidence_id);
      }
    });
  }

  const formattedClaims = rawClaims.map((c, i) => {
    if (typeof c === "string") {
      return {
        id: `claim_${i}`,
        claim_text: c,
        status: null, // No fabricated state
        evidence_refs: [], // No array index matching
        requirement_title: null,
      };
    }

    // Explicit claim-to-evidence lookup: only via genuine relationships
    // 1. claim.evidence_ref
    // 2. claim.evidence_id
    // 3. claim.evidence_ids
    // 4. packet.claim_edges (matching edge.claim_id === claim.id -> edge.evidence_id === ref.id)
    const matchedRefs = [];
    const claimId = c.id || `claim_${i}`;

    if (c.evidence_ref && typeof c.evidence_ref === "object") {
      matchedRefs.push(c.evidence_ref);
    }
    if (c.evidence_id && refMap.has(c.evidence_id)) {
      if (!matchedRefs.some((r) => r.id === c.evidence_id)) {
        matchedRefs.push(refMap.get(c.evidence_id));
      }
    }
    if (Array.isArray(c.evidence_ids)) {
      c.evidence_ids.forEach((id) => {
        if (refMap.has(id) && !matchedRefs.some((r) => r.id === id)) {
          matchedRefs.push(refMap.get(id));
        }
      });
    }
    if (edgeMap.has(claimId)) {
      const edgeEvIds = edgeMap.get(claimId);
      edgeEvIds.forEach((id) => {
        if (refMap.has(id) && !matchedRefs.some((r) => r.id === id)) {
          matchedRefs.push(refMap.get(id));
        }
      });
    }

    return {
      id: claimId,
      claim_text: c.claim_text || c.text || "Unspecified claim",
      status: c.status || c.claim_state || null,
      evidence_refs: matchedRefs,
      requirement_title: c.requirement_title || c.requirement || null,
    };
  });

  return (
    <section
      aria-label="Claim-to-Proof Ledger"
      className="rounded-2xl border border-white/[0.08] bg-[#111111] p-6 space-y-5 shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-[#10D97A]" aria-hidden="true" />
          <h2 className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-white/90">
            Claim-to-Proof Ledger ({formattedClaims.length} Claims)
          </h2>
        </div>
        <span className="text-[10px] font-mono text-white/40">
          Source-Attributable Evidence Ledger
        </span>
      </div>

      {/* Mandatory Attribution Definition Banner */}
      <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/[0.03] flex items-start gap-2.5">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[11px] font-sans text-white/70 leading-relaxed">
          <strong className="text-blue-400 font-mono">Attribution Rule:</strong> SUPPORTED means the claim is attributable to one or more allowed evidence spans. It does not independently verify competence, ownership, causality or outcome.
        </p>
      </div>

      {/* Claim Cards List */}
      <div className="space-y-3">
        {formattedClaims.map((claim, idx) => {
          const state = claim.status;
          const refs = claim.evidence_refs;
          const isConflicting = state === "CONFLICTING";
          const claimId = claim.id || `claim_${idx}`;

          return (
            <div
              key={claimId}
              data-claim-id={claimId}
              className={`p-4 rounded-xl border transition-all ${
                isConflicting
                  ? "border-amber-500/30 bg-amber-500/[0.02]"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <ClaimStateBadge claimState={state} />
                  {claim.requirement_title && (
                    <span className="text-[10px] font-mono text-white/40 border-l border-white/10 pl-2">
                      Req: {claim.requirement_title}
                    </span>
                  )}
                </div>
                {refs.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {refs.map((r) => (
                      <EvidenceCitation key={r.id || r.filename} evidenceRef={r} onSelectRef={(refObj, btn) => onSelectEvidence(refObj, btn)} />
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] font-mono text-white/30 italic">
                    No attributable EvidenceRef supplied
                  </span>
                )}
              </div>

              <p className="text-xs text-white/90 font-sans leading-relaxed">
                {claim.claim_text}
              </p>

              {isConflicting && (
                <div className="mt-2 pt-2 border-t border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-400 font-mono">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Conflicting source details detected. Requires human evidence review.</span>
                </div>
              )}
            </div>
          );
        })}

        {formattedClaims.length === 0 && (
          <div className="p-6 text-center border border-dashed border-white/10 rounded-xl">
            <p className="text-xs text-white/40 italic font-sans">
              No atomic claims extracted for this decision packet yet.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
