"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { 
  User, Mail, Building2, Shield, 
  ExternalLink, CheckCircle2, AlertCircle,
  Loader2, Key
} from "lucide-react";
import NaiveShell from "@/components/NaiveShell";

function GmailLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M24 4.5v15c0 .85-.65 1.5-1.5 1.5H21V7.39l-9 6.58-9-6.58V21H1.5C.65 21 0 20.35 0 19.5v-15c0-1.17 1.38-1.75 2.21-.97L12 10.3l9.79-7.77c.83-.78 2.21-.2 2.21.97z" fill="#EA4335" />
    </svg>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isGmailConnected, setIsGmailConnected] = useState(false);

  const handleConnectGmail = () => {
    setIsConnecting(true);
    // Simulate OAuth flow
    setTimeout(() => {
      setIsConnecting(false);
      setIsGmailConnected(true);
      toast.success("Gmail account connected successfully!");
    }, 2000);
  };

  const handleDisconnectGmail = () => {
    setIsGmailConnected(false);
    toast.info("Gmail account disconnected.");
  };

  const rightPanel = (
    <div className="px-4 py-4 space-y-6">
      <div>
        <p className="mono-label mb-2">SECURITY STATUS</p>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-4 w-4 text-green-400" />
          <p className="text-[14px] font-mono font-semibold text-white/75">Verified</p>
        </div>
        <p className="text-[10px] text-white/25">Multi-factor auth active</p>
      </div>

      <div>
        <p className="mono-label mb-2">USAGE LIMITS</p>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-white/40">Sourcing Runs</span>
              <span className="text-white/60">8 / 20</span>
            </div>
            <div className="h-1 w-full bg-white/[0.05] rounded-full overflow-hidden">
              <div className="h-full bg-white/40 w-[40%]" />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-white/40">AI Screens</span>
              <span className="text-white/60">142 / 500</span>
            </div>
            <div className="h-1 w-full bg-white/[0.05] rounded-full overflow-hidden">
              <div className="h-full bg-white/40 w-[28%]" />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/[0.06]">
        <button className="w-full py-2 rounded-lg border border-white/[0.08] text-[11px] text-white/45 hover:text-white/75 hover:bg-white/[0.04] transition-all flex items-center justify-center gap-2">
          <Key className="h-3 w-3" /> Manage API Keys
        </button>
      </div>
    </div>
  );

  return (
    <NaiveShell
      pageTitle="Employer Profile"
      pageSubtitle="Manage your account settings and connected services"
      rightPanel={rightPanel}
      rightPanelTitle="Account Status"
    >
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        
        {/* Profile Info */}
        <section className="animate-fade-in">
          <h2 className="mono-label mb-4">PERSONAL INFORMATION</h2>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="flex items-start gap-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-white/[0.08] to-transparent border border-white/[0.1] flex items-center justify-center shrink-0">
                <User className="h-10 w-10 text-white/20" />
              </div>
              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono text-white/25 uppercase tracking-wider">Full Name</p>
                    <p className="text-[14px] text-white/80 font-medium">{user?.name || "Loading..."}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono text-white/25 uppercase tracking-wider">Email Address</p>
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-white/20" />
                      <p className="text-[14px] text-white/80 font-medium">{user?.email || "Loading..."}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono text-white/25 uppercase tracking-wider">Company</p>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-white/20" />
                      <p className="text-[14px] text-white/80 font-medium">{user?.company || "Not specified"}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono text-white/25 uppercase tracking-wider">Role</p>
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-white/20" />
                      <p className="text-[14px] text-white/80 font-medium capitalize">{user?.role || "Employer"}</p>
                    </div>
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button className="px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[12px] font-medium text-white/70 hover:text-white hover:bg-white/[0.1] transition-all">
                    Edit Profile
                  </button>
                  <button className="px-4 py-2 rounded-xl border border-white/[0.05] text-[12px] font-medium text-white/30 hover:text-white/50 transition-all">
                    Change Password
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Connected Services */}
        <section className="animate-fade-in" style={{ animationDelay: "100ms" }}>
          <h2 className="mono-label mb-4">CONNECTED SERVICES</h2>
          <div className="space-y-3">
            
            {/* Gmail Integration Card */}
            <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
              isGmailConnected 
                ? "border-green-500/20 bg-green-500/[0.02]" 
                : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
            }`}>
              <div className="p-6 flex items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                    <GmailLogo />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-white/90">Gmail Connection</h3>
                    <p className="text-[12px] text-white/35 max-w-md mt-0.5 leading-relaxed">
                      Connect your Gmail to send personalized outreach and schedule interviews directly from workBYLiNE.
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  {isGmailConnected ? (
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end mr-2">
                        <span className="text-[10px] font-mono text-green-400 flex items-center gap-1.5 mb-1">
                          <CheckCircle2 className="h-3 w-3" /> CONNECTED
                        </span>
                        <span className="text-[10px] text-white/20">parth@headwayos.com</span>
                      </div>
                      <button 
                        onClick={handleDisconnectGmail}
                        className="px-4 py-2 rounded-xl border border-white/[0.08] text-[12px] font-medium text-white/40 hover:text-white/80 hover:border-white/[0.2] transition-all"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={handleConnectGmail}
                      disabled={isConnecting}
                      className="px-6 py-2.5 rounded-xl bg-white text-black text-[13px] font-bold hover:bg-white/90 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          Connect Gmail
                          <ExternalLink className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              
              {isGmailConnected && (
                <div className="px-6 py-3 bg-green-500/[0.05] border-t border-green-500/10 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-green-400/60" />
                  <p className="text-[10px] text-green-400/60">workBYLiNE now has permission to manage outreach emails on your behalf.</p>
                </div>
              )}
            </div>

            {/* Placeholder for other services */}
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-6 flex items-center justify-between opacity-50">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center shrink-0">
                  <div className="w-6 h-6 rounded-md bg-white/10" />
                </div>
                <div>
                  <h3 className="text-[14px] font-medium text-white/60">More Integrations</h3>
                  <p className="text-[11px] text-white/25">Connect LinkedIn, Outlook, and more coming soon.</p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-white/15">SOON</span>
            </div>

          </div>
        </section>

      </div>
    </NaiveShell>
  );
}
