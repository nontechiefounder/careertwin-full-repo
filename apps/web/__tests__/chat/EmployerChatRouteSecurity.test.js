/**
 * UX-V2-D2-C3 Employer Chat Route Security & Executable Coverage Test Suite
 * Tests authentication, organization context resolution (0, 1, >1 orgs), active org membership,
 * UUID validation, fail-closed Supabase 503 handling, 400/401/403/404 paths,
 * candidate query branch execution, 503 candidate error handling, and neutral CANDIDATES artifacts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock serverAuth helpers
vi.mock("@/lib/serverAuth", () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn(),
}));

import { POST } from "@/app/api/employer/chat/route";
import { requireUser, getVerifiedOrgMembership } from "@/lib/serverAuth";

describe("Employer Chat Route Security & Data-Truth (UX-V2-D2-C3)", () => {

  const mockUser = { id: "usr_11111111-1111-4111-a111-111111111111", email: "employer@example.com" };
  const mockOrgId = "11111111-1111-4111-a111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Returns HTTP 401 when request is unauthenticated", async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
      user: null,
      supabase: null,
    });

    const req = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Hello" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("2. Returns HTTP 400 when message is missing, empty, non-string, whitespace, or oversized", async () => {
    const mockSupabase = {};
    requireUser.mockResolvedValue({ errorResponse: null, user: mockUser, supabase: mockSupabase });

    // Missing message
    const req0 = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res0 = await POST(req0);
    expect(res0.status).toBe(400);

    // Non-string message
    const req1 = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: 12345 }),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(400);

    // Whitespace message
    const req2 = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "   " }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(400);

    // Oversized message (>2000 chars)
    const req3 = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "a".repeat(2001) }),
    });
    const res3 = await POST(req3);
    expect(res3.status).toBe(400);
  });

  it("3. Returns HTTP 400 when org_id or active_run_id format is invalid UUID", async () => {
    const mockSupabase = {};
    requireUser.mockResolvedValue({ errorResponse: null, user: mockUser, supabase: mockSupabase });

    // Invalid org_id UUID
    const req1 = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Hello", context: { org_id: "not-a-uuid" } }),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(400);

    // Invalid active_run_id UUID
    const req2 = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Hello", context: { org_id: mockOrgId, active_run_id: "invalid-uuid" } }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(400);
  });

  it("4. Returns HTTP 400 ORGANIZATION_CONTEXT_REQUIRED when no org_id is provided and user has 0 active memberships", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [], // 0 active memberships
              error: null,
            }),
          }),
        }),
      }),
    };

    requireUser.mockResolvedValue({ errorResponse: null, user: mockUser, supabase: mockSupabase });

    const req = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Pipeline summary" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("ORGANIZATION_CONTEXT_REQUIRED");
  });

  it("5. Returns HTTP 400 ORGANIZATION_CONTEXT_REQUIRED when no org_id is provided and user has >1 active memberships", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { organization_id: "org_1", membership_role: "owner" },
                { organization_id: "org_2", membership_role: "recruiter" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    requireUser.mockResolvedValue({ errorResponse: null, user: mockUser, supabase: mockSupabase });

    const req = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Pipeline summary" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("ORGANIZATION_CONTEXT_REQUIRED");
    expect(data.safe_next_action).toBe("Select an organization before using hiring chat.");
  });

  it("6. Returns HTTP 403 Forbidden when user is not an active member of target organization", async () => {
    const mockSupabase = {};
    requireUser.mockResolvedValue({ errorResponse: null, user: mockUser, supabase: mockSupabase });
    getVerifiedOrgMembership.mockResolvedValueOnce(null);

    const req = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Pipeline summary", context: { org_id: mockOrgId } }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Forbidden");
  });

  it("7. Returns HTTP 503 CHAT_DATA_UNAVAILABLE when hiring_runs query fails in Supabase", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Database connection lost", code: "PGRST500" },
            }),
          }),
        }),
      }),
    };

    requireUser.mockResolvedValue({ errorResponse: null, user: mockUser, supabase: mockSupabase });
    getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: "owner", membership_status: "active" });

    const req = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Pipeline summary", context: { org_id: mockOrgId } }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("CHAT_DATA_UNAVAILABLE");
  });

  it("8. Returns HTTP 404 when active_run_id does not belong to authorized organization", async () => {
    const foreignRunId = "22222222-2222-4222-a222-222222222222";
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [{ id: "33333333-3333-4333-a333-333333333333", role_title: "Own Run", status: "active", org_id: mockOrgId }],
              error: null,
            }),
          }),
        }),
      }),
    };

    requireUser.mockResolvedValue({ errorResponse: null, user: mockUser, supabase: mockSupabase });
    getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: "owner", membership_status: "active" });

    const req = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Show candidates", context: { org_id: mockOrgId, active_run_id: foreignRunId } }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Hiring run not found or does not belong to authorized organization");
  });

  it("9. Candidate query branch: returns neutral CANDIDATES artifact (never manufactures SHORTLIST)", async () => {
    const mockRunId = "33333333-3333-4333-a333-333333333333";
    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === "hiring_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [{ id: mockRunId, role_title: "Backend Engineer", status: "active", org_id: mockOrgId }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "candidates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: "cand_1", status: "extracted" }],
                error: null,
              }),
            }),
          };
        }
        return {};
      }),
    };

    requireUser.mockResolvedValue({ errorResponse: null, user: mockUser, supabase: mockSupabase });
    getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: "owner", membership_status: "active" });

    const req = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Show candidates for review", context: { org_id: mockOrgId } }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.reply).toContain("Found **1 candidate(s)**");
    expect(data.artifact).toEqual({
      title: "Backend Engineer Candidates",
      type: "CANDIDATES",
      href: `/employer/shortlist/${mockRunId}`,
    });
    expect(data.artifact.type).not.toBe("SHORTLIST");
  });

  it("10. Candidate query branch: returns 503 CHAT_DATA_UNAVAILABLE when candidates query fails in Supabase", async () => {
    const mockRunId = "33333333-3333-4333-a333-333333333333";
    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === "hiring_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [{ id: mockRunId, role_title: "Backend Engineer", status: "active", org_id: mockOrgId }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "candidates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "Candidate table locked" },
              }),
            }),
          };
        }
        return {};
      }),
    };

    requireUser.mockResolvedValue({ errorResponse: null, user: mockUser, supabase: mockSupabase });
    getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: "owner", membership_status: "active" });

    const req = new Request("http://localhost:3000/api/employer/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Show candidates", context: { org_id: mockOrgId } }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("CHAT_DATA_UNAVAILABLE");
  });

});
