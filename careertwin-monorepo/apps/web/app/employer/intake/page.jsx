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
import { X, Plus, Loader2, Sparkles, Save, ArrowRight, ArrowLeft } from "lucide-react";
import Link from "next/link";

import DocumentDropzone from "@/components/intake/DocumentDropzone";
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
      ? "border-[#10D97A]/30 bg-[#10D97A]/10 text-[#10D97A]"
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
          className="bg-[#1A1A1A] border-[#343434] text-xs text-[#F2F2F2] placeholder:text-[#4A4A4A] h-9 focus:border-[#10D97A]/40 focus:ring-0"
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
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#343434] bg-[#1A1A1A] text-[#F2F2F2]/60 hover:text-[#F2F2F2] hover:border-[#10D97A]/40 transition-all shrink-0"
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

  const [uploadedFiles, setUploadedFiles] = useState([]);

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

  const handleAutoFill = async () => {
    if (!form.role_title.trim()) {
      toast.error("Enter a role title first before triggering AI Fill");
      return;
    }
    setAutoFillLoading(true);
    toast.loading(`Generating job description and requirements for "${form.role_title}"...`, {
      id: "ai-fill",
    });

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
          job_description: res.data.job_description || f.job_description,
          must_haves: res.data.must_haves?.length ? res.data.must_haves : f.must_haves,
          nice_to_haves: res.data.nice_to_haves?.length ? res.data.nice_to_haves : f.nice_to_haves,
          disqualifiers: res.data.disqualifiers?.length ? res.data.disqualifiers : f.disqualifiers,
        }));
        toast.success("AI Fill complete — requirements and job description generated", {
          id: "ai-fill",
        });
      }
    } catch {
      toast.error("AI Fill failed — check network connection and try again", { id: "ai-fill" });
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
    <div className="min-h-screen bg-[#0E0E0E] text-[#F2F2F2] flex flex-col max-w-full overflow-x-hidden" data-testid="intake-page">
      {/* Top Header */}
      <header className="border-b border-[#343434] bg-[#111111] px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/employer"
            className="p-2.5 rounded-lg border border-[#343434] bg-[#1A1A1A] text-[#A3A3A3] hover:text-[#F2F2F2] hover:border-[#10D97A]/40 transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Return to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-semibold text-[#F2F2F2] tracking-tight whitespace-nowrap">New Role Intake</h1>
            <p className="text-xs text-[#A3A3A3] truncate">Define requirements for evidence-governed candidate sourcing</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto pt-1 sm:pt-0">
          <button
            type="button"
            onClick={handleAutoFill}
            disabled={autoFillLoading}
            className="px-3 py-2.5 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2]/90 hover:text-[#F2F2F2] hover:border-[#10D97A]/40 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-[44px] flex-1 sm:flex-initial"
            data-testid="autofill-btn"
          >
            <Sparkles className={`h-3.5 w-3.5 ${autoFillLoading ? "animate-spin" : "text-[#10D97A]"}`} />
            {autoFillLoading ? "Generating..." : "AI Fill"}
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, true)}
            disabled={draftLoading || loading}
            className="px-3 py-2.5 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2]/90 hover:text-[#F2F2F2] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-[44px] flex-1 sm:flex-initial"
            data-testid="save-draft-btn"
          >
            {draftLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Draft
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, false)}
            disabled={loading || draftLoading}
            className="px-3.5 py-2.5 rounded-lg border border-[#10D97A]/40 bg-[#10D97A] text-xs font-semibold text-[#0E0E0E] hover:bg-[#10D97A]/90 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-[44px] flex-1 sm:flex-initial"
            data-testid="generate-brief-btn"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Generate Brief <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
        <ProductGovernanceNotice />
        <IntakeErrorState error={submitError} />

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
          {/* Step 1: Role Basics */}
          <IntakeSection step={1} activeStep={activeStep} title="Role Basics & Identity">
            <div className="space-y-4" onClick={() => setActiveStep(1)}>
              <div>
                <Label htmlFor="role-title-input-field" className="text-[10px] font-mono text-[#4A4A4A] block mb-1.5 uppercase">
                  ROLE TITLE *
                </Label>
                <Input
                  id="role-title-input-field"
                  aria-label="Role Title"
                  value={form.role_title}
                  onChange={(e) => set("role_title", e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  className="bg-[#1A1A1A] border-[#343434] text-xs text-[#F2F2F2] placeholder:text-[#4A4A4A] h-9 focus:border-[#10D97A]/40 focus:ring-0"
                  required
                  data-testid="role-title-input"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="location-input-field" className="text-[10px] font-mono text-[#4A4A4A] block mb-1.5 uppercase">
                    TARGET LOCATION
                  </Label>
                  <Input
                    id="location-input-field"
                    aria-label="Target Location"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    placeholder="e.g. New York, Remote, or Noida"
                    className="bg-[#1A1A1A] border-[#343434] text-xs text-[#F2F2F2] placeholder:text-[#4A4A4A] h-9 focus:border-[#10D97A]/40 focus:ring-0"
                    data-testid="location-input"
                  />
                </div>
                <div>
                  <Label htmlFor="company-stage-select-field" className="text-[10px] font-mono text-[#4A4A4A] block mb-1.5 uppercase">
                    STAGE
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

          {/* Step 2: Job Description */}
          <IntakeSection step={2} activeStep={activeStep} title="Job Description & Scope">
            <div onClick={() => setActiveStep(2)}>
              <Label htmlFor="job-description-input-field" className="text-[10px] font-mono text-[#4A4A4A] block mb-1.5 uppercase">
                JOB DESCRIPTION
              </Label>
              <Textarea
                id="job-description-input-field"
                aria-label="Job Description"
                value={form.job_description}
                onChange={(e) => set("job_description", e.target.value)}
                placeholder="Paste your job description here, or click AI Fill above to generate one based on the role title..."
                rows={6}
                className="bg-[#1A1A1A] border-[#343434] text-xs text-[#F2F2F2] placeholder:text-[#4A4A4A] resize-none focus:border-[#10D97A]/40 focus:ring-0"
                data-testid="job-description-input"
              />
            </div>
          </IntakeSection>

          {/* Step 3: Requirements */}
          <IntakeSection step={3} activeStep={activeStep} title="Requirements & Disqualifiers">
            <div className="space-y-4" onClick={() => setActiveStep(3)}>
              <div>
                <Label htmlFor="must-have-input-field" className="text-[10px] font-mono text-[#4A4A4A] block mb-1.5 uppercase">
                  MUST-HAVES (HARD FILTERS)
                </Label>
                <TagInput
                  tags={form.must_haves}
                  onAdd={(v) => addTag("must_haves", v)}
                  onRemove={(i) => removeTag("must_haves", i)}
                  placeholder="e.g. 5+ yrs Python, System Design..."
                  variant="must"
                  testId="must-have"
                />
              </div>

              <div>
                <Label htmlFor="nice-have-input-field" className="text-[10px] font-mono text-[#4A4A4A] block mb-1.5 uppercase">
                  NICE-TO-HAVES (PREFERRED)
                </Label>
                <TagInput
                  tags={form.nice_to_haves}
                  onAdd={(v) => addTag("nice_to_haves", v)}
                  onRemove={(i) => removeTag("nice_to_haves", i)}
                  placeholder="e.g. AWS, Kubernetes..."
                  variant="nice"
                  testId="nice-have"
                />
              </div>

              <div>
                <Label htmlFor="disqualifier-input-field" className="text-[10px] font-mono text-[#4A4A4A] block mb-1.5 uppercase">
                  DISQUALIFIERS (INSTANT FAIL)
                </Label>
                <TagInput
                  tags={form.disqualifiers}
                  onAdd={(v) => addTag("disqualifiers", v)}
                  onRemove={(i) => removeTag("disqualifiers", i)}
                  placeholder="e.g. No remote work, No Python..."
                  variant="disqualifier"
                  testId="disqualifier"
                />
              </div>
            </div>
          </IntakeSection>

          {/* Step 4: Documents */}
          <IntakeSection step={4} activeStep={activeStep} title="Candidate Documents & Intended Scope">
            <div onClick={() => setActiveStep(4)}>
              <DocumentDropzone files={uploadedFiles} onFilesChange={setUploadedFiles} />
            </div>
          </IntakeSection>
        </form>
      </main>
    </div>
  );
}
