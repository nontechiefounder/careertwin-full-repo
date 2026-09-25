"use client";

import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import BackgroundBeams from "@/components/marketing/BackgroundBeams";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white selection:bg-white/30 font-sans overflow-x-hidden tracking-tight">
      <MarketingNav />
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 flex flex-col items-center justify-center text-center overflow-hidden">
        <BackgroundBeams />
        <div className="relative z-10 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.1] mb-6">
            Let's talk <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">hiring.</span>
          </h1>
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-12">
            Ready to stop the resume lottery? Get in touch with our enterprise team to set up a custom deployment of CareerTWiN.
          </p>
          <button className="px-8 py-3 rounded-lg bg-white text-black text-[14px] font-semibold transition-all hover:bg-white/90 shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_40px_rgba(255,255,255,0.25)]">
            Contact Sales
          </button>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
