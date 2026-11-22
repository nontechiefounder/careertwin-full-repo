import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResearchQAPanel from '@/components/research/ResearchQAPanel';

describe('ResearchQAPanel Component — Phase A UI & Contract Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('1. Renders panel, header, neutral suggested queries, and scope-aware disclaimer', () => {
    render(<ResearchQAPanel hiringRunId="run_alpha_01" roleId="role_lead_swe" />);

    expect(screen.getByTestId('research-qa-panel')).toBeInTheDocument();
    expect(screen.getByText(/Role & Document Research QA/i)).toBeInTheDocument();
    expect(screen.getByTestId('resolved-role-label')).toHaveTextContent(/role_lead_swe/i);
    expect(screen.getByTestId('corpus-scope-label')).toHaveTextContent(/Resolving/i);
    expect(screen.getByTestId('public-research-disclaimer')).toBeInTheDocument();
    expect(screen.getByTestId('research-qa-input')).toBeInTheDocument();
    expect(screen.getByTestId('research-qa-submit')).toBeInTheDocument();

    // Verify neutral role-agnostic query suggestions (Finding 5)
    expect(screen.getByText(/What core responsibilities and technical deliverables are documented\?/i)).toBeInTheDocument();
    expect(screen.getByText(/What required tools, languages, or compliance frameworks are specified\?/i)).toBeInTheDocument();
  });

  it('2. Shows loading state when query is submitted', async () => {
    global.fetch.mockReturnValue(new Promise(() => {}));

    render(<ResearchQAPanel hiringRunId="run_alpha_01" />);

    const input = screen.getByTestId('research-qa-input');
    fireEvent.change(input, { target: { value: 'What responsibilities are documented?' } });

    const btn = screen.getByTestId('research-qa-submit');
    fireEvent.click(btn);

    expect(screen.getByTestId('research-qa-loading')).toBeInTheDocument();
    expect(screen.getByText(/Retrieving source passages & verifying grounding/i)).toBeInTheDocument();
  });

  it('3. Renders Source-Grounded answer, company context, and expands citation when clicked', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        mode: 'retrieval_augmented',
        answer: 'The infrastructure role requires Kubernetes, PostgreSQL, and SOC2 compliance experience.',
        status: 'GROUNDED',
        company_name: 'Acme Cloud Corp',
        role_id: 'role_infra_lead',
        corpus_scope: 'TENANT_PRIVATE',
        has_validation_errors: false,
        latency_ms: 145,
        citations: [
          {
            span_id: 'span_abc123',
            quote: 'The infrastructure role requires Kubernetes, PostgreSQL, and SOC2 compliance experience.',
            filename: '01_role_brief.md',
            locator: 'TEXT_LINE:10-12',
            source_url: 'https://example.com/brief',
          },
        ],
      }),
    });

    render(<ResearchQAPanel hiringRunId="run_alpha_01" roleId="role_infra_lead" />);

    const input = screen.getByTestId('research-qa-input');
    fireEvent.change(input, { target: { value: 'What requirements are documented?' } });
    fireEvent.click(screen.getByTestId('research-qa-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('research-qa-result')).toBeInTheDocument();
    });

    // Verify status label is "Source-Grounded"
    expect(screen.getByTestId('research-qa-status-badge')).toHaveTextContent(/Source-Grounded/i);
    expect(screen.getByTestId('research-qa-answer')).toHaveTextContent(/Kubernetes, PostgreSQL, and SOC2/i);
    expect(screen.getByTestId('citation-item-0')).toBeInTheDocument();

    // Verify company context and tenant private corpus label
    expect(screen.getByText(/Acme Cloud Corp/i)).toBeInTheDocument();
    expect(screen.getByTestId('corpus-scope-label')).toHaveTextContent(/Private Tenant Corpus/i);

    // Verify tenant private disclaimer wording
    expect(screen.getByText(/CONFIDENTIAL TENANT CORPUS \/ NOT EMPLOYER-APPROVED/i)).toBeInTheDocument();

    // Click to expand citation details
    const citationBtn = screen.getByTestId('citation-item-0').querySelector('button');
    fireEvent.click(citationBtn);

    expect(screen.getByText(/01_role_brief\.md/i)).toBeInTheDocument();
    expect(screen.getByText(/TEXT_LINE:10-12/i)).toBeInTheDocument();
  });

  it('4. Mode selector allows switching to Reference Passages Only (retrieval_only mode)', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        mode: 'retrieval_only',
        answer: null,
        status: 'RETRIEVAL_ONLY_COMPLETE',
        company_name: 'Acme Cloud Corp',
        role_id: 'role_infra_lead',
        corpus_scope: 'TENANT_PRIVATE',
        passages: [
          {
            span_id: 'span_pass_01',
            text: 'Direct quote passage about Kubernetes cluster deployment.',
            filename: 'infra_brief.md',
            score: 0.92,
          },
        ],
      }),
    });

    render(<ResearchQAPanel hiringRunId="run_alpha_01" />);

    // Switch mode to Reference Passages Only
    const modeBtn = screen.getByText(/Reference Passages Only/i);
    fireEvent.click(modeBtn);

    const input = screen.getByTestId('research-qa-input');
    fireEvent.change(input, { target: { value: 'Kubernetes cluster deployment' } });
    fireEvent.click(screen.getByTestId('research-qa-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('research-qa-result')).toBeInTheDocument();
    });

    expect(screen.getByTestId('research-qa-status-badge')).toHaveTextContent(/Passages Retrieved/i);
    expect(screen.getByText(/Retrieved Passages \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Direct quote passage about Kubernetes cluster deployment/i)).toBeInTheDocument();
  });

  it('5. Renders specific error state when workspace is unmapped', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        code: 'UNMAPPED_WORKSPACE',
        error: 'No context engine workspace is mapped for this hiring run.',
      }),
    });

    render(<ResearchQAPanel hiringRunId="run_unknown" />);

    const input = screen.getByTestId('research-qa-input');
    fireEvent.change(input, { target: { value: 'Any data?' } });
    fireEvent.click(screen.getByTestId('research-qa-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('research-qa-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/Workspace Not Mapped/i)).toBeInTheDocument();
    expect(screen.getByText(/No context engine workspace is mapped/i)).toBeInTheDocument();
  });

  it('6. Renders live provider blocked state when provider key is missing', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        code: 'BLOCKED_PENDING_KEY_ROTATION',
        error: 'Provider credential unconfigured. Live generation is BLOCKED.',
      }),
    });

    render(<ResearchQAPanel hiringRunId="run_alpha_01" />);

    const input = screen.getByTestId('research-qa-input');
    fireEvent.change(input, { target: { value: 'Any question?' } });
    fireEvent.click(screen.getByTestId('research-qa-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('research-qa-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/Live Provider Blocked/i)).toBeInTheDocument();
  });
});
