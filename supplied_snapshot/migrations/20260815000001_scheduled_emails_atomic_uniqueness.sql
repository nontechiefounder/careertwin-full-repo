-- Atomic Uniqueness for Scheduled Emails Scoped to Tenant (Employer) and Sequence
-- Prevents duplicate communications across concurrent requests and multiple app instances

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_emails_tenant_seq 
ON public.scheduled_emails (employer_id, candidate_id, sequence_day);
