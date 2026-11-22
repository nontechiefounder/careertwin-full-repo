/**
 * Ashby ATS Synthetic Sandbox Adapter for workBYLiNE
 * Provides isolated synthetic test fixtures and intake processing for pipeline verification.
 * 
 * Fixture Boundary:
 * - Visibly labeled as local_synthetic_sandbox_fixture.
 * - Used strictly for synthetic sandbox test execution when live Ashby API is unconfigured/blocked.
 * 
 * Invariants:
 * - Idempotent re-runs (never creates duplicate roles or candidates on retry)
 * - Intentional sync updates: preserves employer edits, approved criteria, and human decisions
 * - Strict tenant isolation & org_id binding
 * - Candidate provenance, document revisions & synchronization checkpoints
 * - Zero automatic hiring-stage changes or write-backs (strictly read-only intake)
 */

import { ingestNormalizedAshbyJob } from './ashbyPipeline.js';

export const ASHBY_SYNTHETIC_FIXTURES = [
  {
    id: "ashby_job_dist_sys_01",
    source_type: "local_synthetic_sandbox_fixture",
    title: "Senior Distributed Systems Engineer",
    department: "Core Infrastructure",
    location: "San Francisco, CA / Remote",
    employment_type: "Full-Time",
    job_description: `We are seeking a Senior Distributed Systems Engineer to scale our distributed database storage and consensus layer. In this role, you will architect fault-tolerant replicated state machines, optimize consensus latency, and build high-throughput data replication pipelines.`,
    applications: [
      {
        application_id: "ashby_app_101",
        stage: "Application Review",
        applied_at: "2026-10-15T14:32:00Z",
        candidate: {
          id: "ashby_cand_101",
          name: "Elena Rostova",
          email: "elena.rostova@distributed-systems.dev",
          current_role: "Principal Systems Engineer",
          current_company: "Cockroach Labs",
          location: "San Francisco, CA",
          github_url: "https://github.com/erostova",
          linkedin_url: "https://linkedin.com/in/elena-rostova-dev",
          skills: [
            "Distributed Consensus (Raft)",
            "Go / Rust",
            "PostgreSQL Internals",
            "Distributed KV Storage",
            "High-Throughput RPC"
          ],
          resume: {
            document_id: "ashby_doc_101",
            filename: "Elena_Rostova_Systems_Architect_Resume.pdf",
            revision: 1,
            content: `Elena Rostova - Principal Systems Engineer at Cockroach Labs. 8+ years leading distributed systems infrastructure. Spearheaded Raft-based replicated consensus engine improvements reducing tail latency by 42%. Built multi-region data replication topology handling 350k op/s peak throughput.`
          }
        }
      },
      {
        application_id: "ashby_app_102",
        stage: "Application Review",
        applied_at: "2026-10-18T09:15:00Z",
        candidate: {
          id: "ashby_cand_102",
          name: "Marcus Vance",
          email: "marcus.vance@infranet.io",
          current_role: "Staff Infrastructure Engineer",
          current_company: "Datadog",
          location: "Remote, US",
          github_url: "https://github.com/marcusvance",
          linkedin_url: "https://linkedin.com/in/marcus-vance-infra",
          skills: [
            "Kubernetes Operators",
            "eBPF Tracing",
            "Go / C++",
            "Distributed Observability",
            "Kafka Pipeline Tuning"
          ],
          resume: {
            document_id: "ashby_doc_102",
            filename: "Marcus_Vance_Staff_Infra_Resume.pdf",
            revision: 1,
            content: `Marcus Vance - Staff Infrastructure Engineer with 7 years production experience in distributed tracing and high-volume stream ingestion engines. Author of open-source eBPF network probe utility.`
          }
        }
      },
      {
        application_id: "ashby_app_103",
        stage: "Application Review",
        applied_at: "2026-10-20T11:45:00Z",
        candidate: {
          id: "ashby_cand_103",
          name: "Aria Chen",
          email: "aria.chen@cloudscale.net",
          current_role: "Senior Backend Engineer",
          current_company: "Stripe",
          location: "Seattle, WA",
          github_url: "https://github.com/ariachen",
          linkedin_url: "https://linkedin.com/in/aria-chen-swe",
          skills: [
            "Distributed Systems",
            "Java / Kotlin",
            "Cassandra / CockroachDB",
            "Idempotent Payment Pipelines",
            "gRPC Microservices"
          ],
          resume: {
            document_id: "ashby_doc_103",
            filename: "Aria_Chen_Senior_Backend_Resume.pdf",
            revision: 1,
            content: `Aria Chen - Senior Backend Engineer with 5 years experience scaling financial ledger services and transactional event-driven pipelines.`
          }
        }
      }
    ]
  }
];

export const ASHBY_SANDBOX_JOBS = ASHBY_SYNTHETIC_FIXTURES;

/**
 * Retrieves the available Ashby synthetic sandbox jobs catalog.
 */
export function getAshbySandboxJobs() {
  return ASHBY_SYNTHETIC_FIXTURES.map(j => ({
    id: j.id,
    source_type: "local_synthetic_sandbox_fixture",
    title: j.title,
    department: j.department,
    location: j.location,
    applications_count: j.applications.length
  }));
}

/**
 * Imports a selected Ashby sandbox job and its applications/candidates.
 * Strictly idempotent: retrying will update the existing records rather than duplicating them.
 * Preserves employer-approved criteria, human decisions, and manual edits.
 */
export async function importAshbySandboxJob({
  supabase,
  userId,
  orgId,
  jobId = "ashby_job_dist_sys_01",
  dryRun = false
}) {
  const job = ASHBY_SYNTHETIC_FIXTURES.find(j => j.id === jobId);
  if (!job) {
    throw new Error(`Ashby synthetic fixture job '${jobId}' not found in catalog.`);
  }

  return ingestNormalizedAshbyJob({
    supabase,
    userId,
    orgId,
    job,
    sourceType: "local_synthetic_sandbox_fixture",
    checkpointSource: "ashby_synthetic_sandbox",
    dryRun
  });
}
