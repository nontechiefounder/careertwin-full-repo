"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, Zap, ChevronDown } from "lucide-react";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import MovingBorder from "@/components/marketing/MovingBorder";
import SpotlightCard from "@/components/marketing/SpotlightCard";
import BackgroundBeams from "@/components/marketing/BackgroundBeams";

/* ────────────────────────────
   FAQ ITEM
   (Internal to Pricing page for now)
   ──────────────────────────── */
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border-b border-white/[0.06] py-5 cursor-pointer group"
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] font-medium text-white/70 group-hover:text-white/90 transition-colors">
          {q}
        </p>
        <ChevronDown
          className={`h-4 w-4 text-white/25 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </div>
      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-40 mt-3" : "max-h-0"}`}>
        <p className="text-[12px] text-white/40 leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

/* ────────────────────────────
   PRICING DATA
   ──────────────────────────── */
const PLANS = [
  {
    name: "Free",
    price: "0",
    billed: "Forever free",
    desc: "Get your first shortlist. No credit card.",
    cta: "Start for free",
    featured: false,
    features: [
      "1 active role",
      "Up to 30 profiles per run",
      "AI-generated hiring brief",
      "Basic fit scoring",
      "Decision packet (text)",
      "Community support",
    ],
    disabled: ["Async screening", "GitHub deep-dive", "Priority sourcing", "Team seats", "API access"],
  },
  {
    name: "Starter",
    price: "49",
    billed: "per month, billed monthly",
    desc: "For small teams hiring 1–3 roles at a time.",
    cta: "Start 14-day trial",
    featured: false,
    features: [
      "5 active roles",
      "Up to 150 profiles per run",
      "AI hiring brief + AI Fill",
      "Full fit scoring + trust matrix",
      "Async screening (3 Q per candidate)",
      "GitHub deep-dive verification",
      "Decision packet with evidence",
      "2 team seats",
    ],
    disabled: ["Priority sourcing queue", "Dedicated support", "API access"],
  },
  {
    name: "Pro",
    price: "149",
    billed: "per month, billed monthly",
    desc: "For fast-hiring teams that need full pipeline power.",
    cta: "Start 14-day trial",
    featured: true,
    features: [
      "Unlimited active roles",
      "500+ profiles per run",
      "Priority sourcing queue",
      "Full AI pipeline (all 6 engines)",
      "Async screening (custom Q)",
      "GitHub + LinkedIn deep-dive",
      "Full decision packet",
      "5 team seats",
      "API access",
      "Dedicated Slack support",
    ],
    disabled: [],
  },
];

const COMPARE_ROWS = [
  ["Active roles",         "1",         "5",           "Unlimited"],
  ["Profiles per run",     "30",         "150",         "500+"],
  ["AI hiring brief",      "✓",         "✓",           "✓"],
  ["Fit scoring",          "Basic",     "Full",        "Full"],
  ["Async screening",      "—",         "3 Q",         "Custom Q"],
  ["GitHub deep-dive",     "—",         "✓",           "✓"],
  ["Trust matrix",         "—",         "✓",           "✓"],
  ["Decision packet",      "Text only", "Full",        "Full"],
  ["Team seats",           "1",         "2",           "5"],
  ["API access",           "—",         "—",           "✓"],
  ["Support",              "Community", "Email",       "Dedicated Slack"],
];

const FAQS = [
  { q: "Is the free plan really free?", a: "Yes. No credit card required. You get one role, up to 30 profiles per sourcing run, and a basic decision packet. Forever." },
  { q: "What counts as a 'sourcing run'?", a: "A sourcing run is one AI cycle where we scan profiles against your role brief. You can trigger multiple runs — each counts against your monthly profile cap." },
  { q: "Can I upgrade or downgrade anytime?", a: "Yes. Upgrades take effect immediately, downgrades apply at the end of your billing cycle." },
  { q: "What's included in the 14-day trial?", a: "Full access to all Pro features for 14 days, no credit card required. After the trial, you'll choose a plan." },
  { q: "Do you offer annual billing?", a: "Yes — annual billing gives you 2 months free. Contact us after signing up to switch." },
];

/* ────────────────────────────
   PLAN CARD
   ──────────────────────────── */
