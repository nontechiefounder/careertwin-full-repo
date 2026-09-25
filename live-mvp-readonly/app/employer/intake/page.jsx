"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { X, Plus, Loader2, Sparkles, Save, ArrowRight, CheckCircle2, Info } from "lucide-react";
import NaiveShell from "@/components/NaiveShell";

// ── Step Config ───────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Role basics",      field: "role_title"       },
  { id: 2, label: "Job description",  field: "job_description"  },
  { id: 3, label: "Requirements",     field: "must_haves"       },
  { id: 4, label: "Hiring notes",     field: "hiring_notes"     },
  { id: 5, label: "Generate brief",   field: ""                 },
];

// ── Guidance text per step ────────────────────────────────────────
const GUIDANCE = {
  1: { title: "Role Identity", text: "The AI uses your role title and company stage to calibrate sourcing filters — more accurate titles surface better candidates." },
  2: { title: "Job Description", text: "Paste your JD or let AI auto-fill based on the role. The more detail, the more precise the brief." },
  3: { title: "Requirements Signal", text: "Must-haves become hard filters. Nice-to-haves weight the ranking. Disqualifiers are automatic no-votes." },
  4: { title: "Context Layer", text: "Hiring notes let the AI understand team dynamics, urgency flags, and culture signals that JDs don't capture." },
  5: { title: "Ready to Source", text: "CareerTWiN will now generate a structured hiring brief, then you can launch a sourcing session to find verified candidates." },
};

// ── Tag Chip Input ────────────────────────────────────────────────
function TagInput({ tags, onAdd, onRemove, placeholder, variant = "must", testId }) {
  const [val, setVal] = useState("");
  const handleKey = (e) => {
    if (e.key === "Enter" && val.trim()) {
      e.preventDefault();
      onAdd(val.trim());
      setVal("");
    }
  };
  const chipClass = variant === "must" ? "tag-chip tag-chip-must"
    : variant === "nice" ? "tag-chip tag-chip-nice"
    : "tag-chip tag-chip-disqualifier";

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {tags.map((tag, i) => (
          <span key={i} className={chipClass}>
            {tag}
            <button type="button" onClick={() => onRemove(i)}
              className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
              data-testid={`${testId}-remove-${i}`}>
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-[10px] text-white/20 italic pt-0.5">None added yet</span>}
      </div>
      <div className="flex gap-2">
        <Input
          value={val} onChange={e => setVal(e.target.value)} onKeyDown={handleKey}
          placeholder={placeholder}
          className="bg-white/[0.03] border-white/[0.08] text-[12px] text-white/70 placeholder:text-white/25 h-8 focus:border-white/25 focus:ring-0"
          data-testid={`${testId}-input`}
        />
        <button type="button"
          onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); } }}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.08] text-white/40 hover:text-white/75 hover:bg-white/[0.04] hover:border-white/[0.15] transition-all shrink-0"
          data-testid={`${testId}-add-btn`}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Form Section Card ─────────────────────────────────────────────
