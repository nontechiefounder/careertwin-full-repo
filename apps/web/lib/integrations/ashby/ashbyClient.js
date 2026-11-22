/**
 * Ashby ATS Live API Client for workBYLiNE
 * Read-only connector targeting Ashby's REST API (https://api.ashbyhq.com).
 * 
 * Boundary & Authorization:
 * - Read-only: fetches jobs, applications, candidates, resumes.
 * - Zero write-back or stage mutation.
 * - When ASHBY_API_KEY is unset, fails closed with BLOCKED status:
 *   ASHBY_CREDENTIALS_UNCONFIGURED.
 */

export const ASHBY_API_BASE_URL = "https://api.ashbyhq.com";

export class AshbyClient {
  constructor({ apiKey = process.env.ASHBY_API_KEY, baseUrl = ASHBY_API_BASE_URL } = {}) {
    this.apiKey = apiKey || null;
    this.baseUrl = baseUrl;
  }

  /**
   * Reports live connection readiness.
   * If credentials are unavailable, returns BLOCKED status without throwing.
   */
  getConnectionStatus() {
    if (!this.apiKey) {
      return {
        configured: false,
        status: "BLOCKED",
        reason: "ASHBY_API_KEY is not provisioned in the environment. Live Ashby API execution is blocked.",
        auth_mode: "bearer_token"
      };
    }
    return {
      configured: true,
      status: "READY",
      reason: null,
      auth_mode: "bearer_token"
    };
  }

  /**
   * Internal authenticated POST request to Ashby REST endpoints
   */
  async _post(endpoint, payload = {}) {
    if (!this.apiKey) {
      const err = new Error("Ashby live API call blocked: ASHBY_API_KEY is not configured.");
      err.code = "ASHBY_CREDENTIALS_UNCONFIGURED";
      err.status = "BLOCKED";
      throw err;
    }

    // Basic Auth with base64-encoded apiKey as username per Ashby docs
    const authHeader = `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`;

    const res = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      const err = new Error(`Ashby API error [${res.status}]: ${errorBody}`);
      err.status = res.status;
      err.code = "ASHBY_API_ERROR";
      throw err;
    }

    const data = await res.json();
    return data;
  }

  /**
   * List open jobs in Ashby
   */
  async listJobs() {
    return this._post("job.list");
  }

  /**
   * Get job details by ID
   */
  async getJobInfo(jobId) {
    if (!jobId) throw new Error("jobId is required");
    return this._post("job.info", { id: jobId });
  }

  /**
   * List applications for a job
   */
  async listApplications({ jobId, status } = {}) {
    const payload = {};
    if (jobId) payload.jobId = jobId;
    if (status) payload.status = status;
    return this._post("application.list", payload);
  }

  /**
   * Get candidate details by ID
   */
  async getCandidateInfo(candidateId) {
    if (!candidateId) throw new Error("candidateId is required");
    return this._post("candidate.info", { id: candidateId });
  }

  /**
   * Fetch candidate resume file or metadata
   */
  async getCandidateResume(candidateId) {
    if (!candidateId) throw new Error("candidateId is required");
    return this._post("candidate.getResume", { candidateId });
  }
}

export const ashbyClient = new AshbyClient();

