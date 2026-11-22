"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  LayoutGrid,
  CheckSquare,
  Users,
  UserPlus,
  Calendar,
  Settings,
  Bell,
  PanelLeft,
  Check,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  MessageSquare,
  User,
  Link2,
  Sparkles,
  Search,
  Sun,
  Moon,
  Command,
  ShieldCheck,
  X,
  ArrowUpRight,
  MoreHorizontal,
  Home,
} from "lucide-react";

// ── Brand Mark ────────────────────────────────────────────────────
export function CTLogo({ size = "sm" }) {
  const s = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  return (
    <div className={`${s} flex items-center justify-center shrink-0`}>
      <img
        src="/logo-icon.svg"
        alt="workBYLiNE Logo"
        className="w-full h-full object-contain"
      />
    </div>
  );
}

// ── Sidebar Nav Item ──────────────────────────────────────────────
function NavItem({
  icon: Icon,
  label,
  onClick,
  active,
  indent,
  badge,
  hasSubmenu,
  submenuOpen,
  collapsed,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`nav-item ${active ? "nav-item-active" : "nav-item-default"} ${indent ? "pl-7 text-[11.5px]" : ""
        } ${collapsed ? "justify-center !px-0" : ""}`}
    >
      {active && (
        <span
          className="w-1 h-3.5 rounded-full bg-[#00D604] absolute left-1 top-1/2 -translate-y-1/2 shadow-[0_0_6px_rgba(0,214,4,0.65)]"
          aria-hidden="true"
        />
      )}
      {Icon && (
        <Icon
          className="h-3.5 w-3.5 shrink-0"
          style={{
            color: active ? "var(--nav-selected-fg)" : "var(--wbl-text-muted)",
          }}
        />
      )}
      {!collapsed && (
        <>
          <span className="truncate flex-1 text-left">{label}</span>
          {badge && (
            <span
              className="px-1.5 py-0.2 rounded-md text-[9px] font-mono border"
              style={{
                backgroundColor: "var(--wbl-emerald-soft)",
                color: "var(--wbl-emerald-text)",
                borderColor: "var(--wbl-emerald-border)",
              }}
            >
              {badge}
            </span>
          )}
          {hasSubmenu && (
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${submenuOpen ? "rotate-90" : ""
                }`}
              style={{ color: "var(--wbl-text-muted)" }}
            />
          )}
        </>
      )}
    </button>
  );
}

// ── Collapsible Sidebar Section ────────────────────────────────────
function SidebarSection({ label, children, defaultOpen = true, collapsed = false }) {
  if (collapsed) {
    return <div className="space-y-1 py-1">{children}</div>;
  }
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between px-2.5 py-1.5 group">
        <span
          className="text-[11px] font-medium tracking-tight"
          style={{ color: "var(--wbl-text-muted)" }}
        >
          {label}
        </span>
        <ChevronDown
          className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-transform duration-200 [.collapsible-open_&]:rotate-180 [[data-state=open]_&]:rotate-180"
          style={{ color: "var(--wbl-text-muted)" }}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5 pb-1.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function NaiveShell({
  pageTitle,
  pageSubtitle,
  topBar,
  extraNavItems = [],
  rightPanel,
  rightPanelTitle = "Active Tasks",
  showRightPanel = false,
  backTo,
  goBack,
  children,
}) {
  const router = useRouter();
  const path = usePathname();
  const { user, logout } = useAuth();
  const [routeLoading, setRouteLoading] = useState(false);
  const [themePolarity, setThemePolarity] = useState("dark");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Expandable sidebar submenus (People >, Time >, Settings >)
  const [openMenus, setOpenMenus] = useState({
    people: false,
    time: false,
    settings: false,
  });
  const [activeSubTab, setActiveSubTab] = useState(null);

  // Notifications Popover state (empty unless wired to real notifications)
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);

  // User footer menu
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const unreadCount = notifications.filter((n) => n.unread).length;

  // Initialize and sync Dark Theme (default) vs. White Theme
  useEffect(() => {
    let cancelled = false;
    try {
      const saved = localStorage.getItem("wbl_theme_polarity");
      if (saved === "whiter") {
        document.documentElement.classList.add("theme-whiter");
        Promise.resolve().then(() => { if (!cancelled) setThemePolarity("whiter"); });
      } else {
        document.documentElement.classList.remove("theme-whiter");
        Promise.resolve().then(() => { if (!cancelled) setThemePolarity("dark"); });
      }
    } catch {
      // Ignore storage access errors
    }
    return () => { cancelled = true; };
  }, []);

  const toggleThemePolarity = () => {
    const next = themePolarity === "dark" ? "whiter" : "dark";
    setThemePolarity(next);
    try {
      localStorage.setItem("wbl_theme_polarity", next);
    } catch {
      // Ignore storage errors
    }
    if (typeof document !== "undefined") {
      if (next === "whiter") {
        document.documentElement.classList.add("theme-whiter");
      } else {
        document.documentElement.classList.remove("theme-whiter");
      }
    }
  };

  // Close Notifications popover on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handleOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [notifOpen]);

  // Keyboard shortcut ⌘K / Ctrl+K for Quick Search
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Top route loader bar on pathname transitions
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) setRouteLoading(true); });
    const t = setTimeout(() => { if (!cancelled) setRouteLoading(false); }, 360);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [path]);

  // Preserve active candidate packet ID if user clicks "Chat" directly while viewing /employer/packet/[extractionId]
  const handleNavigateChat = () => {
    if (typeof path === "string" && path.startsWith("/employer/packet/")) {
      const packetId = path
        .split("/employer/packet/")[1]
        ?.split("/")[0]
        ?.split("?")[0];
      if (packetId) {
        router.push(`/employer/chat?candidate_id=${packetId}`);
        return;
      }
    }
    try {
      const lastRaw = sessionStorage.getItem("wbl_last_viewed_packet");
      if (lastRaw) {
        const parsed = JSON.parse(lastRaw);
        if (parsed?.extractionId) {
          const qs = new URLSearchParams();
          qs.set("candidate_id", parsed.extractionId);
          if (parsed.roleId) qs.set("roleId", parsed.roleId);
          router.push(`/employer/chat?${qs.toString()}`);
          return;
        }
      }
    } catch {
      // Ignore storage parse errors
    }
    router.push("/employer/chat");
  };

  const toggleSubmenu = (key) => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
    setOpenMenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleNotificationAction = (id, actionLabel) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id
          ? {
            ...n,
            unread: false,
            status:
              actionLabel === "Approve"
                ? "Approved ✓"
                : actionLabel === "Verify"
                  ? "Verified ✓"
                  : actionLabel === "Reject"
                    ? "Rejected"
                    : "Reviewed",
          }
          : n
      )
    );
    if (actionLabel === "Review") {
      setNotifOpen(false);
      router.push("/employer");
    }
  };

  const quickJumpItems = [
    {
      title: "Workforce & Hiring Overview",
      subtitle: "Dashboard · KPI Sparklines, Calendar & Active Roles",
      action: () => router.push("/employer"),
    },
    {
      title: "AI Hiring Assistant & Generative UI",
      subtitle: "Grounded Candidate Packet Q&A · Context Compactor",
      action: handleNavigateChat,
    },
    {
      title: "Create New Hiring Role & Proof Contract",
      subtitle: "Role Setup · Must-Haves, Nice-to-Haves & Disqualifiers",
      action: () => router.push("/employer/intake"),
    },
    {
      title: "ATS & Evidence Integrations",
      subtitle: "Connect Greenhouse, Lever, GitHub & Resume Pipes",
      action: () => router.push("/employer/integrations"),
    },
    {
      title: "Organization & Reviewer Profile",
      subtitle: "Audit Governance & Workspace Preferences",
      action: () => router.push("/employer/profile"),
    },
  ].filter(
    (item) =>
      !searchQuery.trim() ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayUserName =
    user?.full_name ||
    (user?.email ? user.email.split("@")[0] : "Bruno Duarte");

  return (
    <div
      className="wbl-app-shell h-screen flex overflow-hidden relative"
      style={{
        fontFamily: "var(--font-sans)",
        backgroundColor: "var(--wbl-shell-bg)",
        color: "var(--wbl-text-main)",
      }}
    >
      {/* ── TOP PAGE LOADER BAR ────────────────── */}
      {routeLoading && (
        <div
          className="fixed top-0 left-0 right-0 h-[2.5px] z-[100] wbl-loader-bar pointer-events-none"
          data-testid="page-loader"
        />
      )}

      {/* ── LEFT SIDEBAR (Charcoal #181818 in Dark | Light Grey #F0F0F0 in White) ───────────── */}
      <aside
        className={`${sidebarCollapsed ? "w-[62px]" : "w-[232px]"
          } shrink-0 flex flex-col overflow-visible px-2.5 py-2.5 gap-2 transition-all duration-200 relative z-30`}
        style={{ backgroundColor: "var(--wbl-shell-bg)" }}
      >
        {/* Top Brand Row + Notification Bell + Sidebar Collapse Toggle */}
        <div
          className="px-1.5 py-1.5 flex items-center justify-between gap-1.5 shrink-0 relative"
          ref={notifRef}
        >
          <button
            type="button"
            onClick={() => {
              setActiveSubTab(null);
              router.push("/employer");
            }}
            className="flex items-center gap-2.5 min-w-0 text-left group"
          >
            <CTLogo />
            {!sidebarCollapsed && (
              <div className="min-w-0 flex items-center gap-1.5">
                <span
                  className="text-[14px] font-semibold tracking-tight truncate"
                  style={{ color: "var(--wbl-text-main)" }}
                >
                  work
                  <span
                    className="font-bold"
                    style={{ color: "var(--wbl-emerald-text)" }}
                  >
                    BYLiNE
                  </span>
                </span>
              </div>
            )}
          </button>

          {!sidebarCollapsed && (
            <div className="flex items-center gap-1 shrink-0">
              {/* Notification Bell Button with Unread Indicator */}
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                data-testid="notifications-btn"
                title="Notifications"
                style={{
                  color: notifOpen
                    ? "var(--wbl-text-main)"
                    : "var(--wbl-text-muted)",
                  backgroundColor: notifOpen
                    ? "var(--wbl-hover-bg)"
                    : "transparent",
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center relative hover:opacity-100 transition-all"
              >
                <Bell className="h-3.5 w-3.5" />
                {unreadCount > 0 && (
                  <span
                    className="w-1.5 h-1.5 rounded-full absolute top-1.5 right-1.5"
                    style={{
                      backgroundColor: "var(--wbl-text-main)",
                      boxShadow: "0 0 0 2px var(--wbl-shell-bg)",
                    }}
                  />
                )}
              </button>

              {/* Sidebar Collapse Toggle Button */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                data-testid="sidebar-collapse-btn"
                title="Toggle Sidebar"
                style={{ color: "var(--wbl-text-muted)" }}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-100 transition-all"
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ── NOTIFICATIONS POPOVER (`Notifications 3`) ── */}
          {notifOpen && (
            <div
              data-testid="notifications-popover"
              className="absolute left-[110px] top-10 w-[316px] rounded-xl border shadow-2xl z-[140] overflow-hidden animate-fade-in"
              style={{
                backgroundColor: "var(--wbl-panel-bg)",
                borderColor: "var(--wbl-border-strong)",
                boxShadow: "0 20px 50px rgba(0, 0, 0, 0.55)",
              }}
            >
              {/* Popover Header */}
              <div
                className="px-3.5 py-2.5 border-b flex items-center justify-between"
                style={{ borderColor: "var(--wbl-frame-border)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--wbl-text-main)" }}
                  >
                    Notifications
                  </span>
                  <span
                    className="h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center"
                    style={{
                      backgroundColor: "var(--wbl-primary-bg)",
                      color: "var(--wbl-primary-fg)",
                    }}
                  >
                    {unreadCount}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  title="Mark all as read"
                  style={{ color: "var(--wbl-text-muted)" }}
                  className="p-1 rounded-md hover:opacity-100 transition-opacity"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Notification Items */}
              <div
                className="divide-y max-h-[370px] overflow-y-auto"
                style={{ borderColor: "var(--wbl-frame-border)" }}
              >
                {notifications.length === 0 ? (
                  <div
                    className="p-4 text-center text-[11.5px]"
                    style={{ color: "var(--wbl-text-muted)" }}
                  >
                    No active notifications.
                  </div>
                ) : notifications.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 flex items-start gap-2.5 transition-colors"
                    style={{
                      borderColor: "var(--wbl-frame-border)",
                    }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5 shadow-xs"
                      style={{ background: item.avatarBg }}
                    >
                      {item.initials}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className="text-[12px] font-semibold truncate"
                          style={{ color: "var(--wbl-text-main)" }}
                        >
                          {item.title}
                        </p>
                        {item.unread && (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: "var(--wbl-text-main)" }}
                          />
                        )}
                      </div>

                      <p
                        className="text-[11px] leading-relaxed mt-0.5"
                        style={{ color: "var(--wbl-text-muted)" }}
                      >
                        {item.body}
                      </p>

                      {/* Action Buttons (`Approve` / `Review`, `Verify` / `Reject`) */}
                      {item.status ? (
                        <div className="mt-2">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border"
                            style={{
                              backgroundColor: "var(--wbl-emerald-soft)",
                              color: "var(--wbl-emerald-text)",
                              borderColor: "var(--wbl-emerald-border)",
                            }}
                          >
                            {item.status}
                          </span>
                        </div>
                      ) : (
                        (item.primaryAction || item.secondaryAction) && (
                          <div className="flex items-center gap-1.5 mt-2.5">
                            {item.primaryAction && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleNotificationAction(
                                    item.id,
                                    item.primaryAction
                                  )
                                }
                                style={{
                                  backgroundColor: "var(--wbl-primary-bg)",
                                  color: "var(--wbl-primary-fg)",
                                }}
                                className="px-2.5 py-1 rounded-md text-[11px] font-semibold hover:opacity-90 transition-opacity"
                              >
                                {item.primaryAction}
                              </button>
                            )}
                            {item.secondaryAction && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleNotificationAction(
                                    item.id,
                                    item.secondaryAction
                                  )
                                }
                                style={{
                                  backgroundColor: "var(--wbl-input-bg)",
                                  borderColor: "var(--wbl-frame-border)",
                                  color: "var(--wbl-text-main)",
                                }}
                                className="px-2.5 py-1 rounded-md text-[11px] font-medium border hover:opacity-90 transition-opacity"
                              >
                                {item.secondaryAction}
                              </button>
                            )}
                          </div>
                        )
                      )}

                      {/* Meta Row (`12m ago · Deadline Tomorrow`) */}
                      {(item.time || item.deadline) && (
                        <div className="flex items-center gap-2 mt-2 text-[10px]">
                          <span style={{ color: "var(--wbl-text-muted)" }}>
                            {item.time}
                          </span>
                          {item.deadline && (
                            <>
                              <span style={{ color: "var(--wbl-text-muted)" }}>
                                Deadline
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 font-medium">
                                {item.deadline}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Popover Footer (`Go to approvals`) */}
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(false);
                  setActiveSubTab("approvals");
                  router.push("/employer");
                }}
                style={{
                  borderColor: "var(--wbl-frame-border)",
                  color: "var(--wbl-text-main)",
                  backgroundColor: "var(--wbl-input-bg)",
                }}
                className="w-full py-2 text-center text-[11.5px] font-medium border-t hover:opacity-90 transition-opacity"
              >
                Go to approvals
              </button>
            </div>
          )}
        </div>

        {/* When sidebar is collapsed, show expand button */}
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            style={{
              backgroundColor: "var(--wbl-input-bg)",
              borderColor: "var(--wbl-frame-border)",
              color: "var(--wbl-text-main)",
            }}
            className="w-9 h-8 mx-auto rounded-lg border flex items-center justify-center"
            title="Expand Sidebar"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Sidebar Search Trigger (`🔍 Search... ⌘K`) */}
        {!sidebarCollapsed && (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            data-testid="sidebar-search-btn"
            style={{
              backgroundColor: "var(--wbl-input-bg)",
              borderColor: "var(--wbl-frame-border)",
              color: "var(--wbl-text-muted)",
            }}
            className="w-full h-8 px-2.5 rounded-lg border hover:border-[#484848] flex items-center justify-between text-[11.5px] transition-all shrink-0"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="h-3.5 w-3.5 opacity-75 shrink-0" />
              <span className="truncate">Search...</span>
            </span>
            <kbd
              className="px-1.5 py-0.5 rounded border text-[9px] font-mono"
              style={{
                backgroundColor: "var(--wbl-panel-bg)",
                borderColor: "var(--wbl-frame-border)",
                color: "var(--wbl-text-muted)",
              }}
            >
              ⌘K
            </kbd>
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-0.5 py-0.5 space-y-2 overflow-y-auto scrollbar-hide">
          <SidebarSection
            label="Workspace"
            defaultOpen={true}
            collapsed={sidebarCollapsed}
          >
            {/* Dashboard */}
            <NavItem
              icon={LayoutGrid}
              label="Dashboard"
              collapsed={sidebarCollapsed}
              onClick={() => {
                setActiveSubTab(null);
                router.push("/employer");
              }}
              active={path === "/employer" && !activeSubTab}
            />

            {/* Approvals */}
            <NavItem
              icon={CheckSquare}
              label="Approvals"
              collapsed={sidebarCollapsed}
              badge={unreadCount > 0 ? String(unreadCount) : undefined}
              onClick={() => {
                setActiveSubTab("approvals");
                if (path !== "/employer") {
                  router.push("/employer");
                } else if (typeof document !== "undefined") {
                  const el = document.getElementById("roles-directory-card");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }
              }}
              active={activeSubTab === "approvals"}
            />

            {/* People (Expandable >) */}
            <NavItem
              icon={Users}
              label="People"
              collapsed={sidebarCollapsed}
              hasSubmenu={true}
              submenuOpen={openMenus.people}
              onClick={() => toggleSubmenu("people")}
              active={
                typeof path === "string" &&
                (path.startsWith("/employer/shortlist") ||
                  path.startsWith("/employer/packet"))
              }
            />
            {openMenus.people && !sidebarCollapsed && (
              <div className="space-y-0.5 py-0.5">
                <NavItem
                  label="Candidate Directory"
                  indent={true}
                  onClick={() => {
                    setActiveSubTab("directory");
                    if (path !== "/employer") {
                      router.push("/employer");
                    } else if (typeof document !== "undefined") {
                      const el = document.getElementById(
                        "roles-directory-card"
                      );
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  active={activeSubTab === "directory"}
                />
                <NavItem
                  label="AI Copilot"
                  indent={true}
                  onClick={handleNavigateChat}
                  active={path === "/employer/chat"}
                />
              </div>
            )}

            {/* Hiring */}
            <NavItem
              icon={UserPlus}
              label="Hiring"
              collapsed={sidebarCollapsed}
              onClick={() => router.push("/employer/intake")}
              active={
                path === "/employer/intake" ||
                (typeof path === "string" &&
                  (path.startsWith("/employer/brief") ||
                    path.startsWith("/employer/sourcing")))
              }
            />

            {/* AI Chat (Direct 1-Click Item) */}
            <NavItem
              icon={MessageSquare}
              label="Chat"
              badge="AI"
              collapsed={sidebarCollapsed}
              onClick={handleNavigateChat}
              active={path === "/employer/chat"}
            />

            {/* Time (Expandable >) */}
            <NavItem
              icon={Calendar}
              label="Time"
              collapsed={sidebarCollapsed}
              hasSubmenu={true}
              submenuOpen={openMenus.time}
              onClick={() => toggleSubmenu("time")}
              active={activeSubTab === "calendar" || activeSubTab === "reviews"}
            />
            {openMenus.time && !sidebarCollapsed && (
              <div className="space-y-0.5 py-0.5">
                <NavItem
                  label="July 2026 Schedule"
                  indent={true}
                  onClick={() => {
                    setActiveSubTab("calendar");
                    if (path !== "/employer") {
                      router.push("/employer");
                    } else if (typeof document !== "undefined") {
                      const el = document.getElementById("schedule-calendar-card");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  active={activeSubTab === "calendar"}
                />
                <NavItem
                  label="H2 Review Cycle"
                  indent={true}
                  onClick={() => {
                    setActiveSubTab("reviews");
                    if (path !== "/employer") {
                      router.push("/employer");
                    } else if (typeof document !== "undefined") {
                      const el = document.getElementById("review-cycle-card");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  active={activeSubTab === "reviews"}
                />
              </div>
            )}

            {/* Settings (Expandable >) */}
            <NavItem
              icon={Settings}
              label="Settings"
              collapsed={sidebarCollapsed}
              hasSubmenu={true}
              submenuOpen={openMenus.settings}
              onClick={() => toggleSubmenu("settings")}
              active={
                path === "/employer/integrations" ||
                path === "/employer/profile"
              }
            />
            {openMenus.settings && !sidebarCollapsed && (
              <div className="space-y-0.5 py-0.5">
                <NavItem
                  icon={Link2}
                  label="ATS Integrations"
                  indent={true}
                  onClick={() => router.push("/employer/integrations")}
                  active={path === "/employer/integrations"}
                />
                <NavItem
                  icon={User}
                  label="Reviewer Profile"
                  indent={true}
                  onClick={() => router.push("/employer/profile")}
                  active={path === "/employer/profile"}
                />
                <NavItem
                  icon={themePolarity === "dark" ? Sun : Moon}
                  label={
                    themePolarity === "dark"
                      ? "Switch to White Theme"
                      : "Switch to Dark Theme"
                  }
                  indent={true}
                  onClick={toggleThemePolarity}
                  active={false}
                />
              </div>
            )}
          </SidebarSection>

          {/* Back item when inside a sub-page */}
          {backTo && (
            <SidebarSection
              label="Context"
              defaultOpen={true}
              collapsed={sidebarCollapsed}
            >
              <NavItem
                icon={ArrowLeft}
                label={backTo.label}
                collapsed={sidebarCollapsed}
                onClick={() => router.push(backTo.href)}
                active={false}
              />
            </SidebarSection>
          )}

          {/* Extra items injected per page */}
          {extraNavItems.length > 0 && (
            <SidebarSection
              label="Role Workflow"
              defaultOpen={true}
              collapsed={sidebarCollapsed}
            >
              {extraNavItems.map((item, i) => (
                <NavItem
                  key={i}
                  icon={item.icon}
                  label={item.label}
                  collapsed={sidebarCollapsed}
                  onClick={item.action}
                  active={item.active}
                  indent={item.indent}
                />
              ))}
            </SidebarSection>
          )}
        </nav>

        {/* User Footer Bar */}
        <div className="pt-1 px-1 flex items-center justify-between gap-2 shrink-0 relative">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold border"
                style={{
                  backgroundColor: "var(--wbl-panel-bg)",
                  borderColor: "var(--wbl-frame-border)",
                  color: "var(--wbl-text-main)",
                }}
              >
                {displayUserName.slice(0, 2).toUpperCase()}
              </div>
              <span
                className="w-2 h-2 rounded-full bg-[#00D604] absolute -bottom-0.5 -right-0.5"
                style={{ boxShadow: "0 0 0 2px var(--wbl-shell-bg)" }}
              />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p
                  className="text-[12px] font-semibold leading-tight truncate"
                  style={{ color: "var(--wbl-text-main)" }}
                >
                  {displayUserName}
                </p>
                <p
                  className="text-[10px] truncate flex items-center gap-1"
                  style={{ color: "var(--wbl-text-muted)" }}
                >
                  <span>workBYLiNE</span>
                </p>
              </div>
            )}
          </div>

          {!sidebarCollapsed && (
            <div className="flex items-center gap-1 shrink-0">
              {/* 1-Click Theme Polarity Switcher (Dark <-> White) */}
              <button
                type="button"
                onClick={toggleThemePolarity}
                data-testid="theme-polarity-toggle"
                title={
                  themePolarity === "dark"
                    ? "Switch to White Theme"
                    : "Switch to Dark Theme"
                }
                style={{
                  backgroundColor: "var(--wbl-input-bg)",
                  borderColor: "var(--wbl-frame-border)",
                  color: "var(--wbl-text-main)",
                }}
                className="h-6 px-1.5 rounded-md border flex items-center gap-1 text-[10px] font-mono hover:opacity-90 transition-all"
              >
                {themePolarity === "dark" ? (
                  <>
                    <Sun className="h-2.5 w-2.5 text-[#00D604]" />
                    <span>White</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-2.5 w-2.5 text-[#087A0B]" />
                    <span>Dark</span>
                  </>
                )}
              </button>

              {/* Sign out / More Menu */}
              <button
                type="button"
                onClick={logout}
                data-testid="logout-btn"
                title="Sign out"
                style={{ color: "var(--wbl-text-muted)" }}
                className="px-1.5 py-1 rounded-md text-[10px] font-medium hover:opacity-100 transition-opacity"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN INSET WORKSPACE FRAME (OG Brand Black #030303 in Dark | Soft White #FAFAFA in White) ──────── */}
      <div
        className="flex-1 flex overflow-hidden min-w-0 my-2 mr-2 rounded-2xl border shadow-[0_0_40px_rgba(0,0,0,0.45)]"
        style={{
          backgroundColor: "var(--wbl-canvas-bg)",
          borderColor: "var(--wbl-frame-border)",
        }}
      >
        {/* MAIN CONTENT */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top Breadcrumb & Action Bar (`⌂ People – Dashboard`) */}
          <div
            className="px-6 py-2.5 border-b backdrop-blur-md flex items-center justify-between shrink-0 gap-4"
            style={{
              backgroundColor: "var(--wbl-header-bg)",
              borderColor: "var(--wbl-frame-border)",
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {goBack ? (
                <button
                  type="button"
                  onClick={() => router.push(goBack)}
                  style={{
                    backgroundColor: "var(--wbl-input-bg)",
                    borderColor: "var(--wbl-frame-border)",
                    color: "var(--wbl-text-main)",
                  }}
                  className="w-7 h-7 rounded-lg border flex items-center justify-center transition-all shrink-0 hover:opacity-90"
                  title="Go Back"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              ) : (
                <Home
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: "var(--wbl-text-muted)" }}
                />
              )}

              <div className="flex items-center gap-1.5 min-w-0 text-[13px]">
                <span
                  className="truncate hidden sm:inline"
                  style={{ color: "var(--wbl-text-muted)" }}
                >
                  People
                </span>
                <span
                  className="hidden sm:inline"
                  style={{ color: "var(--wbl-text-muted)" }}
                >
                  –
                </span>
                {pageTitle && (
                  <span
                    className="font-semibold tracking-tight truncate"
                    style={{ color: "var(--wbl-text-main)" }}
                  >
                    {pageTitle}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">{topBar}</div>
          </div>

          {/* Page content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide animate-fade-in">
            {children}
          </div>
        </main>

        {/* OPTIONAL RIGHT PANEL */}
        {showRightPanel && (
          <aside
            className="w-[252px] shrink-0 border-l flex flex-col"
            style={{
              backgroundColor: "var(--wbl-shell-bg)",
              borderColor: "var(--wbl-frame-border)",
            }}
          >
            <div
              className="px-4 py-3 border-b shrink-0 flex items-center justify-between"
              style={{ borderColor: "var(--wbl-frame-border)" }}
            >
              <p
                className="text-[11px] font-semibold tracking-wide"
                style={{ color: "var(--wbl-text-main)" }}
              >
                {rightPanelTitle}
              </p>
              <Sparkles className="h-3 w-3 text-[#00D604]" />
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {rightPanel ?? (
                <div className="px-4 py-4">
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--wbl-text-muted)" }}
                  >
                    No tasks running
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ── QUICK SEARCH COMMAND DIALOG (⌘K) ───── */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-[150] bg-black/65 backdrop-blur-xs flex items-start justify-center pt-24 px-4"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="wbl-frame w-full max-w-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wbl-frame-panel !p-0 overflow-hidden">
              <div
                className="flex items-center gap-2.5 px-3.5 py-2.5 border-b"
                style={{ borderColor: "var(--wbl-frame-border)" }}
              >
                <Command className="h-4 w-4 text-[#00D604] shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Jump to role, candidate packet, or AI Hiring Assistant..."
                  style={{ color: "var(--wbl-text-main)" }}
                  className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#8D8D8D]"
                />
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  style={{ color: "var(--wbl-text-muted)" }}
                  className="p-1 rounded hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div
                className="divide-y max-h-72 overflow-y-auto"
                style={{ borderColor: "var(--wbl-frame-border)" }}
              >
                {quickJumpItems.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      item.action();
                    }}
                    className="w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:opacity-90 text-left transition-colors"
                    style={{ borderColor: "var(--wbl-frame-border)" }}
                  >
                    <div className="min-w-0">
                      <p
                        className="text-[12px] font-medium truncate"
                        style={{ color: "var(--wbl-text-main)" }}
                      >
                        {item.title}
                      </p>
                      <p
                        className="text-[10px] truncate"
                        style={{ color: "var(--wbl-text-muted)" }}
                      >
                        {item.subtitle}
                      </p>
                    </div>
                    <ArrowUpRight
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: "var(--wbl-text-muted)" }}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div
              className="px-3 py-1 flex items-center justify-between text-[10px] font-mono"
              style={{ color: "var(--wbl-text-muted)" }}
            >
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-[#00D604]" />
                Org-Scoped Workspace Navigation
              </span>
              <span>ESC to close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
