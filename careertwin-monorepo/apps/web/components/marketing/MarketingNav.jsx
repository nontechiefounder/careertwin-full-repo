"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ArrowRight, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Product", href: "/#engines" },
  { label: "Compare", href: "/compare" },
  { label: "Pricing", href: "/pricing" },
];

export default function MarketingNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNav = (href) => {
    setMenuOpen(false);
    if (href.startsWith("/#")) {
      if (pathname !== "/") {
        router.push("/");
        setTimeout(() => {
          document.getElementById(href.replace("/#", ""))?.scrollIntoView({ behavior: "smooth" });
        }, 200);
      } else {
        document.getElementById(href.replace("/#", ""))?.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      router.push(href);
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 transition-all duration-300 ${scrolled
          ? "bg-[#0d0d0d]/90 backdrop-blur-xl border-b border-white/[0.06]"
          : "bg-transparent"
        }`}
    >
      {/* Logo */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-2.5"
        data-testid="nav-logo"
      >
        <img src="/logo.svg" alt="CareerTWiN Logo" className="h-8 w-auto object-contain shrink-0" />
        <span className="text-white font-semibold tracking-tight text-[15px]">CareerTW<span className="text-[#10D97A]">i</span>N</span>
      </button>

      {/* Desktop links */}
      <div className="hidden md:flex items-center gap-7">
        {NAV_LINKS.map(link => (
          <button
            key={link.href}
            onClick={() => handleNav(link.href)}
            className={`text-[13px] transition-colors ${pathname === link.href
                ? "text-white/75"
                : "text-white/38 hover:text-white/70"
              }`}
          >
            {link.label}
          </button>
        ))}
      </div>

      {/* CTA */}
      <div className="flex items-center gap-3">
        {user ? (
          <button
            onClick={() => router.push(user.role === "employer" ? "/employer" : "/candidate/onboarding")}
            className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-white/90 transition-all"
          >
            Go to workspace <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <>
            <button
              onClick={() => router.push("/auth")}
              className="hidden md:block text-[13px] text-white/38 hover:text-white/70 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => router.push("/auth")}
              className="px-4 py-2 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-white/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.10)]"
              data-testid="nav-cta"
            >
              Get started
            </button>
          </>
        )}
        <button
          className="md:hidden text-white/40 hover:text-white/70 transition-colors"
          onClick={() => setMenuOpen(o => !o)}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 bg-[#0d0d0d]/96 backdrop-blur-xl border-b border-white/[0.06] px-6 py-5 space-y-1 md:hidden animate-fade-in">
          {NAV_LINKS.map(link => (
            <button
              key={link.href}
              onClick={() => handleNav(link.href)}
              className="block w-full text-left text-[14px] text-white/55 hover:text-white py-2.5 border-b border-white/[0.04] last:border-0"
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => { setMenuOpen(false); router.push("/auth"); }}
            className="w-full mt-3 px-4 py-3 rounded-xl bg-white text-black text-[14px] font-semibold"
          >
            Get started free
          </button>
        </div>
      )}
    </nav>
  );
}
