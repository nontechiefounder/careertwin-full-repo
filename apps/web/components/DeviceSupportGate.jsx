"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { CTLogo } from "@/components/NaiveShell";
import {
  buildSafeDestination,
  evaluateDeviceSupport,
} from "@/lib/deviceSupport";
import {
  Monitor,
  Maximize2,
  ArrowLeft,
  LogOut,
  Copy,
  Check,
} from "lucide-react";

const PENDING_DESTINATION_KEY = "wbl_pending_destination";
const SERVER_SNAPSHOT = "server";

function subscribeDeviceEnv(callback) {
  if (typeof window === "undefined") return () => { };
  window.addEventListener("resize", callback);
  window.addEventListener("orientationchange", callback);
  const coarseMql = window.matchMedia?.("(pointer: coarse)");
  coarseMql?.addEventListener?.("change", callback);
  return () => {
    window.removeEventListener("resize", callback);
    window.removeEventListener("orientationchange", callback);
    coarseMql?.removeEventListener?.("change", callback);
  };
}

function getClientDeviceSnapshot() {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  let freshFlag = false;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    freshFlag =
      sessionStorage.getItem("isFreshSignUp") === "true" ||
      searchParams.get("onboarding") === "1";
  } catch {
    freshFlag = false;
  }
  return JSON.stringify({
    evalRes: evaluateDeviceSupport(),
    dest: buildSafeDestination(
      window.location.pathname,
      window.location.search,
      "/employer"
    ),
    isOnboarding: Boolean(freshFlag),
  });
}

function getServerDeviceSnapshot() {
  return SERVER_SNAPSHOT;
}

export default function DeviceSupportGate({ children }) {
  const { user, logout } = useAuth();
  const snapshotRaw = useSyncExternalStore(
    subscribeDeviceEnv,
    getClientDeviceSnapshot,
    getServerDeviceSnapshot
  );
  const [hasRenderedSupported, setHasRenderedSupported] = useState(false);
  const [copied, setCopied] = useState(false);

  const parsed =
    snapshotRaw === SERVER_SNAPSHOT
      ? {
        evalRes: {
          supported: null,
          reason: "pending",
          isPhone: false,
          isIpad: false,
          deviceType: "unknown",
          viewportWidth: 0,
          viewportHeight: 0,
          minWidth: 768,
        },
        dest: "/employer",
        isOnboarding: false,
      }
      : JSON.parse(snapshotRaw);

  const support = parsed.evalRes;
  const intendedDestination = parsed.dest;
  const isOnboarding = parsed.isOnboarding;

  if (support.supported === true && !hasRenderedSupported) {
    setHasRenderedSupported(true);
  }

  useEffect(() => {
    if (snapshotRaw === SERVER_SNAPSHOT || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(PENDING_DESTINATION_KEY, intendedDestination);
    } catch {
      // Ignore storage access errors in restricted environments
    }
  }, [snapshotRaw, intendedDestination, user?.id]);

  const handleCopyDestination = async () => {
    if (typeof window === "undefined") return;
    const shareUrl = `${window.location.origin}${intendedDestination}`;
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleSignOut = async () => {
    try {
      sessionStorage.removeItem("isFreshSignUp");
    } catch {
      // Ignore
    }
    await logout();
  };

  if (support.supported === null) {
    return (
      <div
        className="min-h-screen bg-[#030303] flex items-center justify-center"
        data-testid="device-support-checking"
      >
        <div className="text-white/50 text-xs font-mono">Checking display...</div>
      </div>
    );
  }

  const isBlocked = support.supported === false;
  const isPhoneReason = support.reason === "phone";

  const headingText = isPhoneReason
    ? "Continue on a larger screen"
    : "Make this window wider";

  const messageText = isPhoneReason
    ? isOnboarding
      ? "Your account is ready. To use the workBYLiNE workspace, open it on a desktop, laptop, Mac or iPad."
      : "You’re signed in. To use the workBYLiNE workspace, open it on a desktop, laptop, Mac or iPad."
    : support.reason === "narrow-ipad"
      ? "Your iPad window is currently narrower than 768px. Open workBYLiNE full-screen or widen the Split View pane to continue."
      : "Your browser window is narrower than 768px. Widen the window to at least 768px to use the workBYLiNE workspace.";

  return (
    <>
      {hasRenderedSupported && (
        <div
          style={isBlocked ? { display: "none" } : undefined}
          aria-hidden={isBlocked ? "true" : undefined}
          data-testid="device-support-workspace-container"
        >
          {children}
        </div>
      )}

      {isBlocked && (
        <main
          className="min-h-screen w-full bg-[#030303] text-white flex items-center justify-center px-5 py-8"
          data-testid="device-support-screen"
          data-device-reason={support.reason}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/[0.10] bg-[#141414] p-6 sm:p-7 shadow-2xl space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CTLogo size="sm" />
                <span className="text-[15px] font-semibold tracking-tight text-white/95">
                  work<span className="text-[#00D604] font-bold">BYLiNE</span>
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl border border-[#00D604]/25 bg-[#00D604]/10 flex items-center justify-center text-[#00D604] shrink-0">
                {isPhoneReason ? (
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              <h1
                className="text-xl font-semibold tracking-tight text-white"
                data-testid="device-support-heading"
              >
                {headingText}
              </h1>
              <p
                className="text-sm text-white/75 leading-relaxed"
                data-testid="device-support-message"
              >
                {messageText}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0b0b0b] p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                  Saved workspace destination
                </span>
                <button
                  type="button"
                  onClick={handleCopyDestination}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#00D604] hover:underline focus-visible:outline-2 focus-visible:outline-[#00D604] rounded"
                  data-testid="device-support-copy-link-btn"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" aria-hidden="true" />
                      <span>Copy link</span>
                    </>
                  )}
                </button>
              </div>
              <p
                className="text-xs font-mono text-white/85 break-all"
                data-testid="device-support-destination"
              >
                {intendedDestination}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
              <Link
                href="/"
                className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-white text-black text-xs font-semibold hover:bg-white/90 transition-colors focus-visible:outline-2 focus-visible:outline-[#00D604]"
                data-testid="device-support-back-btn"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Back to website</span>
              </Link>

              {user ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-white/[0.14] bg-white/[0.04] text-xs font-medium text-white/90 hover:bg-white/[0.08] transition-colors focus-visible:outline-2 focus-visible:outline-[#00D604]"
                  data-testid="device-support-signout-btn"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              ) : (
                <Link
                  href={`/auth?redirect_to=${encodeURIComponent(intendedDestination)}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-white/[0.14] bg-white/[0.04] text-xs font-medium text-white/90 hover:bg-white/[0.08] transition-colors focus-visible:outline-2 focus-visible:outline-[#00D604]"
                  data-testid="device-support-signin-btn"
                >
                  <span>Sign in</span>
                </Link>
              )}
            </div>
          </div>
        </main>
      )}
    </>
  );
}
