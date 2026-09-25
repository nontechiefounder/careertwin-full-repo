"use client";

import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import BackgroundBeams from "@/components/marketing/BackgroundBeams";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white selection:bg-white/30 font-sans overflow-x-hidden tracking-tight">
      <MarketingNav />
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 flex flex-col items-center justify-center text-center overflow-hidden">
        <BackgroundBeams />
        <div className="relative z-10 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.1] mb-6">
            A team obsessed with <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">proof.</span>
          </h1>
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto">
            Traditional hiring is a game of telephone. Resumes lie. Phone screens waste time. References don&apos;t check out. We built CareerTWiN to fix it.
          </p>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