function PlanCard({ plan, router }) {
  const card = (
    <SpotlightCard
      spotColor="rgba(255,255,255,0.05)"
      className={`rounded-2xl border p-7 h-full flex flex-col ${
        plan.featured
          ? "border-white/[0.20] bg-white/[0.04]"
          : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      {/* Badge */}
      {plan.featured && (
        <div className="flex items-center gap-1.5 mb-5">
          <Zap className="h-3 w-3 text-white/60" />
          <span className="text-[9px] font-mono text-white/50 uppercase tracking-[0.2em]">Most Popular</span>
        </div>
      )}

      <h3 className="text-[16px] font-semibold text-white/85 mb-1">{plan.name}</h3>
      <p className="text-[12px] text-white/35 mb-5 leading-snug">{plan.desc}</p>

      {/* Price */}
      <div className="flex items-end gap-1.5 mb-1.5">
        <span className="text-[38px] font-semibold leading-none text-white font-mono">${plan.price}</span>
        {plan.price !== "0" && <span className="text-[12px] text-white/30 mb-2">/mo</span>}
      </div>
      <p className="text-[10px] text-white/25 font-mono mb-7">{plan.billed}</p>

      {/* CTA */}
      <button
        onClick={() => router.push("/auth")}
        className={`w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all mb-7 ${
          plan.featured
            ? "bg-white text-black hover:bg-white/90 shadow-[0_0_24px_rgba(255,255,255,0.12)]"
            : "border border-white/[0.12] text-white/65 hover:text-white hover:border-white/25 hover:bg-white/[0.04]"
        }`}
        data-testid={`plan-cta-${plan.name.toLowerCase()}`}
      >
        {plan.cta}
      </button>

      {/* Features */}
      <div className="space-y-2.5 flex-1">
        {plan.features.map((f, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="w-4 h-4 rounded-full bg-green-400/15 border border-green-400/25 flex items-center justify-center shrink-0">
              <Check className="h-2.5 w-2.5 text-green-400" />
            </div>
            <span className="text-[12px] text-white/60">{f}</span>
          </div>
        ))}
        {plan.disabled.map((f, i) => (
          <div key={i} className="flex items-center gap-2.5 opacity-30">
            <div className="w-4 h-4 rounded-full border border-white/[0.10] flex items-center justify-center shrink-0">
              <span className="text-[8px] text-white/20">—</span>
            </div>
            <span className="text-[12px] text-white/30">{f}</span>
          </div>
        ))}
      </div>
    </SpotlightCard>
  );

  if (plan.featured) {
    return (
      <MovingBorder innerClass="h-full">
        {card}
      </MovingBorder>
    );
  }
  return card;
}

/* ────────────────────────────
   MAIN PAGE
   ──────────────────────────── */
export default function PricingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white tracking-tight" data-testid="pricing-page" style={{ fontFamily: "'Inter', sans-serif" }}>
      <MarketingNav />

      {/* ── HERO ── */}
      <section className="relative pt-36 pb-20 px-6 text-center overflow-hidden">
        <BackgroundBeams />
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] text-[10px] font-mono text-white/40 tracking-widest uppercase mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Pricing
          </span>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight mb-5 leading-[1.08]">
            Simple, honest pricing
          </h1>
          <p className="text-[15px] text-white/40 max-w-md mx-auto leading-relaxed mb-3">
            Start free. Upgrade when you need more power. No hidden fees, no per-seat gotchas.
          </p>
          <p className="text-[12px] font-mono text-white/22">Annual billing saves 2 months.</p>
        </div>
      </section>

      {/* ── PLANS ── */}
      <section className="max-w-5xl mx-auto px-6 pb-20 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {PLANS.map(plan => (
            <PlanCard key={plan.name} plan={plan} router={router} />
          ))}
        </div>

        {/* Enterprise CTA */}
        <div className="mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 flex flex-col md:flex-row items-center justify-between gap-5">
          <div>
            <p className="text-[14px] font-semibold text-white/80 mb-1">Need more? Custom for teams</p>
            <p className="text-[12px] text-white/35">Volume discounts, SSO, GDPR DPA, dedicated success manager.</p>
          </div>
          <button
            onClick={() => router.push("/auth")}
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/[0.12] text-[13px] text-white/60 hover:text-white hover:border-white/25 hover:bg-white/[0.04] transition-all"
          >
            Talk to us <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="max-w-4xl mx-auto px-6 pb-24 relative z-10">
        <h2 className="text-[22px] md:text-[28px] font-semibold tracking-tight text-center mb-12">
          Full feature comparison
        </h2>
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-white/[0.01]">
          {/* Table header */}
          <div className="grid grid-cols-4 bg-white/[0.03] border-b border-white/[0.07]">
            <div className="px-5 py-3.5">
              <p className="text-[10px] font-mono text-white/25 uppercase tracking-widest">Feature</p>
            </div>
            {PLANS.map(p => (
              <div key={p.name} className={`px-4 py-3.5 text-center ${p.featured ? "bg-white/[0.04]" : ""}`}>
                <p className="text-[11px] font-semibold text-white/70">{p.name}</p>
              </div>
            ))}
          </div>
          {/* Rows */}
          {COMPARE_ROWS.map(([feature, free, starter, pro], i) => (
            <div
              key={i}
              className={`grid grid-cols-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors`}
            >
              <div className="px-5 py-3 flex items-center">
                <span className="text-[12px] text-white/50">{feature}</span>
              </div>
              {[free, starter, pro].map((val, j) => (
                <div
                  key={j}
                  className={`px-4 py-3 flex items-center justify-center ${j === 2 ? "bg-white/[0.02]" : ""}`}
                >
                  <span className={`text-[11px] font-mono text-center ${
                    val === "✓" ? "text-green-400" :
                    val === "—" ? "text-white/18" :
                    "text-white/50"
                  }`}>{val}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-2xl mx-auto px-6 pb-24 relative z-10">
        <h2 className="text-[22px] font-semibold tracking-tight text-center mb-10">Pricing FAQ</h2>
        <div>
          {FAQS.map((f, i) => <FAQItem key={i} {...f} />)}
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
