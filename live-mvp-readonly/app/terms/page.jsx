"use client";

import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white font-sans tracking-tight">
      <MarketingNav />
      <div className="pt-32 pb-24 px-6 max-w-3xl mx-auto">
        <h1 className="text-4xl font-semibold tracking-tight mb-8">Terms of Service</h1>
        <div className="space-y-6 text-[15px] text-white/60 leading-relaxed">
          <p>Last updated: October 2026</p>
          <p>By using CareerTWiN, you agree to these terms. If you disagree with any part of the terms, you may not access the service.</p>
          
          <h2 className="text-xl font-semibold text-white mt-8 mb-4">1. Use License</h2>
          <p>Permission is granted to temporarily download one copy of the materials on CareerTWiN's website for personal, non-commercial transitory viewing only.</p>
          
          <h2 className="text-xl font-semibold text-white mt-8 mb-4">2. Verification Services</h2>
          <p>Our AI engines provide inferences based on public data. While we strive for 99% accuracy, hiring decisions remain the sole responsibility of the employer.</p>
          
          <h2 className="text-xl font-semibold text-white mt-8 mb-4">3. Governing Law</h2>
          <p>These terms and conditions are governed by and construed in accordance with the laws of the applicable jurisdiction.</p>
        </div>
      </div>
      <MarketingFooter />
    </div>
  );
}
