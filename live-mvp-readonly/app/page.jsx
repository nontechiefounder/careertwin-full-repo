"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  ArrowRight, Shield, Search, FileCheck, Zap, Target, CheckCircle,
  ChevronDown, Clock, Users, Activity, Package
} from "lucide-react";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import TypewriterEffect from "@/components/marketing/TypewriterEffect";
import BackgroundBeams from "@/components/marketing/BackgroundBeams";
import SpotlightCard from "@/components/marketing/SpotlightCard";
import MovingBorder from "@/components/marketing/MovingBorder";
import { BentoGrid, BentoCard } from "@/components/marketing/BentoGrid";


/* ═══════════════════════════════════════════════████
   ANIMATED PIXEL / DOT GRID – inspired by naive.ai
   Consistent with Inter + JetBrains Mono
═══════════════════════════════════════════════════ */
function PixelGrid({ rows = 12, cols = 18 }) {
  const dots = Array.from({ length: rows * cols }, (_, i) => i);
  return (
    <div
      className="grid gap-[5px]"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {dots.map((i) => {
        // Use pseudo-random values based on the index i to ensure SSR stability
        const pseudoRand = (seed) => {
          const x = Math.sin(seed + i) * 10000;
          return x - Math.floor(x);
        };

        const random1 = pseudoRand(1);
        const random2 = pseudoRand(2);
        const random3 = pseudoRand(3);

        const delay = (random1 * 3).toFixed(2);
        const size = random2 > 0.85 ? "w-2 h-2" : random2 > 0.6 ? "w-1.5 h-1.5" : "w-1 h-1";
        const opacity = random3 > 0.7 ? "opacity-60" : random3 > 0.4 ? "opacity-30" : "opacity-10";

        return (
          <div
            key={i}
            className={`${size} rounded-full bg-white ${opacity} pixel-pulse`}
            style={{ animationDelay: `${delay}s` }}
          />
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════
   SCROLL-REVEAL HOOK
═══════════════════════════════ */
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.12 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

/* ═══════════════════════════════
   FAQ ACCORDION
═══════════════════════════════ */
const FAQS = [
  {
    q: "How is CareerTWiN different from LinkedIn Recruiter or Greenhouse?",
    a: "CareerTWiN doesn't just surface profiles — it verifies them. Every candidate is scored against your role requirements using public proof (GitHub, LinkedIn, publications) before you ever see them. You get a shortlist, not a firehose."
  },
  {
    q: "What does 'verification-first' actually mean?",
    a: "Before any candidate appears on your shortlist, an AI agent checks their public footprint — OSS contributions, work history, writing, and more — and scores each must-have requirement as verified, inferred, or uncertain."
  },
  {
    q: "Do candidates have to do anything?",
    a: "Yes — an optional async screening step sends candidates 3–5 targeted technical questions. Their answers are scored and added to the decision packet. This replaces the first 45-minute call for most roles."
  },
  {
    q: "How long does sourcing take?",
    a: "A typical sourcing run processes 100–150 profiles in under 2 minutes and returns 2–5 shortlisted candidates with full decision packets."
  },
  {
    q: "Is my data secure?",
    a: "All data is encrypted in transit and at rest. We only store information you explicitly provide, never scrape third-party platforms without permissioned APIs."
  }
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border-b border-white/[0.06] py-5 cursor-pointer group"
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-[14px] font-medium text-white/80 group-hover:text-white transition-colors leading-snug">
          {q}
        </p>
        <ChevronDown
          className={`h-4 w-4 text-white/30 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </div>
      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-40 mt-3" : "max-h-0"}`}>
        <p className="text-[13px] text-white/45 leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════
   SOCIAL PROOF METRICS
═══════════════════════════════ */
const SOCIAL_PROOF = [
  { metric: "127", unit: "profiles", desc: "scanned in a single 69-second run" },
  { metric: "0.89", unit: "fit score", desc: "top shortlist score, fully verified" },
  { metric: "94%", unit: "confidence", desc: "on async screening quality" },
  { metric: "< 2 min", unit: "intake", desc: "from blank form to sourcing brief" },
];

/* ═══════════════════════════════
   MAIN COMPONENT
═══════════════════════════════ */
export default function Landing() {
  const router = useRouter();
  const { user } = useAuth();

  const [featRef, featVisible]   = useReveal();
  const [metricsRef, metricsVis] = useReveal();
  const [faqRef, faqVisible]     = useReveal();

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white overflow-x-hidden" data-testid="landing-page">

      {/* ── NAV ─────────────────────────────────────── */}
      <MarketingNav />

      {/* ── HERO ────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center overflow-hidden">
        {/* Background beams */}
        <BackgroundBeams />

        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full bg-white/[0.03] blur-[100px]" />
        </div>

        {/* Tag badge */}
        <div className="hero-badge mb-8 relative z-10">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] text-[11px] font-mono text-white/50 tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <TypewriterEffect
              words={["verification-first", "proof-based", "async screening", "AI-powered", "decision-ready"]}
              speed={70}
              pause={2000}
            />
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.08] mb-6 max-w-4xl animate-fade-in stagger-1">
          Hire on proof,<br />
          not <span className="text-gradient">promises</span>
        </h1>

        <p className="text-[16px] md:text-[18px] text-white/45 max-w-xl leading-relaxed mb-10 animate-fade-in stagger-2">
          CareerTWiN runs verification, proof checks, and async screening before a single candidate lands in your inbox. Only shortlist-ready profiles. Always.
        </p>

        <div className="relative mt-12 mb-4 w-full max-w-2xl mx-auto z-20 animate-fade-in stagger-3">
          <div className="flex items-center gap-3 bg-white/[0.03] backdrop-blur-3xl border border-white/[0.1] hover:border-[#10D97A]/50 transition-colors duration-500 rounded-2xl p-2.5 shadow-[0_0_40px_rgba(0,0,0,0.5)] cursor-text" onClick={() => router.push("/auth")}>
            <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0 ml-1">
              <Search className="h-4 w-4 text-[#10D97A]" />
            </div>
            <div className="flex-1 text-left overflow-hidden whitespace-nowrap px-2">
              <TypewriterEffect 
                words={[
                  "Find React engineers with 5+ years experience and verified OSS...",
                  "Source Python backend developers who contributed to FastAPI...",
                  "Hire staff-level designers with proven FinTech portfolios..."
                ]} 
                speed={40}
                pause={2500}
                className="text-[13px] sm:text-[14px] font-mono text-white/50"
              />
            </div>
            <button onClick={(e) => { e.stopPropagation(); router.push("/auth"); }} className="shrink-0 bg-white text-black px-6 sm:px-8 py-3 rounded-xl font-semibold text-[13px] hover:bg-white/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] active:scale-95">
              Source Now
            </button>
          </div>
        </div>

        {/* Pixel grid demo block */}
        <div className="relative mt-20 w-full max-w-2xl mx-auto fade-up stagger-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111] overflow-hidden shadow-2xl">
            {/* Window chrome */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.06] bg-[#0d0d0d]">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              <div className="ml-4 h-1.5 flex-1 bg-white/[0.04] rounded-full" />
            </div>
            {/* Pixel animation */}
            <div className="p-8 flex items-center justify-center bg-[#0a0a0a]">
              <PixelGrid rows={10} cols={20} />
            </div>
            {/* Status bar */}
            <div className="px-4 py-3 border-t border-white/[0.06] flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[11px] font-mono text-white/30">Sourcing session complete — 127 profiles · 2 shortlisted · 1 hold · 1m 09s</span>
            </div>
          </div>
          {/* Glow under card */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-white/[0.04] blur-3xl rounded-full pointer-events-none" />
        </div>
      </section>

      {/* ── SOCIAL PROOF METRICS ────────────────────── */}
      <section ref={metricsRef} className="border-t border-b border-white/[0.05] py-14 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {SOCIAL_PROOF.map((s, i) => (
            <div
              key={i}
              className={`text-center transition-all duration-700 ${metricsVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <p className="text-3xl md:text-4xl font-semibold text-white tracking-tight font-mono">{s.metric}</p>
              <p className="text-[11px] font-mono text-white/30 uppercase tracking-widest mt-1">{s.unit}</p>
              <p className="text-[12px] text-white/35 mt-1.5 leading-snug">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA BANNER ──────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-8 mb-12">
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-10 md:p-14 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[200px] rounded-full bg-white/[0.03] blur-[60px]" />
          </div>
          <p className="text-[11px] font-mono text-white/30 uppercase tracking-widest mb-5">Ready to hire smarter?</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
            Start your first sourcing run<br />in under 2 minutes
          </h2>
          <p className="text-[14px] text-white/40 max-w-md mx-auto mb-10 leading-relaxed">
            No credit card required. Create a role brief, run verification, and get your first shortlist — free.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => router.push("/auth")}
              className="cta-primary"
            >
              Get started free <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => router.push("/pricing")}
              className="cta-secondary"
            >
              View pricing
            </button>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────── */}
      <section ref={faqRef} className="max-w-2xl mx-auto px-6 py-12 mb-16">
        <div className={`transition-all duration-700 ${faqVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <p className="text-[11px] font-mono text-white/30 uppercase tracking-widest mb-4 text-center">FAQ</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-center mb-12">Common questions</h2>
          <div>
            {FAQS.map((f, i) => <FAQItem key={i} {...f} />)}
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────── */}
      <MarketingFooter />

    </div>
  );
}
