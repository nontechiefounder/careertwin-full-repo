"use client";

import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart3, Plus, Link2, ChevronDown,
  ArrowLeft, Activity, Settings, Layers, MessageSquare, User
} from "lucide-react";

// ── Brand Mark ────────────────────────────────────────────────────
export function CTLogo({ size = "sm" }) {
  const s = size === "sm" ? "w-6 h-6 rounded-[6px]" : "w-8 h-8 rounded-md";
  return (
    <div className={`${s} bg-white flex items-center justify-center shrink-0 overflow-hidden`}>
      <img src="/logo.svg" alt="CareerTWiN Logo" className="w-full h-full object-contain" />
    </div>
  );
}

// ── Sidebar Nav Item ──────────────────────────────────────────────
function NavItem({ icon: Icon, label, onClick, active, indent }) {
  return (
    <button
      onClick={onClick}
      className={`nav-item ${active ? "nav-item-active" : "nav-item-default"} ${indent ? "pl-6" : ""}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── Collapsible Sidebar Section ────────────────────────────────────
function SidebarSection({ label, children, defaultOpen = true }) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between px-2.5 py-1.5 group">
        <span className="mono-label !text-[8px]">{label}</span>
        <ChevronDown className="h-2.5 w-2.5 text-white/20 group-hover:text-white/40 transition-transform duration-200 [.collapsible-open_&]:rotate-180 [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5 pb-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Live Status Indicator ─────────────────────────────────────────
function StatusDot() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot shadow-[0_0_4px_rgba(74,222,128,0.5)]" />
      <span className="mono-label">Live</span>
    </div>
  );
}

// ── Main Shell ────────────────────────────────────────────────────
/**
 * NaiveShell — shared 3-panel layout for all employer pages.
 *
 * @param {object}  props
 * @param {ReactNode} props.topBar           — content rendered in the top bar (right side)
 * @param {string}  [props.pageTitle]        — page title shown in top bar
 * @param {string}  [props.pageSubtitle]     — subtitle below the title
 * @param {Array}   [props.extraNavItems]    — additional sidebar nav items [{label, icon, action}]
 * @param {ReactNode} [props.rightPanel]     — content for the right Active Tasks panel
 * @param {string}  [props.rightPanelTitle]  — heading for right panel (default "Active Tasks")
 * @param {boolean} [props.showRightPanel]   — whether to show the right panel (default true)
 * @param {ReactNode} props.children         — main content area
 */
export default function NaiveShell({
  pageTitle,
  pageSubtitle,
  topBar,
  extraNavItems = [],
  rightPanel,
  rightPanelTitle = "Active Tasks",
  showRightPanel = true,
  backTo,
  children,
}) {
  const router = useRouter();
  const path = usePathname();
  const { logout } = useAuth();

  return (
    <div
      className="h-screen bg-[#0d0d0d] text-white flex overflow-hidden"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── LEFT SIDEBAR ─────────────────────────────────── */}
      <aside className="w-[196px] shrink-0 border-r border-white/[0.06] flex flex-col bg-[#0b0b0b] overflow-y-auto scrollbar-hide">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-white/[0.06] shrink-0">
          <button onClick={() => router.push("/employer")} className="flex items-center gap-2 w-full text-left group">
            <CTLogo />
            <span className="text-[13px] font-semibold tracking-tight text-white/85 group-hover:text-white transition-colors">
              CareerTW<span className="text-[#10D97A]">i</span>N
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2.5 py-2 space-y-0 overflow-y-auto scrollbar-hide">
          {/* Main section */}
          <SidebarSection label="Navigation" defaultOpen={true}>
            <NavItem icon={MessageSquare} label="Chat" onClick={() => router.push("/employer/chat")} active={path === "/employer/chat"} />
            <NavItem icon={BarChart3} label="Dashboard" onClick={() => router.push("/employer")} active={path === "/employer"} />
            <NavItem icon={Plus} label="New Role" onClick={() => router.push("/employer/intake")} active={path === "/employer/intake"} />
            <NavItem icon={Activity} label="Activity" onClick={() => router.push("/employer")} active={false} />
          </SidebarSection>

          {/* Back item when inside a sub-page */}
          {backTo && (
            <SidebarSection label="Context" defaultOpen={true}>
              <NavItem icon={ArrowLeft} label={backTo.label} onClick={() => router.push(backTo.href)} active={false} />
            </SidebarSection>
          )}

          {/* Extra items injected per page */}
          {extraNavItems.length > 0 && (
            <SidebarSection label="Section" defaultOpen={true}>
              {extraNavItems.map((item, i) => (
                <NavItem
                  key={i}
                  icon={item.icon}
                  label={item.label}
                  onClick={item.action}
                  active={item.active}
                  indent={item.indent}
                />
              ))}
            </SidebarSection>
          )}

          {/* Manage */}
          <SidebarSection label="Manage" defaultOpen={true}>
            <NavItem icon={Link2} label="Integrations" onClick={() => router.push("/employer/integrations")} active={path === "/employer/integrations"} />
            <NavItem icon={User} label="Profile" onClick={() => router.push("/employer/profile")} active={path === "/employer/profile"} />
          </SidebarSection>
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.05] shrink-0 space-y-2">
          <StatusDot />
          <button
            onClick={logout}
            className="text-[10px] text-white/20 hover:text-white/50 transition-colors"
            data-testid="logout-btn"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div className="px-6 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div>
            {pageTitle && (
              <h1 className="text-[13px] font-semibold text-white/80">{pageTitle}</h1>
            )}
            {pageSubtitle && (
              <p className="text-[10px] text-white/28 mt-0.5">{pageSubtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">{topBar}</div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {children}
        </div>
      </main>

      {/* ── RIGHT PANEL ──────────────────────────────────── */}
      {showRightPanel && (
        <aside className="w-[216px] shrink-0 border-l border-white/[0.06] bg-[#0b0b0b] flex flex-col">
          <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
            <p className="text-[11px] font-semibold text-white/45 tracking-wide">{rightPanelTitle}</p>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {rightPanel ?? (
              <div className="px-4 py-4">
                <p className="text-[11px] text-white/18">No tasks running</p>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
