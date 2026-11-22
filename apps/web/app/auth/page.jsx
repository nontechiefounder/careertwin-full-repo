"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, ArrowRight, Building2, User, Github, Mail, Linkedin, KeyRound, CheckCircle2 } from "lucide-react";
import { CTLogo } from "@/components/NaiveShell";
import BackgroundBeams from "@/components/marketing/BackgroundBeams";
import SpotlightCard from "@/components/marketing/SpotlightCard";
import { sanitizeRedirectUrl } from "@/lib/safeRedirect";

const FREE_DOMAINS = ["gmail.com","yahoo.com","hotmail.com","outlook.com","live.com","icloud.com","aol.com","protonmail.com","yandex.com","mail.com"];

function AuthPageInner() {
  const searchParams = useSearchParams();

  const router = useRouter();
  const redirectTo = searchParams?.get("redirect_to") || searchParams?.get("next") || null;
  const inviteToken = searchParams?.get("invite") || null;
  const urlTab = searchParams?.get("tab") || null;

  const [tab, setTab] = useState(inviteToken ? "register" : (urlTab === "register" ? "register" : "login"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("employer");
  const [loading, setLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(urlTab === "recovery");
  const [recoverySent, setRecoverySent] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState(null);
  const [verificationStatusMessage, setVerificationStatusMessage] = useState(null);
  const [resendingVerification, setResendingVerification] = useState(false);

  const { login, register, loginWithProvider, user } = useAuth();

  const getSafeRedirect = useCallback((u) => {
    const fallback = u?.role === "employer" ? "/employer" : "/candidate/onboarding";
    return redirectTo ? sanitizeRedirectUrl(redirectTo, fallback) : fallback;
  }, [redirectTo]);

  // Redirect if already legitimately authenticated without a pending redirect challenge
  useEffect(() => {
    if (user && !loading && !redirectTo) {
      router.replace(getSafeRedirect(user));
    }
  }, [user, loading, router, redirectTo, getSafeRedirect]);

  if (user && !redirectTo) return null;

  const handleOAuth = async (provider) => {
    try {
      await loginWithProvider(provider);
    } catch (err) {
      toast.error(err.message || "Social login failed");
    }
  };

  const handlePasswordRecovery = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email to receive recovery instructions.");
      return;
    }
    setLoading(true);
    try {
      const { supabase } = await import("@/lib/supabase");
      if (supabase) {
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/auth?tab=recovery`
        });
      }
      setRecoverySent(true);
      toast.success("Recovery instructions sent. Check your email.");
    } catch (err) {
      toast.error(err.message || "Failed to initiate recovery");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "login") {
        const u = await login(email, password);
        toast.success(`Welcome back!`);
        router.push(getSafeRedirect(u));
      } else {
        let company = null;
        if (role === "employer") {
          const domain = email.split("@")[1]?.toLowerCase();
          if (domain && FREE_DOMAINS.includes(domain)) {
            toast.error("Please use your company email address.");
            setLoading(false); return;
          }
          if (domain) company = domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        }
        const regResult = await register(email, password, name, role, company);
        setPendingVerificationEmail(null);
        setVerificationStatusMessage(null);
        if (regResult?.delivery_status === "suppressed_dry_run") {
          const msg = regResult.message || "Account created (dry-run mode: verification email delivery suppressed).";
          setVerificationStatusMessage(msg);
          toast.info(msg);
        } else {
          toast.success(inviteToken ? "Account created and invitation accepted!" : (regResult?.message || "Account created! Please check your email for verification."));
        }
        if (redirectTo) {
          router.push(getSafeRedirect({ role }));
        }
      }
    } catch (err) {
      if (err?.accountCreated && err?.retrySupported) {
        setPendingVerificationEmail(email.trim().toLowerCase());
        setVerificationStatusMessage(err.message);
      }
      toast.error(err.message || "Something went wrong");
    } finally { setLoading(false); }
  };

  const handleResendVerification = async () => {
    if (!pendingVerificationEmail || resendingVerification) return;
    setResendingVerification(true);
    try {
      const res = await api.post("/auth/resend-verification", { email: pendingVerificationEmail });
      const data = res.data || {};
      const msg = data.message || "If an unverified account exists for this email, a verification email will be sent.";
      setVerificationStatusMessage(msg);
      if (data?.delivery_status === "accepted" || data?.delivery_status === "suppressed_dry_run") {
        setPendingVerificationEmail(null);
        toast.info(msg);
      } else {
        setPendingVerificationEmail(null);
        toast.success(msg);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || "Could not resend verification email.";
      setVerificationStatusMessage(msg);
      toast.error(msg);
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex overflow-hidden font-sans" data-testid="auth-page">

      {/* ── Left Agency Panel ─────────────────────────────── */}
      <div className="hidden lg:flex w-1/2 flex-col relative border-r border-white/[0.05] bg-black overflow-hidden p-14 justify-between">
        <BackgroundBeams />
        
        {/* Decorative Top */}
        <div className="relative z-10 animate-fade-in stagger-1">
          <div className="flex items-center gap-2 mb-20 cursor-pointer" onClick={() => router.push("/")}>
            <CTLogo size="md" />
            <span className="text-[20px] font-semibold tracking-tight text-white/90">work<span className="text-[#00D604] font-bold">BYLiNE</span></span>
          </div>
          
          <div className="mb-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.12] bg-white/[0.04] text-[11px] font-mono text-[#E1E1E5] tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D604] animate-pulse" />
              Join elite teams
            </span>
          </div>
          <h1 className="text-5xl font-semibold tracking-tight text-white leading-[1.1] mb-6 drop-shadow-lg">
            Hire on <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">proof.</span><br />
            Not promises.
          </h1>
          <p className="text-lg text-white/40 leading-relaxed max-w-md">
            The anti-resume platform. AI-driven verification, async screening, and full decision packets before the first interview.
          </p>
        </div>

        {/* Floating Agency Testimonial Cards */}
        <div className="relative z-10 w-full max-w-lg mb-10 animate-fade-in stagger-3">
          <SpotlightCard spotColor="rgba(255,255,255,0.05)" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 shadow-2xl backdrop-blur-md">
            <div className="flex gap-4 items-start mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/[0.1] to-white/[0.02] border border-white/[0.1] flex items-center justify-center font-semibold text-white/60">
                W
              </div>
              <div>
                <p className="text-[14px] font-semibold text-white/90">Evidence-Grounded Hiring</p>
                <p className="text-[11px] text-white/40 font-mono mt-1">Structured contracts · Human decision authority</p>
              </div>
            </div>
            <p className="text-[15px] text-white/50 leading-relaxed">
              Structured role contracts, provenance-linked candidate packets, and transparent audit trails for hiring teams.
            </p>
          </SpotlightCard>
        </div>

        {/* Footer info */}
        <div className="relative z-10 animate-fade-in stagger-4">
          <p className="text-[11px] text-white/30">
            © {new Date().getFullYear()} workBYLiNE.
          </p>
        </div>
      </div>

      {/* ── Right Form Panel (Glassmorphism) ─────────────── */}
      <div className="flex-1 w-full flex items-center justify-center p-6 relative">
        <div className="absolute inset-0 bg-[#030303] pointer-events-none" />
        {/* Glow ball behind the form */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.02] rounded-full blur-[100px] pointer-events-none" />
        
        <div className="w-full max-w-[420px] relative z-10">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-2 mb-10 lg:hidden cursor-pointer" onClick={() => router.push("/")}>
            <CTLogo size="md" />
            <span className="text-[20px] font-semibold tracking-tight text-white/90">work<span className="text-[#00D604] font-bold">BYLiNE</span></span>
          </div>

          <div className="rounded-3xl border border-white/[0.06] bg-black/60 p-8 sm:p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-fade-in stagger-2">
            
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-white mb-2">
                {tab === "login" ? "Welcome back" : "Create an account"}
              </h2>
              <p className="text-[13px] text-white/40">
                {tab === "login" ? "Enter your credentials to access your workspace." : "Create your workBYLiNE workspace."}
              </p>
            </div>

            {/* OAuth Presets */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              <button 
                type="button" 
                onClick={() => handleOAuth("github")}
                className="flex items-center justify-center gap-2 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[13px] font-medium text-white/70 hover:bg-white/[0.06] hover:text-white transition-all">
                <Github className="h-4 w-4" /> 
                <span className="hidden sm:inline">GitHub</span>
              </button>
              <button 
                type="button" 
                onClick={() => handleOAuth("google")}
                className="flex items-center justify-center gap-2 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[13px] font-medium text-white/70 hover:bg-white/[0.06] hover:text-white transition-all">
                <Mail className="h-4 w-4" /> 
                <span className="hidden sm:inline">Google</span>
              </button>
              <button 
                type="button" 
                onClick={() => handleOAuth("linkedin_oidc")}
                className="flex items-center justify-center gap-2 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[13px] font-medium text-white/70 hover:bg-white/[0.06] hover:text-white transition-all">
                <Linkedin className="h-4 w-4" /> 
                <span className="hidden sm:inline">LinkedIn</span>
              </button>
            </div>

            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center"><Separator className="w-full bg-white/[0.06]" /></div>
              <div className="relative flex justify-center text-[10px] uppercase font-mono tracking-widest"><span className="bg-black px-3 text-white/30">Or continue with email</span></div>
            </div>

            {/* Invite Token Banner */}
            {inviteToken && (
              <div className="mb-6 p-4 rounded-2xl bg-[#00D604]/10 border border-[#00D604]/30 text-xs text-[#00D604] flex items-center gap-3">
                <Building2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold text-white/90">Team Invitation</p>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    You have been invited to join your team workspace on workBYLiNE. Sign in or register to accept.
                  </p>
                </div>
              </div>
            )}

            {recoveryMode ? (
              <div className="space-y-5">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-white">Reset Password</h3>
                  <p className="text-xs text-white/40 mt-1">
                    Enter your email address and we will send you instructions to recover your account.
                  </p>
                </div>

                {recoverySent ? (
                  <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-center space-y-3">
                    <CheckCircle2 className="h-6 w-6 text-green-400 mx-auto" />
                    <p className="text-xs text-white/80">
                      Recovery link has been dispatched to <strong className="text-white">{email}</strong>. Please check your inbox.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setRecoveryMode(false); setRecoverySent(false); }}
                      className="text-xs text-[#00D604] hover:underline"
                    >
                      Return to Sign In
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordRecovery} className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[11px] font-semibold text-white/50 tracking-wider">EMAIL</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        placeholder="you@company.com"
                        className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:border-white/50 text-[14px]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full justify-center h-12 rounded-xl bg-[#E1E1E5] text-[#030303] font-semibold text-[14px] flex items-center gap-2 hover:bg-white transition-all disabled:opacity-40 shadow-xs"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {loading ? "Sending instructions…" : "Send Reset Link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecoveryMode(false)}
                      className="w-full text-center text-xs text-white/40 hover:text-white pt-2"
                    >
                      Cancel & Return to Sign In
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <>
                {/* Form Tabs */}
                <Tabs value={tab} onValueChange={setTab} className="w-full">
                  <TabsList className="w-full mb-8 bg-white/[0.03] border border-white/[0.06] p-1 h-11 rounded-xl">
                    <TabsTrigger value="login" className="flex-1 text-[13px] h-9 rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-[#E1E1E5] data-[state=active]:shadow-none data-[state=inactive]:text-white/40 transition-all font-medium">
                      Log In
                    </TabsTrigger>
                    <TabsTrigger value="register" className="flex-1 text-[13px] h-9 rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-[#E1E1E5] data-[state=active]:shadow-none data-[state=inactive]:text-white/40 transition-all font-medium">
                      Sign Up
                    </TabsTrigger>
                  </TabsList>

                  {/* ── Login ── */}
                  <TabsContent value="login" className="mt-0">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-white/50 tracking-wider">EMAIL</Label>
                        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                          placeholder="you@company.com"
                          className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:border-white/50 transition-all text-[14px] placeholder:text-white/20"
                          data-testid="email-input" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-[11px] font-semibold text-white/50 tracking-wider">PASSWORD</Label>
                          <button
                            type="button"
                            onClick={() => setRecoveryMode(true)}
                            className="text-[11px] text-white/60 hover:text-[#00D604] transition-colors"
                          >
                            Forgot?
                          </button>
                        </div>
                        <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                          placeholder="••••••••"
                          className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:border-white/50 transition-all text-[14px] placeholder:text-white/20"
                          data-testid="password-input" />
                      </div>
                      <button type="submit" disabled={loading}
                        className="w-full justify-center h-12 mt-4 rounded-xl bg-[#E1E1E5] text-[#030303] font-semibold text-[14px] flex items-center gap-2 hover:bg-white transition-all disabled:opacity-40 shadow-xs"
                        data-testid="login-btn">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {loading ? "Signing in…" : "Sign In"}
                        {!loading && <ArrowRight className="h-4 w-4 ml-1" />}
                      </button>
                    </form>
                  </TabsContent>

                  {/* ── Register ── */}
                  <TabsContent value="register" className="mt-0">
                     <form onSubmit={handleSubmit} className="space-y-5">
                      {/* Role toggle */}
                      <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-white/50 tracking-wider">I AM A</Label>
                        <div className="flex gap-3">
                          {[
                            { val: "employer", label: "Hiring Team", Icon: Building2 },
                            { val: "candidate", label: "Job Seeker",  Icon: User },
                          ].map(r => (
                            <button key={r.val} type="button"
                              onClick={() => setRole(r.val)}
                              className={`flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-200 ${
                                role === r.val
                                  ? "border-white/30 bg-white/[0.08] text-white shadow-xs"
                                  : "border-white/[0.08] bg-white/[0.02] text-white/40 hover:text-white/70 hover:border-white/[0.15] hover:bg-white/[0.04]"
                              }`}
                              data-testid={`role-${r.val}`}>
                              <r.Icon className="h-5 w-5 shrink-0" />
                              <span className="text-[12px] font-medium">{r.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-white/50 tracking-wider">FULL NAME</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} required
                          placeholder="Your name"
                          className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:border-white/50 transition-all text-[14px] placeholder:text-white/20"
                          data-testid="name-input" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-white/50 tracking-wider">
                          {role === "employer" ? "COMPANY EMAIL" : "EMAIL"}
                        </Label>
                        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                          placeholder={role === "employer" ? "you@company.com" : "you@email.com"}
                          className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:border-white/50 transition-all text-[14px] placeholder:text-white/20"
                          data-testid="email-input" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-white/50 tracking-wider">PASSWORD</Label>
                        <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                          placeholder="••••••••"
                          className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:border-white/50 transition-all text-[14px] placeholder:text-white/20"
                          data-testid="password-input" />
                      </div>

                      <button type="submit" disabled={loading}
                        className="w-full justify-center h-12 mt-6 rounded-xl bg-[#E1E1E5] text-[#030303] font-semibold text-[14px] flex items-center gap-2 hover:bg-white transition-all disabled:opacity-40 shadow-xs"
                        data-testid="register-btn">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {loading ? "Creating account…" : "Create Account"}
                        {!loading && <ArrowRight className="h-4 w-4 ml-1" />}
                      </button>

                      {verificationStatusMessage && (
                        <div
                          className="mt-4 rounded-xl border border-white/[0.12] bg-white/[0.04] p-3 text-[12px] text-white/80"
                          data-testid="signup-delivery-notice"
                        >
                          <p>{verificationStatusMessage}</p>
                          {pendingVerificationEmail && (
                            <button
                              type="button"
                              onClick={handleResendVerification}
                              disabled={resendingVerification}
                              data-testid="resend-verification-btn"
                              className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#00D604] hover:underline disabled:opacity-50"
                            >
                              {resendingVerification ? "Resending…" : "Resend verification email"}
                            </button>
                          )}
                        </div>
                      )}

                      <p className="text-[11px] text-white/30 text-center leading-relaxed mt-4 px-4">
                        By creating an account you agree to our <a href="/terms" className="text-white/60 hover:text-white underline decoration-white/20">Terms</a> and <a href="/privacy" className="text-white/60 hover:text-white underline decoration-white/20">Privacy Policy</a>.
                      </p>
                    </form>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a]" />}>
      <AuthPageInner />
    </Suspense>
  );
}
