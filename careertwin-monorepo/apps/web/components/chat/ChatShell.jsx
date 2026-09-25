"use client";

import ProductGovernanceNotice from "@/components/packet/ProductGovernanceNotice";

export default function ChatShell({ header, sidebar, children }) {
  return (
    <div className="h-screen w-full bg-[#0E0E0E] text-[#F2F2F2] flex overflow-hidden font-sans">
      {sidebar}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0E0E0E] border-r border-[#343434]/40">
        {header}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {children}
        </main>
        <div className="px-4 py-2 border-t border-[#343434]/30 bg-[#111111]/80 text-center shrink-0">
          <ProductGovernanceNotice />
        </div>
      </div>
    </div>
  );
}
