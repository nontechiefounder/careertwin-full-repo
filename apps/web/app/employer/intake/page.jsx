"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import NaiveShell from "@/components/NaiveShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  X, Plus, Loader2, Sparkles, Save, ArrowRight, ArrowLeft,
  FileText, AlignLeft, CheckCircle2, AlertCircle, HelpCircle, ShieldCheck
} from "lucide-react";
import Link from "next/link";

import IntakeSection from "@/components/intake/IntakeSection";
import IntakeErrorState from "@/components/intake/IntakeErrorState";
import ProductGovernanceNotice from "@/components/packet/ProductGovernanceNotice";

// ── Tag Chip Input Component ─────────────────────────────────────
function TagInput({ tags, onAdd, onRemove, placeholder, variant = "must", testId }) {
  const [val, setVal] = useState("");
  const handleKey = (e) => {
    if (e.key === "Enter" && val.trim()) {
      e.preventDefault();
      onAdd(val.trim());
      setVal("");
    }
  };

  const chipStyles =
    variant === "must"
      ? "border-[#00D604]/30 bg-[#00D604]/10 text-[#00D604]"
      : variant === "nice"
      ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
      : "border-rose-500/30 bg-rose-500/10 text-rose-400";

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {tags.map((tag, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-mono font-medium ${chipStyles}`}
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="opacity-60 hover:opacity-100 transition-opacity"
              data-testid={`${testId}-remove-${i}`}
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-[#4A4A4A] italic pt-0.5">None added yet</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          id={`${testId}-input-field`}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          aria-label={placeholder || "Add item"}
          className="bg-[#1A1A1A] border-[#343434] text-xs text-[#F2F2F2] placeholder:text-[#4A4A4A] h-9 focus:border-[#00D604]/40 focus:ring-0"
          data-testid={`${testId}-input`}
        />
        <button
          type="button"
          onClick={() => {
            if (val.trim()) {
              onAdd(val.trim());
              setVal("");
            }
          }}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#343434] bg-[#1A1A1A] text-[#F2F2F2]/60 hover:text-[#F2F2F2] hover:border-[#00D604]/40 transition-all shrink-0"
          data-testid={`${testId}-add-btn`}
          aria-label="Add item"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function Intake() {
  const router = useRouter();
  const { user } = useAuth();
  const [inputMode, setInputMode] = useState("describe"); // 'describe' | 'paste_jd'
  const [activeStep, setActiveStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [form, setForm] = useState({
    role_title: "",
    company: user?.company || "",
    location: "",
    company_stage: "",
    job_description: "",
    must_haves: [],
    nice_to_haves: [],
    disqualifiers: [],
    hiring_notes: "",
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const addTag = (key, val) => setForm((f) => ({ ...f, [key]: [...f[key], val] }));
  const removeTag = (key, i) =>
    setForm((f) => ({ ...f, [key]: f[key].filter((_, idx) => idx !== i) }));

  // Load existing role for editing if URL parameter present
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      api
        .get(`/employer/brief/${id}`)
        .then((res) => {
          if (res.data?.hiring_run) {
            const run = res.data.hiring_run;
            setForm({
              role_title: run.role_title || "",
              company: run.company || "",
              location: run.location || "",
              company_stage: run.company_stage || "",
              job_description: run.job_description || "",
              must_haves: run.must_haves || [],
              nice_to_haves: run.nice_to_haves || [],
              disqualifiers: run.disqualifiers || [],
              hiring_notes: run.hiring_notes || "",
            });
            setActiveStep(2);
          }
        })
        .catch(() => toast.error("Failed to load existing role data"));
    }
  }, []);

  const handleInterpretAndFill = async () => {
    const textToSynthesize = form.job_description.trim() || form.role_title.trim();
    if (!textToSynthesize) {
      toast.error("Please enter a role title or description to interpret");
      return;
    }

    setAutoFillLoading(true);
    toast.loading("Analyzing role requirements and extracting criteria...", { id: "ai-fill" });

    try {
      const res = await api.post("/employer/hiring-runs/suggest", {
        role_title: form.role_title,
        company: form.company,
        company_stage: form.company_stage,
        job_description: form.job_description,
        must_haves: form.must_haves,
        nice_to_haves: form.nice_to_haves,
        disqualifiers: form.disqualifiers,
      });

      if (res.data) {
        setForm((f) => ({
          ...f,
          role_title: res.data.role_title || f.role_title,
          job_description: res.data.job_description || f.job_description,
          must_haves: res.data.must_haves?.length ? res.data.must_haves : f.must_haves,
          nice_to_haves: res.data.nice_to_haves?.length ? res.data.nice_to_haves : f.nice_to_haves,
          disqualifiers: res.data.disqualifiers?.length ? res.data.disqualifiers : f.disqualifiers,
        }));
        toast.success("Role interpreted — check 'Here's what we understood' below", {
          id: "ai-fill",
        });
        setActiveStep(3); // Jump to review step
      }
    } catch {
      toast.error("Failed to interpret role requirements — check network connection", { id: "ai-fill" });
    } finally {
      setAutoFillLoading(false);
    }
  };

  const handleSubmit = async (e, isDraft = false) => {
    e?.preventDefault();
    setSubmitError(null);

    if (!form.role_title.trim()) {
      setSubmitError("Role title is required");
      toast.error("Role title is required");
      return;
    }

    isDraft ? setDraftLoading(true) : setLoading(true);

    try {
      const payload = { ...form, status: isDraft ? "draft" : "active" };
      const res = await api.post("/employer/hiring-runs", payload);

      if (isDraft) {
        toast.success("Draft saved successfully");
        router.push("/employer");
      } else {
        toast.success("Role Brief & Proof Contract created ✓");
        router.push(`/employer/brief/${res.data.hiring_run_id}`);
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || "Failed to create hiring run";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      isDraft ? setDraftLoading(false) : setLoading(false);
    }
  };

  return (
    <NaiveShell
      pageTitle="Create / Edit Role"
      pageSubtitle="Define canonical criteria for evidence-governed candidate sourcing & review"
      activeNav="hiring"
      goBack="/employer"
      topBar={
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={handleInterpretAndFill}
            disabled={autoFillLoading}
            className="px-3 py-2 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2]/90 hover:text-[#F2F2F2] hover:border-[#00D604]/40 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            data-testid="autofill-btn"
          >
            <Sparkles className={`h-3.5 w-3.5 ${autoFillLoading ? "animate-spin" : "text-[#00D604]"}`} />
            {autoFillLoading ? "Interpreting..." : "AI Interpret"}
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, true)}
            disabled={draftLoading || loading}
            className="px-3 py-2 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2]/90 hover:text-[#F2F2F2] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            data-testid="save-draft-btn"
          >
            {draftLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Draft
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, false)}
            disabled={loading || draftLoading}
            className="btn-white !text-xs !py-2 !px-4 rounded-xl justify-center"
            data-testid="generate-brief-btn"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Generate Brief <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      }
    >
      <div className="min-h-full flex flex-col max-w-full overflow-x-hidden" data-testid="intake-page">
      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
        <ProductGovernanceNotice />
        <IntakeErrorState error={submitError} />

        {/* Input Mode Selector: Describe Role vs Paste Job Description */}
        <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-1.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setInputMode("describe")}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              inputMode === "describe"
                ? "bg-white/[0.10] text-white border border-white/[0.12] shadow-sm"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            <AlignLeft className="h-3.5 w-3.5 text-[#00D604]" />
            Describe Role (Quick Intake)
          </button>
          <button
            type="button"
            onClick={() => setInputMode("paste_jd")}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              inputMode === "paste_jd"
                ? "bg-white/[0.10] text-white border border-white/[0.12] shadow-sm"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-blue-400" />
            Paste Job Description (Full Spec)
          </button>
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
          {/* Step 1: Role Basics & Identity */}
          <IntakeSection step={1} activeStep={activeStep} title="Role Basics & Identity">
            <div className="space-y-4" onClick={() => setActiveStep(1)}>
              <div>
                <Label htmlFor="role-title-input-field" className="text-[10px] font-mono text-[#A3A3A3] block mb-1.5 uppercase">
                  ROLE TITLE *
                </Label>
                <Input
                  id="role-title-input-field"
                  aria-label="Role Title"
                  value={form.role_title}
                  onChange={(e) => set("role_title", e.target.value)}
                  placeholder="e.g. Lead Distributed Systems Engineer"
                  className="bg-[#1A1A1A] border-[#343434] text-xs text-[#F2F2F2] placeholder:text-[#4A4A4A] h-9 focus:border-[#00D604]/40 focus:ring-0"
                  required
                  data-testid="role-title-input"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="location-input-field" className="text-[10px] font-mono text-[#A3A3A3] block mb-1.5 uppercase">
                    TARGET LOCATION / WORK MODE
                  </Label>
                  <Input
                    id="location-input-field"
                    aria-label="Target Location"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    placeholder="e.g. San Francisco, Remote (US), Hybrid"
                    className="bg-[#1A1A1A] border-[#343434] text-xs text-[#F2F2F2] placeholder:text-[#4A4A4A] h-9 focus:border-[#00D604]/40 focus:ring-0"
                    data-testid="location-input"
                  />
                </div>
                <div>
                  <Label htmlFor="company-stage-select-field" className="text-[10px] font-mono text-[#A3A3A3] block mb-1.5 uppercase">
                    COMPANY STAGE
                  </Label>
                  <Select value={form.company_stage} onValueChange={(v) => set("company_stage", v)}>
                    <SelectTrigger
                      id="company-stage-select-field"
                      aria-label="Stage"
                      className="bg-[#1A1A1A] border-[#343434] text-[#F2F2F2] h-9 text-xs focus:ring-0"
                      data-testid="company-stage-select"
                    >
                      <SelectValue placeholder="Select company stage" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111111] border-[#343434] text-[#F2F2F2]">
                      {["seed", "series-a", "series-b", "series-c", "growth", "public"].map((s) => (
                        <SelectItem key={s} value={s} className="text-xs hover:bg-[#1A1A1A]">
                          {s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </IntakeSection>

          {/* Step 2: Role Scope / Description Input */}
          <IntakeSection step={2} activeStep={activeStep} title={inputMode === "describe" ? "Role Scope & Key Outcomes" : "Job Description Document"}>
            <div onClick={() => setActiveStep(2)}>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="job-description-input-field" className="text-[10px] font-mono text-[#A3A3A3] block uppercase">
                  {inputMode === "describe" ? "DESCRIBE WHAT SUCCESS LOOKS LIKE" : "RAW JOB DESCRIPTION TEXT"}
                </Label>
                <button
                  type="button"
                  onClick={handleInterpretAndFill}
                  disabled={autoFillLoading}
                  className="text-[10px] font-mono text-[#00D604] hover:underline flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" /> Interpret into criteria
                </button>
              </div>
              <Textarea
                id="job-description-input-field"
                aria-label="Job Description"
                value={form.job_description}
                onChange={(e) => set("job_description", e.target.value)}
                placeholder={
                  inputMode === "describe"
                    ? "e.g. We need someone who has designed high-throughput distributed message queues. Must have led database shard migrations with zero downtime. 5+ years with Go or Rust."
                    : "Paste your existing job description here. Our extraction engine will preserve all exact requirement statements and map them into verifiable criteria..."
                }
                rows={7}
                className="bg-[#1A1A1A] border-[#343434] text-xs text-[#F2F2F2] placeholder:text-[#4A4A4A] resize-none focus:border-[#00D604]/40 focus:ring-0 leading-relaxed"
                data-testid="job-description-input"
              />
            </div>
          </IntakeSection>

          {/* Step 3: Canonical "Here's what we understood" Review Card */}
          <IntakeSection step={3} activeStep={activeStep} title="Here's What We Understood (Editable Criteria)">
            <div className="space-y-5" onClick={() => setActiveStep(3)}>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-xs text-white/70 space-y-3">
                <div className="flex items-center gap-2 text-white/90 font-medium">
                  <ShieldCheck className="h-4 w-4 text-[#00D604]" />
                  <span>Review and adjust extracted criteria before generating brief</span>
                </div>
                <p className="text-[11px] text-white/40 leading-relaxed">
                  These criteria will populate your versioned Proof Contract. Full requirement sentences are preserved as distinct criteria, never collapsed into loose skill keywords.
                </p>
              </div>

              {/* Must-Haves */}
              <div>
                <Label className="text-[10px] font-mono text-[#00D604] block mb-1 uppercase font-semibold">
                  MUST-HAVE REQUIREMENTS (NON-NEGOTIABLE)
                </Label>
                <p className="text-[11px] text-[#A3A3A3] mb-2 font-sans">
                  Candidates must demonstrate verifiable evidence against these criteria.
                </p>
                <TagInput
                  tags={form.must_haves}
                  onAdd={(v) => addTag("must_haves", v)}
                  onRemove={(i) => removeTag("must_haves", i)}
                  placeholder="e.g. 5+ years building distributed databases in Go or Rust"
                  variant="must"
                  testId="must-haves"
                />
              </div>

              {/* Nice-to-Haves / Inferred */}
              <div>
                <Label className="text-[10px] font-mono text-blue-400 block mb-1 uppercase font-semibold">
                  NICE-TO-HAVE / INFERRED CRITERIA
                </Label>
                <p className="text-[11px] text-[#A3A3A3] mb-2 font-sans">
                  Strong signals that improve ranking but are not strict gate blockers.
                </p>
                <TagInput
                  tags={form.nice_to_haves}
                  onAdd={(v) => addTag("nice_to_haves", v)}
                  onRemove={(i) => removeTag("nice_to_haves", i)}
                  placeholder="e.g. Experience with Apache Iceberg or Raft consensus"
                  variant="nice"
                  testId="nice-haves"
                />
              </div>

              {/* Disqualifiers */}
              <div>
                <Label className="text-[10px] font-mono text-rose-400 block mb-1 uppercase font-semibold">
                  DISQUALIFIER CONDITIONS
                </Label>
                <p className="text-[11px] text-[#A3A3A3] mb-2 font-sans">
                  Explicit disqualification triggers (e.g. lack of required security clearance or timezone mismatch).
                </p>
                <TagInput
                  tags={form.disqualifiers}
                  onAdd={(v) => addTag("disqualifiers", v)}
                  onRemove={(i) => removeTag("disqualifiers", i)}
                  placeholder="e.g. No hands-on production backend development in last 2 years"
                  variant="disqualifier"
                  testId="disqualifiers"
                />
              </div>

              {/* Internal Notes / Hiring Context */}
              <div>
                <Label htmlFor="hiring-notes-input-field" className="text-[10px] font-mono text-[#A3A3A3] block mb-1.5 uppercase">
                  INTERNAL HIRING TEAM NOTES (CONFIDENTIAL)
                </Label>
                <Textarea
                  id="hiring-notes-input-field"
                  aria-label="Hiring Notes"
                  value={form.hiring_notes}
                  onChange={(e) => set("hiring_notes", e.target.value)}
                  placeholder="e.g. Priority role for Q4 infrastructure replatforming. Hiring manager: Sarah."
                  rows={2}
                  className="bg-[#1A1A1A] border-[#343434] text-xs text-[#F2F2F2] placeholder:text-[#4A4A4A] resize-none focus:border-[#00D604]/40 focus:ring-0"
                  data-testid="hiring-notes-input"
                />
              </div>
            </div>
          </IntakeSection>

          {/* Bottom Action Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
            <Link
              href="/employer"
              className="text-xs font-mono text-white/50 hover:text-white transition-colors"
            >
              Cancel and return
            </Link>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={draftLoading || loading}
                className="px-4 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs font-medium text-white/80 hover:text-white hover:bg-white/[0.06] transition-all flex items-center gap-1.5"
              >
                {draftLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Draft
              </button>
              <button
                type="submit"
                disabled={loading || draftLoading}
                className="btn-white !text-xs !py-2.5 !px-5 rounded-xl justify-center"
                data-testid="bottom-submit-btn"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Generate Role Brief & Proof Contract <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  </NaiveShell>
);
}
