"use client";

import { useRouter } from "next/navigation";
import {
  CheckCircle, XCircle, ArrowRight, Clock,
  Search, ShieldCheck, FileText, Zap
} from "lucide-react";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import SpotlightCard from "@/components/marketing/SpotlightCard";
import BackgroundBeams from "@/components/marketing/BackgroundBeams";
import { BentoGrid, BentoCard } from "@/components/marketing/BentoGrid";

/* ───────────────────────────────
   DATA
   ─────────────────────────────── */
const COMPARE_ROWS = [
  { aspect: "Time to first shortlist",      old: "5–10 business days",           twin: "Under 2 minutes" },
  { aspect: "Candidate discovery",          old: "Manual Boolean search on LinkedIn", twin: "AI-powered multi-signal sourcing" },
  { aspect: "Proof of claims",              old: "Trust the resume",              twin: "Verified against GitHub, LinkedIn, publications" },
  { aspect: "Skills validation",            old: "Phone screen or gut feel",      twin: "Async technical Q&A scored by AI" },
  { aspect: "Decision information",         old: "Gut + notes from a phone call", twin: "Structured decision packet with evidence" },
  { aspect: "Bias surface area",            old: "Photo, name, school on resume", twin: "Scored only on verified capability evidence" },
  { aspect: "Recruiter hours per shortlist",old: "12–20 hours",                  twin: "< 30 minutes review" },
  { aspect: "Transparency",                 old: "Black box / gut feeling",       twin: "Trust matrix: VERIFIED / INFERRED / UNCERTAIN" },
  { aspect: "Async screening",              old: "Requires scheduling",           twin: "Candidate-paced, no booking required" },
  { aspect: "Scale",                        old: "1 recruiter = ~5 roles",        twin: "One platform = unlimited concurrent roles" },
];

const TESTIMONIALS = [
  {
    quote: "We went from 2 weeks of recruiter time to a shortlist in 90 seconds. The trust matrix alone saved us from two bad hires.",
    name: "Priya M.",
    title: "Head of Engineering, Series B SaaS",
  },
  {
    quote: "The async screen replaced our first technical call entirely. Candidates love it and we get better signal than a rushed 45-min Zoom.",
    name: "Arjun K.",
    title: "Founding Engineer, YC W24",
  },
  {
    quote: "Every claim on the shortlist is backed by a GitHub commit or a verified project. We stopped interviewing people who couldn't code.",
    name: "Sneha R.",
    title: "CTO, Fintech Startup",
  },
];

const STATS = [
  { val: "127", unit: "profiles", desc: "scanned in a single 69-second run" },
  { val: "12×", unit: "faster",   desc: "shortlist vs. traditional process" },
  { val: "0.89", unit: "fit",     desc: "average fit score on shortlisted candidates" },
  { val: "94%", unit: "accuracy", desc: "on async screening quality signal" },
];

/* ───────────────────────────────
   TESTIMONIAL CARD
   ─────────────────────────────── */
function TestimonialCard({ t }) {
  return (
    <SpotlightCard
      spotColor="rgba(255,255,255,0.04)"
      className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-7 flex flex-col gap-5 hover:border-white/[0.13] transition-all"
    >
      <p className="text-[13px] text-white/55 leading-relaxed italic flex-1">&quot;{t.quote}&quot;</p>
      <div>
        <p className="text-[12px] font-semibold text-white/75">{t.name}</p>
        <p className="text-[10px] text-white/30 mt-0.5">{t.title}</p>
      </div>
    </SpotlightCard>
  );
}

/* ───────────────────────────────
   MAIN PAGE
   ─────────────────────────────── */