function SectionCard({ step, activeStep, title, children }) {
  const isActive  = step === activeStep;
  const isDone    = step < activeStep;
  return (
    <div
      id={`step-${step}`}
      className={`rounded-xl border p-5 transition-all duration-200 ${
        isActive  ? "border-white/[0.12] bg-white/[0.03]"
        : isDone  ? "border-white/[0.05] bg-white/[0.015]"
        : "border-white/[0.04] bg-white/[0.01]"
      }`}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-mono font-semibold ${
          isDone   ? "bg-green-500/[0.15] text-green-400 border border-green-500/[0.25]"
          : isActive ? "bg-white/[0.10] text-white/75 border border-white/[0.18]"
          : "bg-white/[0.03] text-white/20 border border-white/[0.07]"
        }`}>
          {isDone ? <CheckCircle2 className="h-3 w-3" /> : step}
        </div>
        <h2 className={`text-[13px] font-semibold ${isActive ? "text-white/85" : isDone ? "text-white/50" : "text-white/30"}`}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export default function Intake() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [activeStep,     setActiveStep]     = useState(1);
  const [loading,        setLoading]        = useState(false);
  const [draftLoading,   setDraftLoading]   = useState(false);
  const [autoFillLoading,setAutoFillLoading]= useState(false);
  const [form, setForm] = useState({
    role_title: "", 
    company: user?.company || "", 
    location: "", // New location field
    company_stage: "seed",
    job_description: "", 
    must_haves: [], 
    nice_to_haves: [],
    disqualifiers: [], 
    hiring_notes: ""
  });

  const set      = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const addTag   = (key, val) => setForm(f => ({ ...f, [key]: [...f[key], val] }));
  const removeTag = (key, i) => setForm(f => ({ ...f, [key]: f[key].filter((_, idx) => idx !== i) }));

  // Completion % for progress bar
  const filledSteps = [
    form.role_title.trim() !== "",
    form.job_description.trim() !== "",
    form.must_haves.length > 0,
    true, // hiring notes optional
    false,
  ].filter(Boolean).length;
  const progress = Math.round((filledSteps / 4) * 100);
  
  // Loading existing role for editing
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      api.get(`/employer/brief/${id}`)
        .then(res => {
          if (res.data?.hiring_run) {
            const run = res.data.hiring_run;
            setForm({
              role_title: run.role_title || "",
              company: run.company || "",
              company_stage: run.company_stage || "seed",
              job_description: run.job_description || "",
              must_haves: run.must_haves || [],
              nice_to_haves: run.nice_to_haves || [],
              disqualifiers: run.disqualifiers || [],
              hiring_notes: run.hiring_notes || ""
            });
            setActiveStep(2); // Start at JD step
          }
        })
        .catch(() => toast.error("Failed to load existing role data"));
    }
  }, []);

  const handleAutoFill = async () => {
    if (!form.role_title.trim()) {
      toast.error("Enter a role title first — AI Fill needs at least the role name");
      return;
    }
    setAutoFillLoading(true);

    // Tell the user what we're about to do
    const willFill = [];
    if (!form.job_description.trim()) willFill.push("job description");
    if (form.must_haves.length === 0) willFill.push("must-haves");
    if (form.nice_to_haves.length === 0) willFill.push("nice-to-haves");
    if (form.disqualifiers.length === 0) willFill.push("disqualifiers");
    const fillingMsg = willFill.length > 0
      ? `Generating ${willFill.join(", ")} for "${form.role_title}"…`
      : `Enriching your existing fields for "${form.role_title}"…`;
    toast.loading(fillingMsg, { id: "ai-fill" });

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
        setForm(f => ({
          ...f,
          job_description: res.data.job_description || f.job_description,
          must_haves:    res.data.must_haves?.length    ? res.data.must_haves    : f.must_haves,
          nice_to_haves: res.data.nice_to_haves?.length ? res.data.nice_to_haves : f.nice_to_haves,
          disqualifiers: res.data.disqualifiers?.length ? res.data.disqualifiers : f.disqualifiers,
        }));
        const addedCount =
          (res.data.must_haves?.length || 0) +
          (res.data.nice_to_haves?.length || 0) +
          (res.data.disqualifiers?.length || 0);
        toast.success(
          `AI fill complete — ${addedCount} requirements + full JD generated`,
          { id: "ai-fill" }
        );
        // Jump to next empty step
        if (!form.job_description.trim()) setActiveStep(2);
        else if (form.must_haves.length === 0) setActiveStep(3);
      }
    } catch (err) {
      toast.error("AI Fill failed — check your connection and try again", { id: "ai-fill" });
    } finally {
      setAutoFillLoading(false);
    }
  };

  const handleSubmit = async (e, isDraft = false) => {
    e?.preventDefault();
    if (!form.role_title.trim()) { toast.error("Role title is required"); return; }
    isDraft ? setDraftLoading(true) : setLoading(true);
    try {
      const payload = { ...form, status: isDraft ? "draft" : "active" };
      const res = await api.post("/employer/hiring-runs", payload);
      if (isDraft) { 
        toast.success("Draft saved"); 
        router.push("/employer"); 
      }
      else { 
        toast.success("Brief generated ✓"); 
        router.push(`/employer/brief/${res.data.hiring_run_id}`); 
      }
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to create"); }
    finally { isDraft ? setDraftLoading(false) : setLoading(false); }
  };

  const guidance = GUIDANCE[activeStep];

  // ── Sidebar step indicator ────────────────────────────────────
  const stepNav = (
    <>
      <div className="px-2.5 py-3">
        <p className="mono-label mb-3">PROGRESS</p>
        <Progress value={progress} className="h-1 mb-3" />
        <p className="text-[10px] text-white/30">{progress}% complete</p>
      </div>
      <Separator className="bg-white/[0.05]" />
      <div className="px-2.5 py-2 space-y-0.5">
        {STEPS.map(s => (
          <button key={s.id} onClick={() => setActiveStep(s.id)}
            className={`nav-item ${activeStep === s.id ? "nav-item-active" : "nav-item-default"}`}>
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-mono shrink-0 ${
              s.id < activeStep  ? "bg-green-500/20 text-green-400" :
              s.id === activeStep? "bg-white/15 text-white/90" : "border border-white/10 text-white/20"
            }`}>
              {s.id < activeStep ? "✓" : s.id}
            </div>
            {s.label}
          </button>
        ))}
      </div>
    </>
  );

  // ── Right panel — guidance ─────────────────────────────────────
  const rightPanel = (
    <div className="px-4 py-4 animate-fade-in" key={activeStep}>
      <div className="mb-3 flex items-center gap-2">
        <Info className="h-3.5 w-3.5 text-white/30 shrink-0" />
        <p className="text-[11px] font-semibold text-white/40">{guidance.title}</p>
      </div>
      <p className="text-[11px] text-white/28 leading-relaxed">{guidance.text}</p>
      {activeStep === 3 && (
        <div className="mt-4 space-y-1.5">
          {["Must-haves → hard filter", "Nice-to-haves → ranking signal", "Disqualifiers → auto reject"].map((t, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-white/25">
              <span className="text-white/20 mt-0.5">·</span> {t}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <NaiveShell
      pageTitle="New Role Intake"
      pageSubtitle="Define requirements for AI-powered sourcing"
      extraNavItems={[]}
      rightPanel={rightPanel}
      rightPanelTitle="Guidance"
      backTo={{ label: "Dashboard", href: "/employer" }}
      topBar={
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleAutoFill}
                disabled={autoFillLoading}
                className={`btn-ghost disabled:opacity-30 relative ${
                  autoFillLoading ? "" : "hover:border-white/20"
                }`}
                data-testid="autofill-btn"
              >
                {autoFillLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5 text-white/70" />}
                {autoFillLoading ? "Generating…" : "AI Fill"}
                {!autoFillLoading && (
                  <span className="text-[8px] font-mono text-white/30 ml-0.5">✦</span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[220px] text-center">
              Generates an industry-standard JD, must-haves, nice-to-haves &amp; disqualifiers
              based on your role title. Any fields you already filled in will be kept and enriched.
            </TooltipContent>
          </Tooltip>
          <button onClick={e => handleSubmit(e, true)} disabled={draftLoading || loading}
            className="btn-ghost disabled:opacity-30"
            data-testid="save-draft-btn">
            {draftLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Draft
          </button>
          <button onClick={e => handleSubmit(e, false)} disabled={loading || draftLoading}
            className="btn-white disabled:opacity-40"
            data-testid="generate-brief-btn">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Generate Brief <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      }
    >
      <div className="flex h-full">
        {/* Step sidebar */}
        <div className="w-[176px] shrink-0 border-r border-white/[0.05] bg-[#0c0c0c] overflow-y-auto scrollbar-hide" data-testid="intake-page">
          {stepNav}
        </div>

        {/* Form content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-5">
          <form onSubmit={handleSubmit} className="max-w-lg space-y-4">

            {/* Step 1: Role Basics */}
            <SectionCard step={1} activeStep={activeStep} title="Role basics">
              <div className="space-y-4">
                <div onClick={() => setActiveStep(1)}>
                  <Label className="mono-label block mb-1.5">ROLE TITLE</Label>
                  <Input value={form.role_title} onChange={e => set("role_title", e.target.value)}
                    placeholder="e.g. Senior Backend Engineer"
                    className="bg-white/[0.03] border-white/[0.08] text-[12px] text-white/75 placeholder:text-white/25 h-9 focus:border-white/25 focus:ring-0"
                    required data-testid="role-title-input" />
                </div>
                {/* New Location Field */}
                <div onClick={() => setActiveStep(1)}>
                  <Label className="mono-label block mb-1.5">TARGET LOCATION</Label>
                  <Input value={form.location} onChange={e => set("location", e.target.value)}
                    placeholder="e.g. New York, Remote, or Noida"
                    className="bg-white/[0.03] border-white/[0.08] text-[12px] text-white/75 placeholder:text-white/25 h-9 focus:border-white/25 focus:ring-0"
                    data-testid="location-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mono-label block mb-1.5">COMPANY</Label>
                    <Input value={form.company || "Your Company"} disabled
                      className="bg-white/[0.02] border-white/[0.05] text-white/35 h-9 cursor-not-allowed text-[12px]"
                      data-testid="company-input" />
                  </div>
                  <div>
                    <Label className="mono-label block mb-1.5">STAGE</Label>
                    <Select value={form.company_stage} onValueChange={v => set("company_stage", v)}>
                      <SelectTrigger className="bg-white/[0.03] border-white/[0.08] text-white/65 h-9 text-[12px] focus:ring-0" data-testid="company-stage-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#111] border-white/[0.08] text-white/70">
                        {["seed","series-a","series-b","series-c","growth","public"].map(s => (
                          <SelectItem key={s} value={s} className="text-[12px] hover:bg-white/[0.05]">
                            {s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Step 2: Job Description */}
            <SectionCard step={2} activeStep={activeStep} title="Job description">
              <Textarea
                value={form.job_description}
                onChange={e => { set("job_description", e.target.value); setActiveStep(2); }}
                onFocus={() => setActiveStep(2)}
                placeholder="Paste a JD here, or click ✦ AI Fill above to generate an industry-standard one from your role title…"
                rows={7}
                className="bg-white/[0.03] border-white/[0.08] text-[12px] text-white/65 placeholder:text-white/22 resize-none focus:border-white/25 focus:ring-0"
                data-testid="job-description-input"
              />
              {!form.job_description.trim() && (
                <div
                  className="mt-2 flex items-center gap-1.5 cursor-pointer group"
                  onClick={handleAutoFill}
                >
                  {autoFillLoading
                    ? <Loader2 className="h-3 w-3 text-white/25 animate-spin" />
                    : <Sparkles className="h-3 w-3 text-white/25 group-hover:text-white/60 transition-colors" />}
                  <span className="text-[10px] text-white/25 group-hover:text-white/55 transition-colors font-mono">
                    {autoFillLoading ? "Generating JD…" : "Let AI generate a full JD based on your role title"}
                  </span>
                </div>
              )}
            </SectionCard>

            {/* Step 3: Requirements */}
            <SectionCard step={3} activeStep={activeStep} title="Requirements">
              <div className="space-y-5" onClick={() => setActiveStep(3)}>
                <div>
                  <Label className="mono-label block mb-2">MUST-HAVES</Label>
                  <TagInput tags={form.must_haves} onAdd={v => addTag("must_haves", v)} onRemove={i => removeTag("must_haves", i)}
                    placeholder="Add a hard requirement..." variant="must" testId="must-have" />
                </div>
                <div>
                  <Label className="mono-label block mb-2">NICE-TO-HAVES</Label>
                  <TagInput tags={form.nice_to_haves} onAdd={v => addTag("nice_to_haves", v)} onRemove={i => removeTag("nice_to_haves", i)}
                    placeholder="Add a bonus requirement..." variant="nice" testId="nice-to-have" />
                </div>
                <div>
                  <Label className="mono-label block mb-2">DISQUALIFIERS</Label>
                  <TagInput tags={form.disqualifiers} onAdd={v => addTag("disqualifiers", v)} onRemove={i => removeTag("disqualifiers", i)}
                    placeholder="Add an automatic reject condition..." variant="disqualifier" testId="disqualifier" />
                </div>
              </div>
            </SectionCard>

            {/* Step 4: Hiring Notes */}
            <SectionCard step={4} activeStep={activeStep} title="Hiring notes">
              <Textarea value={form.hiring_notes} onChange={e => { set("hiring_notes", e.target.value); setActiveStep(4); }}
                onFocus={() => setActiveStep(4)}
                placeholder="Any context: urgency, culture fit, team dynamics..."
                rows={3}
                className="bg-white/[0.03] border-white/[0.08] text-[12px] text-white/65 placeholder:text-white/22 resize-none focus:border-white/25 focus:ring-0"
                data-testid="hiring-notes-input"
              />
            </SectionCard>

            {/* Step 5: Generate CTA */}
            <SectionCard step={5} activeStep={activeStep} title="Generate brief">
              <div className="space-y-3">
                <p className="text-[11px] text-white/40 leading-relaxed">
                  CareerTWiN's AI will parse your requirements and create a structured brief. The brief guides the sourcing agent to find verified candidates.
                </p>
                <div className="flex gap-2.5">
                  <button type="submit" onClick={e => { setActiveStep(5); handleSubmit(e, false); }}
                    disabled={loading || draftLoading}
                    className="btn-white flex-1 justify-center disabled:opacity-40"
                    data-testid="generate-brief-btn-2">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {loading ? "Generating…" : "Generate Hiring Brief"}
                  </button>
                </div>
              </div>
            </SectionCard>
          </form>
        </div>
      </div>
    </NaiveShell>
  );
}
