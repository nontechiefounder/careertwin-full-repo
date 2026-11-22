"use client";

import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#030303] text-[var(--text-primary)] font-sans tracking-tight">
      <MarketingNav />
      <div className="pt-32 pb-24 px-6 max-w-3xl mx-auto">
        <h1 className="text-4xl font-semibold tracking-tight mb-8">Privacy Policy</h1>
        <div className="space-y-6 text-[15px] text-white/60 leading-relaxed">
          <p>Last updated: October 2026</p>
          <p>workBYLiNE (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how your personal information is collected, used, and disclosed by workBYLiNE.</p>
          
          <h2 className="text-xl font-semibold text-white mt-8 mb-4">Information We Collect</h2>
          <p>We strictly collect information necessary to provide verification-first hiring services. This includes explicitly provided professional details, authorized repository access (GitHub), and professional network (LinkedIn) data.</p>
          
          <h2 className="text-xl font-semibold text-white mt-8 mb-4">How We Use Your Information</h2>
          <p>Your data is processed by our AI engines solely for the purpose of generating decision packets and trust matrices for hiring teams. We never sell your data to third-party brokers.</p>
          
          <h2 className="text-xl font-semibold text-white mt-8 mb-4">Data Security</h2>
          <p>All data is encrypted in transit using industry-standard TLS and encrypted at rest. We employ strict data minimisation protocols.</p>
        </div>
      </div>
      <MarketingFooter />
    </div>
  );
}