export default function ComparePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white tracking-tight" data-testid="compare-page" style={{ fontFamily: "'Inter', sans-serif" }}>
      <MarketingNav />

      {/* ── HERO ── */}
      <section className="relative pt-36 pb-20 px-6 text-center overflow-hidden">
        <BackgroundBeams />
        <div className="relative z-10 max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] text-[10px] font-mono text-white/40 tracking-widest uppercase mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Why CareerTWiN
          </span>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight mb-6 leading-[1.08]">
            Stop the<br /><span className="text-white/40">resume lottery</span>
          </h1>
          <p className="text-[15px] text-white/40 leading-relaxed mb-10 max-w-xl mx-auto">
            Traditional hiring is a game of telephone. Resumes lie. Phone screens waste time. References don&apos;t check out. CareerTWiN replaces all of it with verified proof.
          </p>
          <button
            onClick={() => router.push("/auth")}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-black text-[14px] font-semibold hover:bg-white/90 transition-all shadow-[0_0_24px_rgba(255,255,255,0.12)]"
          >
            Start for free <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* ── METRICS STRIP ── */}
      <section className="border-t border-b border-white/[0.05] py-12 px-6 relative z-10">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <div key={i} className="text-center">
              <p className="text-3xl font-semibold font-mono text-white tracking-tight">{s.val}</p>
              <p className="text-[10px] font-mono text-white/25 uppercase tracking-widest mt-1">{s.unit}</p>
              <p className="text-[11px] text-white/30 mt-1.5 leading-snug">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="max-w-5xl mx-auto px-6 py-24 relative z-10">
        <div className="text-center mb-14">
          <p className="text-[10px] font-mono text-white/25 uppercase tracking-widest mb-4">Head to head</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">CareerTWiN vs. the old way</h2>
        </div>

        <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-white/[0.01]">
          {/* Header */}
          <div className="grid grid-cols-3 bg-white/[0.03] border-b border-white/[0.07]">
            <div className="px-6 py-4">
              <p className="text-[10px] font-mono text-white/22 uppercase tracking-widest">Aspect</p>
            </div>
            <div className="px-6 py-4 border-l border-white/[0.05]">
              <p className="text-[11px] font-semibold text-white/30 line-through">Traditional</p>
            </div>
            <div className="px-6 py-4 border-l border-white/[0.07] bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-white flex items-center justify-center shrink-0">
                  <span className="text-black font-bold text-[7px] font-mono">CT</span>
                </div>
                <p className="text-[11px] font-semibold text-white/75">CareerTWiN</p>
              </div>
            </div>
          </div>

          {/* Rows */}
          {COMPARE_ROWS.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.012] transition-colors"
            >
              <div className="px-6 py-4 flex items-center">
                <span className="text-[12px] text-white/45 font-medium">{row.aspect}</span>
              </div>
              <div className="px-6 py-4 flex items-start gap-2 border-l border-white/[0.04]">
                <XCircle className="h-3.5 w-3.5 text-red-400/50 shrink-0 mt-0.5" />
                <span className="text-[12px] text-white/30 leading-snug">{row.old}</span>
              </div>
              <div className="px-6 py-4 flex items-start gap-2 border-l border-white/[0.07] bg-white/[0.02]">
                <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                <span className="text-[12px] text-white/65 leading-snug font-medium">{row.twin}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── BENTO WHY IT MATTERS ── */}
      <section className="max-w-5xl mx-auto px-6 pb-24 relative z-10">
        <div className="text-center mb-12">
          <p className="text-[10px] font-mono text-white/22 uppercase tracking-widest mb-4">The engines</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Built different, by design</h2>
        </div>
        <BentoGrid>
          <BentoCard
            featured
            icon={ShieldCheck}
            tag="Proof Engine"
            title="Trust, not claims"
            desc="Every must-have requirement is scored VERIFIED, INFERRED, or UNCERTAIN — against real public evidence: GitHub commits, OSS contributions, LinkedIn tenure, and publications. Not just what candidates say they can do."
            extra={
              <div className="flex gap-2 flex-wrap">
                {["VERIFIED", "INFERRED", "UNCERTAIN"].map((label, i) => (
                  <span key={i} className={`text-[8px] font-mono px-2 py-1 rounded-full border ${
                    i === 0 ? "border-green-500/25 bg-green-500/[0.08] text-green-400"
                    : i === 1 ? "border-blue-500/20 bg-blue-500/[0.06] text-blue-400"
                    : "border-white/[0.10] bg-white/[0.03] text-white/35"
                  }`}>{label}</span>
                ))}
              </div>
            }
          />
          <BentoCard
            icon={Clock}
            tag="Speed"
            title="127 profiles in 69 seconds"
            desc="AI agents run in parallel. By the time you finish your coffee, you have a shortlist."
          />
          <BentoCard
            icon={Zap}
            tag="Async Screen"
            title="No scheduling required"
            desc="Candidates answer 3–5 targeted questions on their own time. Answers scored by AI."
          />
          <BentoCard
            icon={Search}
            tag="Sourcing"
            title="Multi-signal discovery"
            desc="Not just LinkedIn. Public GitHub, portfolio sites, and professional communities all feed the sourcing engine."
          />
          <BentoCard
            icon={FileText}
            tag="Decision Packet"
            title="Hire-ready summaries"
            desc="Every shortlisted candidate comes with a structured packet: fit score, evidence, verification route, async screen results, and recommended next step."
          />
        </BentoGrid>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="max-w-5xl mx-auto px-6 pb-24 relative z-10">
        <div className="text-center mb-12">
          <p className="text-[10px] font-mono text-white/22 uppercase tracking-widest mb-4">Field Reports</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">What teams say</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => <TestimonialCard key={i} t={t} />)}
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="max-w-5xl mx-auto px-6 pb-20 relative z-10">
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[200px] rounded-full bg-white/[0.03] blur-[60px]" />
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-4 relative z-10">
            Ready to see it for yourself?
          </h2>
          <p className="text-[14px] text-white/40 max-w-md mx-auto mb-8 relative z-10 leading-relaxed">
            One sourcing run. Your real role. Real candidates. Verified. Free.
          </p>
          <div className="flex flex-wrap gap-3 justify-center relative z-10">
            <button
              onClick={() => router.push("/auth")}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-white text-black text-[14px] font-semibold hover:bg-white/90 transition-all shadow-[0_0_24px_rgba(255,255,255,0.10)]"
            >
              Start for free <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => router.push("/pricing")}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl border border-white/[0.12] text-[14px] text-white/50 hover:text-white hover:border-white/25 transition-all"
            >
              View pricing
            </button>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
