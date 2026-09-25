"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Search, ArrowRight, Users, Briefcase, Shield, Command, CornerDownLeft } from "lucide-react";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const router = useRouter();

  // ⌘K or Ctrl+K to toggle
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (!open) { setQuery(""); setResults([]); setSelected(0); }
  }, [open]);

  // Search
  const doSearch = useCallback(async (q) => {
    setLoading(true);
    try {
      const res = await api.get(`/search/?q=${encodeURIComponent(q)}`);
      setResults(res.data.results || []);
      setSelected(0);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (query.length > 0) doSearch(query); else doSearch(""); }, 200);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  // Keyboard nav
  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && results[selected]) {
      router.push(results[selected].url);
      setOpen(false);
    }
  };

  const typeIcons = { role: Briefcase, candidate: Users, packet: Shield };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" data-testid="command-palette">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div className="relative max-w-xl mx-auto mt-[15vh]">
        <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0a] shadow-2xl shadow-black/50 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
            <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search candidates, roles, packets..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
              data-testid="command-search-input"
            />
            <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono text-muted-foreground/40 border border-white/[0.06]">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto py-2">
            {results.length === 0 && !loading && (
              <div className="px-4 py-8 text-center">
                <Search className="h-5 w-5 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground/40">
                  {query ? "No results found" : "Start typing to search across your pipeline"}
                </p>
              </div>
            )}

            {loading && (
              <div className="px-4 py-6 text-center">
                <div className="w-4 h-4 border-2 border-white/10 border-t-white/50 rounded-full animate-spin mx-auto" />
              </div>
            )}

            {!loading && results.map((r, i) => {
              const Icon = typeIcons[r.type] || Search;
              return (
                <button
                  key={r.id + i}
                  onClick={() => { router.push(r.url); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    selected === i ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                  }`}
                  data-testid={`result-${r.type}-${i}`}
                >
                  <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                    <Icon className="h-3 w-3 text-muted-foreground/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{r.title}</p>
                    <p className="text-[10px] text-muted-foreground/50 truncate">{r.subtitle}</p>
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground/30 uppercase shrink-0">{r.type}</span>
                  {selected === i && <CornerDownLeft className="h-3 w-3 text-muted-foreground/30 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-white/[0.06] text-[10px] text-muted-foreground/30">
            <span className="flex items-center gap-1"><Command className="h-2.5 w-2.5" />K to toggle</span>
            <span>↑↓ to navigate</span>
            <span>↵ to open</span>
          </div>
        </div>
      </div>
    </div>
  );
}
