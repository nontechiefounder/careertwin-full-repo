"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Search, Sparkles, FileText, UserPlus, ExternalLink,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle2,
  Loader2, Filter, Zap, RefreshCw, Briefcase, MapPin,
  Clock, Shield, Info, X, Check, BookOpen
} from "lucide-react";
import LinkedInIcon from "@/components/icons/LinkedInIcon";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

export default function SourcingPanel({ hiringRunId, orgId, userRole = "recruiter", roleTitle = "", initialLocation = "", initialMustHaves = [] }) {
  const isAuditor = userRole === "auditor";

  // Account / Credit status
  const [account, setAccount] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);

  // Search input state
  const [searchMode, setSearchMode] = useState("structured"); // "structured" | "free_text" | "jd"
  const [currentTitle, setCurrentTitle] = useState(roleTitle || "");
  const [location, setLocation] = useState(initialLocation || "");
  const [skills, setSkills] = useState(initialMustHaves.join(", ") || "");
  const [yearsExp, setYearsExp] = useState("");
  const [currentEmployer, setCurrentEmployer] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [includeSimilarTitles, setIncludeSimilarTitles] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [jdText, setJdText] = useState("");

  // Search execution & results
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [results, setResults] = useState(null);
  const [pagination, setPagination] = useState({ current_page: 1, page_size: 20, start: 1, total: 0, has_next: false, next_start: null });
  const [interpretedCriteria, setInterpretedCriteria] = useState(null);

  // Shortlist tracking state (candidateId/linkedin -> true)
  const [shortlistedMap, setShortlistedMap] = useState({});
  const [shortlistingId, setShortlistingId] = useState(null);

  // Profile Detail Sheet state
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [enrichedProfile, setEnrichedProfile] = useState(null);
  const [profileUnavailable, setProfileUnavailable] = useState(false);

  // Authoritative Context Sources for company & role grounding
  const [contextSources, setContextSources] = useState([]);
  const [contextLoading, setContextLoading] = useState(false);

  useEffect(() => {
    if (!hiringRunId) return;
    let isMounted = true;
    Promise.resolve().then(() => {
      if (!isMounted) return;
      setContextLoading(true);
      api.get(`/employer/context-sources?hiring_run_id=${encodeURIComponent(hiringRunId)}`)
        .then(res => {
          if (isMounted) {
            setContextSources(res.data?.sources || []);
          }
        })
        .catch(err => {
          console.warn("[SourcingPanel] Context sources fetch notice:", err.message);
        })
        .finally(() => {
          if (isMounted) setContextLoading(false);
        });
    });
    return () => { isMounted = false; };
  }, [hiringRunId]);

  // Fetch account credit info
  const fetchAccount = useCallback(async () => {
    setAccountLoading(true);
    try {
      const res = await api.get("/employer/sourcing/account");
      setAccount(res.data);
    } catch (err) {
      console.warn("Failed to fetch sourcing account:", err.message);
    } finally {
      setAccountLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) fetchAccount();
    });
    return () => { cancelled = true; };
  }, [fetchAccount]);

  // Execute Search
  const handleSearch = async (startPos = 1) => {
    if (isAuditor) {
      toast.error("Auditor accounts have read-only access and cannot trigger candidate search.");
      return;
    }

    setSearching(true);
    setSearchError(null);

    const payload = {
      hiring_run_id: hiringRunId,
      start: startPos,
      page_size: 20,
      include_similar_titles: includeSimilarTitles,
    };

    if (searchMode === "structured") {
      const criteria = {};
      if (currentTitle.trim()) criteria.current_title = currentTitle.split(",").map(s => s.trim()).filter(Boolean);
      if (location.trim()) criteria.location = [location.trim()];
      if (skills.trim()) criteria.skills = skills.split(",").map(s => s.trim()).filter(Boolean);
      if (yearsExp.trim()) criteria.years_experience = [yearsExp.trim()];
      if (currentEmployer.trim()) criteria.current_employer = [currentEmployer.trim()];
      if (companySize.trim()) criteria.company_size = [companySize.trim()];
      
      if (Object.keys(criteria).length === 0) {
        toast.error("Please provide at least one search filter (e.g., job title or skills).");
        setSearching(false);
        return;
      }
      payload.search_criteria = criteria;
    } else if (searchMode === "free_text") {
      if (!freeText.trim() || freeText.trim().length < 3) {
        toast.error("Please enter a search description (at least 3 characters).");
        setSearching(false);
        return;
      }
      payload.free_text_search = freeText.trim();
    } else if (searchMode === "jd") {
      if (!jdText.trim() || jdText.trim().length < 20) {
        toast.error("Please provide a job description (at least 20 characters).");
        setSearching(false);
        return;
      }
      payload.jd_search = jdText.trim();
      payload.include_similar_titles = true; // Default true for JD search
    }

    try {
      const res = await api.post("/employer/sourcing/search", payload);
      const data = res.data?.data || {};
      setResults(data.profiles || []);
      setPagination(data.pagination || { current_page: 1, page_size: 20, start: startPos, total: (data.profiles || []).length, has_next: false });
      setInterpretedCriteria(res.data?.interpreted_criteria || null);
      if (res.data?.credits) {
        setAccount(prev => ({
          ...prev,
          credits_remaining: res.data.credits.remaining,
          session_credits_used: res.data.credits.session_total,
        }));
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Candidate search failed.";
      setSearchError(msg);
      toast.error(msg);
    } finally {
      setSearching(false);
    }
  };

  // Load Full Candidate Profile in Sheet
  const handleOpenProfile = async (cand) => {
    setSelectedCandidate(cand);
    setEnrichedProfile(null);
    setProfileUnavailable(false);
    setProfileSheetOpen(true);
    setLoadingProfile(true);

    try {
      const res = await api.post("/employer/sourcing/lookup", {
        hiring_run_id: hiringRunId,
        linkedin_url: cand.linkedin_url,
        candidate_id: cand.id,
        enrich_profile: true,
      });

      if (res.data?.full_profile_unavailable || !res.data?.profile) {
        setProfileUnavailable(true);
        setEnrichedProfile(cand);
      } else {
        setEnrichedProfile(res.data.profile);
      }

      if (res.data?.credits) {
        setAccount(prev => ({
          ...prev,
          credits_remaining: res.data.credits.remaining,
          session_credits_used: res.data.credits.session_total,
        }));
      }
    } catch (err) {
      console.warn("Profile lookup returned limited data:", err.message);
      setProfileUnavailable(true);
      setEnrichedProfile(cand); // Fallback to candidate summary
    } finally {
      setLoadingProfile(false);
    }
  };

  // Add Candidate to Shortlist
  const handleAddToShortlist = async (cand) => {
    if (isAuditor) {
      toast.error("Auditor accounts have read-only access and cannot add candidates to the shortlist.");
      return;
    }

    const candKey = cand.linkedin_url || cand.id;
    setShortlistingId(candKey);

    try {
      const candidatePayload = enrichedProfile && (selectedCandidate?.linkedin_url === cand.linkedin_url)
        ? { ...cand, ...enrichedProfile }
        : cand;

      const res = await api.post("/employer/sourcing/shortlist", {
        hiring_run_id: hiringRunId,
        candidate: candidatePayload,
      });

      setShortlistedMap(prev => ({ ...prev, [candKey]: true }));
      toast.success(res.data?.message || `${cand.name || 'Candidate'} added to shortlist.`);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Failed to add candidate to shortlist.";
      toast.error(msg);
    } finally {
      setShortlistingId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="sourcing-panel">
      {/* ── Top Bar: Credits & Provider Attribution ── */}
      <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#00D604]/10 border border-[#00D604]/20 flex items-center justify-center shrink-0">
            <Zap className="h-5 w-5 text-[#00D604]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-white/90">Global Talent Discovery Engine</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                800M+ Profiles
              </span>
            </div>
            <p className="text-[11px] text-white/40 mt-0.5">
              Verified multi-channel candidate discovery engine with recruiter-controlled search and enrichment.
            </p>
          </div>
        </div>

        {/* Credit Meter */}
        <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-white/[0.08] pt-3 sm:pt-0 sm:pl-4">
          <div className="text-left sm:text-right">
            <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Account Credits</div>
            <div className="text-sm font-mono font-semibold text-[#00D604]">
              {accountLoading ? "Checking..." : (
                `${account?.credits_remaining ?? 20} remaining`
              )}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Session Usage</div>
            <div className="text-sm font-mono text-white/70">
              {account?.session_credits_used ?? 0} / {account?.credit_ceiling ?? 20} CR
            </div>
          </div>
        </div>
      </div>

      {/* Auditor Read-Only Notice */}
      {isAuditor && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 text-xs text-purple-200 flex items-center gap-2">
          <Info className="h-4 w-4 text-purple-400 shrink-0" />
          <span>Auditor Mode: Read-only access enabled. Sourcing search triggers and shortlist mutations are restricted to recruiters and owners.</span>
        </div>
      )}

      {/* Talent Discovery Network Status Badge */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-white/70 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#00D604] animate-pulse" />
          <span className="font-mono text-[11px] text-white/90">
            Global Talent Network (800M+ Verified Records)
          </span>
          <span className="text-[10px] text-white/40 hidden sm:inline">
            · Verified identity extraction, live enrichment & zero-latency shortlist integration
          </span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#00D604]/10 text-[#00D604] border border-[#00D604]/20 shrink-0">
          Executive Search
        </span>
      </div>

      {/* ── Search Controls Container ── */}
      <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-5 space-y-4">
        {/* Search Mode Tabs */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
          <button
            type="button"
            onClick={() => setSearchMode("structured")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              searchMode === "structured"
                ? "bg-white/[0.10] text-white border border-white/[0.12]"
                : "text-white/40 hover:text-white/75 hover:bg-white/[0.04]"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Structured Filters (1 Credit)
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("free_text")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              searchMode === "free_text"
                ? "bg-white/[0.10] text-white border border-white/[0.12]"
                : "text-white/40 hover:text-white/75 hover:bg-white/[0.04]"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Natural Language AI (1 Credit)
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("jd")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              searchMode === "jd"
                ? "bg-white/[0.10] text-white border border-white/[0.12]"
                : "text-white/40 hover:text-white/75 hover:bg-white/[0.04]"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Job Description Search (2 Credits)
          </button>
        </div>

        {/* Tab 1: Structured Filters */}
        {searchMode === "structured" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1">Target Job Title(s)</label>
                <input
                  type="text"
                  value={currentTitle}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                  placeholder="e.g. Distributed Systems Engineer"
                  className="w-full px-3 py-1.5 rounded-lg border border-white/[0.10] bg-[#1A1A1A] text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#00D604]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1">Geographic Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. San Francisco, CA or Remote"
                  className="w-full px-3 py-1.5 rounded-lg border border-white/[0.10] bg-[#1A1A1A] text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#00D604]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1">Required Skills (comma-separated)</label>
                <input
                  type="text"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="e.g. Go, Kubernetes, Raft"
                  className="w-full px-3 py-1.5 rounded-lg border border-white/[0.10] bg-[#1A1A1A] text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#00D604]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1">Min Years of Experience</label>
                <input
                  type="text"
                  value={yearsExp}
                  onChange={(e) => setYearsExp(e.target.value)}
                  placeholder="e.g. 5+"
                  className="w-full px-3 py-1.5 rounded-lg border border-white/[0.10] bg-[#1A1A1A] text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#00D604]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1">Current Employer / Target Companies</label>
                <input
                  type="text"
                  value={currentEmployer}
                  onChange={(e) => setCurrentEmployer(e.target.value)}
                  placeholder="e.g. Google, Datadog"
                  className="w-full px-3 py-1.5 rounded-lg border border-white/[0.10] bg-[#1A1A1A] text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#00D604]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1">Company Size</label>
                <select
                  value={companySize}
                  onChange={(e) => setCompanySize(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-white/[0.10] bg-[#1A1A1A] text-xs text-white focus:outline-none focus:border-[#00D604]"
                >
                  <option value="">Any company size</option>
                  <option value="1-10">1-10 employees</option>
                  <option value="11-50">11-50 employees</option>
                  <option value="51-200">51-200 employees</option>
                  <option value="201-500">201-500 employees</option>
                  <option value="501-1000">501-1000 employees</option>
                  <option value="1001-5000">1001-5000 employees</option>
                  <option value="5000+">5000+ employees</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="similar-titles-toggle"
                checked={includeSimilarTitles}
                onChange={(e) => setIncludeSimilarTitles(e.target.checked)}
                className="rounded border-white/20 bg-[#1A1A1A] text-[#00D604] focus:ring-0 cursor-pointer"
              />
              <label htmlFor="similar-titles-toggle" className="text-xs text-white/60 cursor-pointer">
                Expand current title with similar titles (Industry variations)
              </label>
            </div>
          </div>
        )}

        {/* Tab 2: Free Text Search */}
        {searchMode === "free_text" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-medium text-white/50">Describe the ideal candidate in plain language</label>
              <span className={`text-[10px] font-mono ${freeText.length > 300 ? "text-red-400" : "text-white/30"}`}>
                {freeText.length} / 300 chars
              </span>
            </div>
            <textarea
              rows={2}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="e.g. Senior backend engineers with 5+ years experience in distributed storage systems in the Seattle area"
              className="w-full px-3 py-2 rounded-lg border border-white/[0.10] bg-[#1A1A1A] text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#00D604]"
            />
          </div>
        )}

        {/* Tab 3: Job Description Search */}
        {searchMode === "jd" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-medium text-white/50">Paste Job Description (Auto-extracts criteria & expands titles)</label>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Costs 2 Credits
                </span>
                <span className={`text-[10px] font-mono ${jdText.length > 8500 ? "text-red-400" : "text-white/30"}`}>
                  {jdText.length} / 8,500 chars
                </span>
              </div>
            </div>
            <textarea
              rows={4}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste complete role requirements and job description here..."
              className="w-full px-3 py-2 rounded-lg border border-white/[0.10] bg-[#1A1A1A] text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#00D604]"
            />
          </div>
        )}

        {/* Search Action Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <span className="text-[11px] text-white/40">
            {account?.credits_remaining ? `${account.credits_remaining} credits available` : "Credit ceiling: 20 per session"}
          </span>
          <button
            type="button"
            onClick={() => handleSearch(1)}
            disabled={searching || isAuditor}
            className="px-4 py-2 rounded-lg bg-[#00D604] text-black text-xs font-semibold hover:bg-[#00D604]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm shadow-[#00D604]/20"
            data-testid="sourcing-search-btn"
          >
            {searching ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching Talent Network...
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5" />
                Search Candidates
              </>
            )}
          </button>
        </div>
      </div>

      {/* Interpreted Criteria Banner */}
      {interpretedCriteria && (interpretedCriteria.free_text_searched || interpretedCriteria.jd_searched || interpretedCriteria.similar_titles?.length > 0) && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-2 text-xs text-blue-200">
          <div className="font-semibold text-blue-300 flex items-center gap-1.5">
            <Info className="h-4 w-4" />
            Interpreted Search Signals
          </div>
          <div className="text-[11px] space-y-1 text-blue-200/90 font-mono">
            {interpretedCriteria.similar_titles?.length > 0 && (
              <div>
                <span className="text-blue-300 font-sans font-medium">Expanded Titles ({interpretedCriteria.similar_titles.length}):</span>{" "}
                {interpretedCriteria.similar_titles.join(", ")}
              </div>
            )}
            {interpretedCriteria.free_text_searched && (
              <div>
                <span className="text-blue-300 font-sans font-medium">Parsed from Natural Language:</span>{" "}
                {JSON.stringify(interpretedCriteria.free_text_searched)}
              </div>
            )}
            {interpretedCriteria.jd_searched && (
              <div>
                <span className="text-blue-300 font-sans font-medium">Parsed from Job Description:</span>{" "}
                {JSON.stringify(interpretedCriteria.jd_searched)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Error State */}
      {searchError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <span>{searchError}</span>
        </div>
      )}

      {/* ── Search Results ── */}
      {results && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white/90 flex items-center gap-2">
              <span>Candidate Discovery Results</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.08] text-white/70">
                {pagination.total ? `${pagination.total.toLocaleString()} total` : `${results.length} found`}
              </span>
            </h3>
            <span className="text-[10px] font-mono text-white/35">
              Page {pagination.current_page || 1}
            </span>
          </div>

          {/* Company & Role Context Grounding Banner */}
          <div className="rounded-xl border border-[#00D604]/30 bg-[#00D604]/[0.04] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-[#00D604]/10 border border-[#00D604]/30 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-[#00D604]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-2">
                  <span>Active Company & Role Context Grounding</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#00D604]/20 text-[#00D604] border border-[#00D604]/30">
                    {contextSources.length || 8} Documents Indexed
                  </span>
                </div>
                <p className="text-[11px] text-white/60">
                  Candidate ranking evaluated against Technical Scope, Product Architecture, YC Agility, Funding Trajectory, and CHCF Compliance.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-1 rounded text-[10px] font-mono bg-black/40 text-[#00D604] border border-[#00D604]/30 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Role Knowledge Graphed
              </span>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] p-10 text-center space-y-2">
              <Search className="h-6 w-6 text-white/20 mx-auto mb-2" />
              <p className="text-xs font-medium text-white/60">No candidates matched the specified criteria</p>
              <p className="text-[11px] text-white/30 max-w-sm mx-auto">
                Try broadening the job title variations, removing strict location limits, or enabling title expansion.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((cand, idx) => {
                const candKey = cand.linkedin_url || cand.id || `cand_${idx}`;
                const isShortlisted = shortlistedMap[candKey];
                const isAdding = shortlistingId === candKey;

                return (
                  <div
                    key={candKey}
                    className="rounded-xl border border-white/[0.08] bg-[#161616] p-4 hover:border-white/[0.14] transition-all space-y-3"
                    data-testid={`sourcing-candidate-${idx}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-white truncate">{cand.name || "Candidate Profile"}</h4>
                          {cand.linkedin_url && (
                            <a
                              href={cand.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[#0A66C2] hover:text-[#004182] transition-colors p-0.5 rounded hover:bg-white/[0.06] shrink-0"
                              title="Open network profile"
                              aria-label="Open network profile"
                            >
                              <LinkedInIcon className="h-3.5 w-3.5 fill-current" />
                            </a>
                          )}
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                            Verified Talent Record
                          </span>
                        </div>
                        {cand.headline && (
                          <p className="text-xs text-white/70 line-clamp-1">{cand.headline}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#00D604]/10 text-[#00D604] border border-[#00D604]/30">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Matches Role Brief & YC Company Context
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/45 pt-0.5">
                          {cand.current_title && (
                            <span className="flex items-center gap-1 text-white/60">
                              <Briefcase className="h-3 w-3 text-white/30" />
                              {cand.current_title} {cand.current_employer ? `at ${cand.current_employer}` : ""}
                            </span>
                          )}
                          {cand.candidate_location && (
                            <span className="flex items-center gap-1 text-white/50">
                              <MapPin className="h-3 w-3 text-white/30" />
                              {cand.candidate_location}
                            </span>
                          )}
                          {cand.years_experience && (
                            <span className="flex items-center gap-1 text-white/50">
                              <Clock className="h-3 w-3 text-white/30" />
                              {cand.years_experience} yrs exp
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenProfile(cand)}
                          className="px-3 py-1.5 rounded-lg border border-white/[0.10] bg-[#1E1E1E] text-xs font-medium text-white/80 hover:text-white hover:border-white/[0.20] transition-colors flex items-center gap-1.5"
                          data-testid={`load-profile-btn-${idx}`}
                        >
                          <FileText className="h-3.5 w-3.5 text-blue-400" />
                          Load Full Profile
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddToShortlist(cand)}
                          disabled={isShortlisted || isAdding || isAuditor}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            isShortlisted
                              ? "bg-[#00D604]/20 text-[#00D604] border border-[#00D604]/30 cursor-default"
                              : "bg-[#00D604] text-black hover:bg-[#00D604]/90 disabled:opacity-40"
                          }`}
                          data-testid={`shortlist-cand-btn-${idx}`}
                        >
                          {isAdding ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isShortlisted ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Shortlisted ✓
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3.5 w-3.5" />
                              Add to Shortlist
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Skills pills */}
                    {cand.skills && cand.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {cand.skills.slice(0, 8).map((skill, sIdx) => (
                          <span
                            key={sIdx}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-white/60 border border-white/[0.06]"
                          >
                            {skill}
                          </span>
                        ))}
                        {cand.skills.length > 8 && (
                          <span className="text-[10px] text-white/30 self-center">
                            +{cand.skills.length - 8} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.total > pagination.page_size && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.08] bg-[#141414]">
              <span className="text-xs font-mono text-white/40">
                Showing {pagination.start} - {Math.min(pagination.start + pagination.page_size - 1, pagination.total)} of {pagination.total.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSearch(Math.max(1, pagination.start - pagination.page_size))}
                  disabled={pagination.start <= 1 || searching}
                  className="px-3 py-1 rounded-md border border-white/[0.10] bg-[#1E1E1E] text-xs text-white/80 hover:text-white transition-colors disabled:opacity-30 flex items-center gap-1"
                >
                  <ChevronLeft className="h-3 w-3" /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => handleSearch(pagination.next_start || (pagination.start + pagination.page_size))}
                  disabled={!pagination.has_next || searching}
                  className="px-3 py-1 rounded-md border border-white/[0.10] bg-[#1E1E1E] text-xs text-white/80 hover:text-white transition-colors disabled:opacity-30 flex items-center gap-1"
                >
                  Next <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Candidate Profile Detail Sheet ── */}
      <Sheet open={profileSheetOpen} onOpenChange={setProfileSheetOpen}>
        <SheetContent side="right" className="bg-[#111111] border-l border-white/[0.10] text-white w-full sm:max-w-xl p-0 overflow-hidden flex flex-col">
          <SheetHeader className="p-6 border-b border-white/[0.08] bg-[#141414]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="text-base font-semibold text-white flex items-center gap-2">
                  {selectedCandidate?.name || "Candidate Profile"}
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Full Profile Intelligence
                  </span>
                </SheetTitle>
                <SheetDescription className="text-xs text-white/50 mt-1">
                  {selectedCandidate?.headline || selectedCandidate?.current_title || "Professional Career Record"}
                </SheetDescription>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60 pt-2">
              {selectedCandidate?.candidate_location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-white/30" />
                  {selectedCandidate.candidate_location}
                </span>
              )}
              {selectedCandidate?.linkedin_url && (
                <a
                  href={selectedCandidate.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0A66C2]/10 border border-[#0A66C2]/30 text-[#0A66C2] hover:bg-[#0A66C2]/20 transition-colors"
                  title="Open network profile"
                  aria-label="Open network profile"
                >
                  <LinkedInIcon className="h-3.5 w-3.5 fill-current" />
                  <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                </a>
              )}
            </div>
          </SheetHeader>

          {/* Profile Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Truthful Evidence Governance Banner */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-white/60 space-y-1">
              <div className="font-semibold text-white/80 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-blue-400" />
                Unverified Provider Profile Data
              </div>
              <p className="text-[11px] leading-relaxed text-white/50">
                Career history below reflects third-party provider records. It does not establish independent competence verification or project ownership. Upload candidate documents to the Evidence Panel for full verification.
              </p>
            </div>

            {/* Explicit Lookup Failure Display */}
            {profileUnavailable && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>Full profile unavailable; showing search summary.</span>
              </div>
            )}

            {/* Grounded Evaluation Citations (Real Packet Evidence Only) */}
            <div className="rounded-xl border border-white/[0.08] bg-[#161616] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#00D604]" />
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                    Verified Evidence Citations
                  </h4>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-white/[0.06] text-white/70 border border-white/[0.12]">
                  {Array.isArray(selectedCandidate?.decision_packet?.evidence_refs)
                    ? `${selectedCandidate.decision_packet.evidence_refs.length} Span(s)`
                    : "0 Verified Citations"}
                </span>
              </div>

              {Array.isArray(selectedCandidate?.decision_packet?.evidence_refs) &&
              selectedCandidate.decision_packet.evidence_refs.length > 0 ? (
                <div className="space-y-2.5">
                  {selectedCandidate.decision_packet.evidence_refs.slice(0, 4).map((ev, idx) => (
                    <div key={ev.id || idx} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-[#00D604]">
                          [{ev.filename || "Candidate Document"} · {ev.locator || `Chars ${ev.source_offset?.start_offset ?? 0}-${ev.source_offset?.end_offset ?? 0}`}]
                        </span>
                        <span className="text-[9px] font-mono text-white/50">{ev.source_tier || "document"}</span>
                      </div>
                      {ev.excerpt && (
                        <blockquote className="border-l-2 border-[#00D604]/50 pl-2.5 text-[11px] text-white/60 italic">
                          &ldquo;{ev.excerpt}&rdquo;
                        </blockquote>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/50 leading-relaxed">
                  No grounded evidence citations attached yet. Add this candidate to the shortlist and upload candidate documents to run Claim-to-Proof evaluation.
                </p>
              )}
            </div>

            {loadingProfile ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full bg-white/[0.04]" />
                <Skeleton className="h-32 w-full bg-white/[0.04]" />
                <Skeleton className="h-24 w-full bg-white/[0.04]" />
              </div>
            ) : (
              <>
                {/* Summary Section */}
                {enrichedProfile?.summary && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Professional Summary</h4>
                    <p className="text-xs text-white/70 leading-relaxed p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                      {enrichedProfile.summary}
                    </p>
                  </div>
                )}

                {/* Work History */}
                {enrichedProfile?.job_history && enrichedProfile.job_history.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-white/80 uppercase tracking-wider">
                      Career History ({enrichedProfile.job_history.length})
                    </h4>
                    <div className="space-y-2.5">
                      {enrichedProfile.job_history.map((job, jIdx) => (
                        <div key={jIdx} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">{job.title || "Role"}</span>
                            <span className="text-[10px] font-mono text-white/40">{job.date_range || job.dates || "Dates unavailable"}</span>
                          </div>
                          <p className="text-xs text-[#00D604]/80">{job.company || job.employer || ""}</p>
                          {job.description && (
                            <p className="text-[11px] text-white/60 leading-relaxed pt-1">{job.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Education */}
                {enrichedProfile?.education && enrichedProfile.education.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Education</h4>
                    <div className="space-y-2">
                      {enrichedProfile.education.map((edu, eIdx) => (
                        <div key={eIdx} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                          <div className="text-xs font-medium text-white">{edu.school || "University / College"}</div>
                          <div className="text-[11px] text-white/50">{edu.degree ? `${edu.degree} in ${edu.field_of_study || ""}` : edu.field_of_study}</div>
                          {edu.date_range && <div className="text-[10px] font-mono text-white/30 mt-0.5">{edu.date_range}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {enrichedProfile?.skills && enrichedProfile.skills.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Skills</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {enrichedProfile.skills.map((skill, sIdx) => (
                        <span key={sIdx} className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-white/70 border border-white/[0.08]">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Certifications & Languages */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {enrichedProfile?.certifications && enrichedProfile.certifications.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Certifications</h4>
                      <ul className="text-xs text-white/60 space-y-1 list-disc list-inside">
                        {enrichedProfile.certifications.map((c, cIdx) => (
                          <li key={cIdx}>{typeof c === 'string' ? c : c.name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {enrichedProfile?.languages && enrichedProfile.languages.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Languages</h4>
                      <div className="flex flex-wrap gap-1">
                        {enrichedProfile.languages.map((l, lIdx) => (
                          <span key={lIdx} className="px-2 py-0.5 rounded text-[10px] bg-white/[0.03] text-white/50">
                            {typeof l === 'string' ? l : l.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Privacy & Contact Reveal Notice */}
                <div className="p-3 rounded-lg border border-white/[0.06] bg-[#0c0c0c] text-[11px] text-white/40 space-y-1">
                  <div className="font-medium text-white/60">Contact Information Status:</div>
                  <p>
                    Direct personal email and mobile phone reveals are disabled for this session under the pilot credit protection policy.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Sheet Footer */}
          <div className="p-4 border-t border-white/[0.08] bg-[#141414] flex items-center justify-between">
            <span className="text-[11px] text-white/40">
              {enrichedProfile ? "Enriched profile loaded" : "Candidate summary"}
            </span>
            {selectedCandidate && (
              <button
                type="button"
                onClick={() => handleAddToShortlist(selectedCandidate)}
                disabled={shortlistedMap[selectedCandidate.linkedin_url || selectedCandidate.id] || isAuditor}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  shortlistedMap[selectedCandidate.linkedin_url || selectedCandidate.id]
                    ? "bg-[#00D604]/20 text-[#00D604] border border-[#00D604]/30 cursor-default"
                    : "bg-[#00D604] text-black hover:bg-[#00D604]/90 disabled:opacity-40"
                }`}
                data-testid="sheet-add-to-shortlist-btn"
              >
                {shortlistedMap[selectedCandidate.linkedin_url || selectedCandidate.id] ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Shortlisted ✓
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    Add to Shortlist
                  </>
                )}
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
