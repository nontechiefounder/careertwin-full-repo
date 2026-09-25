"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, ArrowRight, Building2, User, Github, Mail, Linkedin } from "lucide-react";
import { CTLogo } from "@/components/NaiveShell";
import BackgroundBeams from "@/components/marketing/BackgroundBeams";
import SpotlightCard from "@/components/marketing/SpotlightCard";

const FREE_DOMAINS = ["gmail.com","yahoo.com","hotmail.com","outlook.com","live.com","icloud.com","aol.com","protonmail.com","yandex.com","mail.com"];

export default function AuthPage() {
  const [tab,      setTab]      = useState("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [role,     setRole]     = useState("employer");
  const [loading,  setLoading]  = useState(false);
  const { login, register, loginWithProvider, user } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      router.replace(user.role === "employer" ? "/employer" : "/candidate/onboarding");
    }
  }, [user, loading, router]);

  if (user) return null;

  const handleOAuth = async (provider) => {
    try {
      await loginWithProvider(provider);
    } catch (err) {
      toast.error(err.message || "Social login failed");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "login") {
        const u = await login(email, password);
        toast.success(`Welcome back!`);
        router.push(u.role === "employer" ? "/employer" : "/candidate/onboarding");
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
        await register(email, password, name, role, company);
        toast.success("Account created! Please check your email for verification.");
      }
    } catch (err) {
      toast.error(err.message || "Something went wrong");
    } finally { setLoading(false); }
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
            <span className="text-[20px] font-semibold tracking-tight text-white/90">CareerTW<span className="text-[#10D97A]">i</span>N</span>
          </div>
          
          <div className="mb-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#10D97A]/20 bg-[#10D97A]/[0.05] text-[10px] font-mono text-[#10D97A] tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10D97A] animate-pulse" />
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
            <div className="flex gap-4 items-start mb-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/[0.1] to-white/[0.02] border border-white/[0.1] flex items-center justify-center font-semibold text-white/60">
                P
              </div>
              <div>
                <p className="text-[14px] font-semibold text-white/90">Priya S.</p>
                <p className="text-[11px] text-white/40 font-mono mt-1">VP Engineering, Series B SaaS</p>
              </div>
            </div>
            <p className="text-[15px] text-white/50 leading-relaxed italic">
              "CareerTWiN cut our screening time by 70%. Every shortlist arrived with verified GitHub contributions and proof of impact. It's unlike anything we've ever used."
            </p>
          </SpotlightCard>
        </div>

        {/* Footer info */}
        <div className="relative z-10 animate-fade-in stagger-4">
          <p className="text-[11px] text-white/30">
            © {new Date().getFullYear()} CareerTWiN. Enterprise-grade security & GDPR compliant.
          </p>
        </div>
      </div>

      {/* ── Right Form Panel (Glassmorphism) ─────────────── */}
      <div className="flex-1 w-full flex items-center justify-center p-6 relative">
        <div className="absolute inset-0 bg-[#0d0d0d] pointer-events-none" />
        {/* Glow ball behind the form */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#10D97A]/[0.03] rounded-full blur-[100px] pointer-events-none" />
        
        <div className="w-full max-w-[420px] relative z-10">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-2 mb-10 lg:hidden cursor-pointer" onClick={() => router.push("/")}>
            <CTLogo size="md" />
            <span className="text-[20px] font-semibold text-white">CareerTW<span className="text-[#10D97A]">i</span>N</span>
          </div>

          <div className="rounded-3xl border border-white/[0.06] bg-black/60 p-8 sm:p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-fade-in stagger-2">
            
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-white mb-2">
                {tab === "login" ? "Welcome back" : "Create an account"}
              </h2>
              <p className="text-[13px] text-white/40">
                {tab === "login" ? "Enter your credentials to access your workspace." : "Join thousands of teams hiring on proof."}
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

            {/* Form Tabs */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="w-full mb-8 bg-white/[0.03] border border-white/[0.06] p-1 h-11 rounded-xl">
                <TabsTrigger value="login" className="flex-1 text-[13px] h-9 rounded-lg data-[state=active]:bg-[#10D97A]/10 data-[state=active]:text-[#10D97A] data-[state=active]:shadow-none data-[state=inactive]:text-white/40 transition-all font-medium">
                  Log In
                </TabsTrigger>
                <TabsTrigger value="register" className="flex-1 text-[13px] h-9 rounded-lg data-[state=active]:bg-[#10D97A]/10 data-[state=active]:text-[#10D97A] data-[state=active]:shadow-none data-[state=inactive]:text-white/40 transition-all font-medium">
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
                      className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-[#10D97A]/50 focus-visible:border-[#10D97A] transition-all text-[14px] placeholder:text-white/20"
                      data-testid="email-input" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-[11px] font-semibold text-white/50 tracking-wider">PASSWORD</Label>
                      <button type="button" className="text-[11px] text-[#10D97A]/70 hover:text-[#10D97A] transition-colors">Forgot?</button>
                    </div>
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                      placeholder="••••••••"
                      className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-[#10D97A]/50 focus-visible:border-[#10D97A] transition-all text-[14px] placeholder:text-white/20"
                      data-testid="password-input" />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full justify-center h-12 mt-4 rounded-xl bg-white text-black font-semibold text-[14px] flex items-center gap-2 hover:bg-white/90 transition-all disabled:opacity-40 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
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
                              ? "border-[#10D97A]/50 bg-[#10D97A]/[0.05] text-[#10D97A] shadow-[0_0_15px_rgba(16,217,122,0.1)]"
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
                      className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-[#10D97A]/50 focus-visible:border-[#10D97A] transition-all text-[14px] placeholder:text-white/20"
                      data-testid="name-input" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold text-white/50 tracking-wider">
                      {role === "employer" ? "COMPANY EMAIL" : "EMAIL"}
                    </Label>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                      placeholder={role === "employer" ? "you@company.com" : "you@email.com"}
                      className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-[#10D97A]/50 focus-visible:border-[#10D97A] transition-all text-[14px] placeholder:text-white/20"
                      data-testid="email-input" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold text-white/50 tracking-wider">PASSWORD</Label>
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                      placeholder="••••••••"
                      className="bg-black/50 border-white/[0.1] h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-[#10D97A]/50 focus-visible:border-[#10D97A] transition-all text-[14px] placeholder:text-white/20"
                      data-testid="password-input" />
                  </div>

                  <button type="submit" disabled={loading}
                    className="w-full justify-center h-12 mt-6 rounded-xl bg-[#10D97A] text-black font-semibold text-[14px] flex items-center gap-2 hover:bg-[#10D97A]/90 transition-all disabled:opacity-40 shadow-[0_0_20px_rgba(16,217,122,0.2)] hover:shadow-[0_0_35px_rgba(16,217,122,0.4)]"
                    data-testid="register-btn">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {loading ? "Creating account…" : "Create Account"}
                    {!loading && <ArrowRight className="h-4 w-4 ml-1" />}
                  </button>

                  <p className="text-[11px] text-white/30 text-center leading-relaxed mt-4 px-4">
                    By creating an account you agree to our <a href="/terms" className="text-white/60 hover:text-white underline decoration-white/20">Terms</a> and <a href="/privacy" className="text-white/60 hover:text-white underline decoration-white/20">Privacy Policy</a>.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
