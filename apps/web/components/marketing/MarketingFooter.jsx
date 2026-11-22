"use client";

import { useRouter } from "next/navigation";

const LINKS = {
  Product: ["How it works", "Compare", "Pricing", "Changelog"],
  Company: ["About", "Blog", "Careers", "Contact"],
  Legal: ["Privacy", "Terms", "Security", "Cookies"],
};

export default function MarketingFooter() {
  const router = useRouter();

  return (
      <footer className="border-t border-white/[0.08] bg-[#030303] px-6 py-14">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <button
                onClick={() => router.push("/")}
                className="flex items-center gap-2 mb-4"
              >
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  <img src="/logo-icon.svg" alt="workBYLiNE Logo" className="w-full h-full object-contain" />
                </div>
                <span className="text-[13px] font-semibold text-white">work<span className="text-[#00D604] font-bold">BYLiNE</span></span>
              </button>
                <p className="text-[12px] text-white/50 leading-relaxed max-w-[200px]">
                  Verification-first hiring for modern recruiting teams.
                </p>
                {/* Status dot */}
                <div className="flex items-center gap-2 mt-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D604] animate-pulse" />
                  <span className="text-[11px] font-mono text-white/40">All systems operational</span>
                </div>
            </div>

            {/* Link columns */}
            {Object.entries(LINKS).map(([col, links]) => (
              <div key={col}>
                <p className="text-[11px] font-mono text-white/40 uppercase tracking-[0.2em] mb-4">{col}</p>
                <ul className="space-y-2.5">
                  {links.map(l => (
                    <li key={l}>
                      <button className="text-[12px] text-white/32 hover:text-white/65 transition-colors text-left">
                        {l}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/[0.05] pt-8 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-white/18">© 2025 workBYLiNE, Inc. All rights reserved.</p>
            <div className="flex items-center gap-5">
              {["Privacy", "Terms", "Cookies"].map(l => (
                <button key={l} className="text-[11px] text-white/20 hover:text-white/45 transition-colors">
                  {l}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-mono text-white/12">v0.2.0</p>
          </div>
        </div>
      </footer>
      );
}
