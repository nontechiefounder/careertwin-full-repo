"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, Loader2, Plus, X } from "lucide-react";
import { CTLogo } from "@/components/NaiveShell";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({
    name: user?.name || "", email: user?.email || "",
    github_url: "", resume_link: "", target_roles: [],
    location: "", compensation_min: 0, compensation_max: 0,
    search_urgency: "active", bio: ""
  });
  const [roleInput, setRoleInput] = useState("");

  useEffect(() => {
    api.get("/candidate/profile").then(res => {
      if (res.data) {
        setForm(f => ({ ...f, ...res.data }));
      }
    }).catch(() => {}).finally(() => setChecking(false));
  }, []);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const addRole = () => { if (roleInput.trim()) { set("target_roles", [...form.target_roles, roleInput.trim()]); setRoleInput(""); } };
  const removeRole = (i) => set("target_roles", form.target_roles.filter((_, idx) => idx !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setLoading(true);
    try {
      const res = await api.post("/candidate/profile", form);
      toast.success("Profile saved");
      router.push(`/candidate/proof-profile/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-white/45" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d0d0d]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }} data-testid="onboarding-page">
      <nav className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <CTLogo />
          <span className="text-[13px] font-semibold text-white/85 tracking-tight">CareerTWiN</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/45">
          <span>Candidate</span>
          <span className="text-white/20">/</span>
          <span className="text-white/85">Onboarding</span>
          <Button variant="ghost" size="sm" onClick={logout} data-testid="logout-btn">Sign out</Button>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-white/85 mb-2">Tell us about yourself</h1>
        <p className="text-sm text-white/45 mb-10">We&apos;ll use this to build your proof-first profile. The more you share, the stronger your proof.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic info */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
            <h2 className="text-base font-medium text-white/85">Basic info</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-white/45">Full name *</Label>
                <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Your name" className="mt-1.5 bg-[#0d0d0d] border-white/10" required data-testid="onboard-name" />
              </div>
              <div>
                <Label className="text-sm text-white/45">Email</Label>
                <Input value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@email.com" type="email" className="mt-1.5 bg-[#0d0d0d] border-white/10" data-testid="onboard-email" />
              </div>
            </div>
            <div>
              <Label className="text-sm text-white/45">Short bio</Label>
              <Textarea value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="Brief description of your experience and what you're looking for..." rows={3} className="mt-1.5 bg-[#0d0d0d] border-white/10 resize-none" data-testid="onboard-bio" />
            </div>
            <div>
              <Label className="text-sm text-white/45">Location</Label>
              <Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="City, State or Remote" className="mt-1.5 bg-[#0d0d0d] border-white/10" data-testid="onboard-location" />
            </div>
          </div>

          {/* Links */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
            <h2 className="text-base font-medium text-white/85">Links & proof</h2>
            <div>
              <Label className="text-sm text-white/45">GitHub URL</Label>
              <Input value={form.github_url} onChange={e => set("github_url", e.target.value)} placeholder="https://github.com/username" className="mt-1.5 bg-[#0d0d0d] border-white/10" data-testid="onboard-github" />
            </div>
            <div>
              <Label className="text-sm text-white/45">Resume link</Label>
              <Input value={form.resume_link} onChange={e => set("resume_link", e.target.value)} placeholder="Link to resume (Google Drive, Dropbox, etc.)" className="mt-1.5 bg-[#0d0d0d] border-white/10" data-testid="onboard-resume" />
            </div>
          </div>

          {/* Preferences */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
            <h2 className="text-base font-medium text-white/85">Preferences</h2>
            <div>
              <Label className="text-sm text-white/45 mb-2 block">Target roles</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.target_roles.map((role, i) => (
                  <span key={i} className="tag-chip tag-chip-must">
                    {role}
                    <button type="button" onClick={() => removeRole(i)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={roleInput} onChange={e => setRoleInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRole(); } }}
                  placeholder="Backend Engineer, Full Stack, etc." className="bg-[#0d0d0d] border-white/10" data-testid="onboard-role-input" />
                <Button type="button" variant="outline" size="icon" onClick={addRole} data-testid="onboard-add-role"><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-white/45">Min compensation ($)</Label>
                <Input type="number" value={form.compensation_min || ""} onChange={e => set("compensation_min", parseInt(e.target.value) || 0)}
                  placeholder="100000" className="mt-1.5 bg-[#0d0d0d] border-white/10" data-testid="onboard-comp-min" />
              </div>
              <div>
                <Label className="text-sm text-white/45">Max compensation ($)</Label>
                <Input type="number" value={form.compensation_max || ""} onChange={e => set("compensation_max", parseInt(e.target.value) || 0)}
                  placeholder="180000" className="mt-1.5 bg-[#0d0d0d] border-white/10" data-testid="onboard-comp-max" />
              </div>
            </div>
            <div>
              <Label className="text-sm text-white/45">Search urgency</Label>
              <Select value={form.search_urgency} onValueChange={v => set("search_urgency", v)}>
                <SelectTrigger className="mt-1.5 bg-[#0d0d0d] border-white/10 w-48" data-testid="onboard-urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actively looking</SelectItem>
                  <SelectItem value="passive">Open to opportunities</SelectItem>
                  <SelectItem value="casual">Just browsing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" className="w-full bg-white text-black hover:bg-gray-200 h-12" disabled={loading} data-testid="onboard-submit">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save & generate proof profile <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
