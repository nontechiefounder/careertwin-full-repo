import { describe, it, expect } from 'vitest';
import { compactHiringContext, applyConciseFormat } from '@/lib/contextCompactor';

describe('Context Compactor & Concise Response Mode', () => {
  it('1. Compacts verbose role rubric, candidate decision packet, and cohort into high-density ledger while preserving evidence IDs', () => {
    const roleData = {
      id: 'role-uuid-001',
      role_title: 'Principal Distributed Systems Engineer',
      company: 'Organization Alpha Corp',
      must_haves: ['Kubernetes & Raft Consensus', 'PostgreSQL High Availability', 'Rust / Go Systems'],
      nice_to_haves: ['eBPF Observability', 'Multi-Region Active-Active'],
      disqualifiers: ['No production on-call ownership'],
    };

    const activePacket = {
      extractionId: 'cand-uuid-999',
      candidateName: 'Elena Rostova',
      proofStatus: 'READY_FOR_SCREEN',
      fitScore: 0.91,
      proofScore: 0.84,
      decisionStatus: 'advance',
      verifiedClaims: [
        { claim: 'Led multi-region Raft cluster at 120k QPS', evidence_id: 'ev_raft_01' },
        { claim: 'Zero-downtime PostgreSQL sharding migration', evidence_id: 'ev_pg_02' },
      ],
      missingProofAreas: [
        { unproven_requirement: 'eBPF kernel tracing depth', id: 'gap_ebpf_01' },
      ],
    };

    const candidates = [
      { id: 'cand-uuid-999', name: 'Elena Rostova', fitScore: 0.91, proofScore: 0.84, proofStatus: 'Verified' },
      { id: 'cand-uuid-888', name: 'Marcus Vance', fitScore: 0.79, proofScore: 0.68, proofStatus: 'Needs Proof' },
    ];

    const result = compactHiringContext({ roleData, activePacket, candidates });

    expect(result.compactedText).toContain('ROLE[role-uuid-001]');
    expect(result.compactedText).toContain('PINNED_PACKET[cand-uuid-999]');
    expect(result.compactedText).toContain('[ev_raft_01]');
    expect(result.compactedText).toContain('[ev_pg_02]');
    expect(result.compactedText).toContain('[gap_ebpf_01]');
    expect(result.telemetry.engine).toBe('wbl-compactor-v1');
    expect(result.telemetry.savingsPct).toBeGreaterThanOrEqual(38);
  });

  it('2. Strips conversational filler in applyConciseFormat while preserving markdown facts', () => {
    const verbose = 'Based on the grounded evidence ledger for Elena, she has 91% fit. Furthermore, we recommend that you probe eBPF.';
    const concise = applyConciseFormat(verbose);
    expect(concise).toContain('Verdict —');
    expect(concise).toContain('Action:');
    expect(concise).not.toContain('Furthermore,');
  });
});
