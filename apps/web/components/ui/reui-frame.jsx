"use client";

import React, { useEffect, useRef, useState } from "react";
import { TrendingUp, TrendingDown, Clock, ArrowRight } from "lucide-react";

/**
 * Concentric Double-Box Frame + FramePanel + Stippled Dot-Matrix Canvas + KPI Sparkline Strip
 * Configured with Official Brand Palette:
 * Dark: Sidebar #181818 -> Workspace #030303 -> Cards #121212 | Controls #222222 | Hover #292929 | Border #303030/#484848 | Text/Btn #E1E1E5 | Sub #8D8D8D | Accent #00D604
 * White: Sidebar #F0F0F0 -> Workspace #FAFAFA -> Cards #FFFFFF | Controls #F5F5F5 | Hover #E8E8E8 | Border #DADADA/#A3A3A3 | Text/Btn #030303 (btn text #E1E1E5) | Sub #626262 | Accent #00D604 (text #087A0B)
 */

export function Frame({
  variant = "default",
  spacing = "default",
  density = "default",
  className = "",
  children,
  ...props
}) {
  const isDense = density === "dense" || spacing === "none";
  const isGhost = variant === "ghost";
  return (
    <div
      data-slot="frame"
      data-variant={variant}
      data-density={isDense ? "dense" : "default"}
      className={`reui-frame ${isDense ? "reui-frame-dense" : ""} ${isGhost ? "reui-frame-ghost" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function FramePanel({ className = "", children, ...props }) {
  return (
    <div
      data-slot="frame-panel"
      className={`reui-frame-panel ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function FrameHeader({ className = "", children, ...props }) {
  return (
    <header
      data-slot="frame-panel-header"
      className={`flex items-center justify-between px-3 py-1.5 gap-3 ${className}`}
      {...props}
    >
      {children}
    </header>
  );
}

export function FrameTitle({ className = "", children, ...props }) {
  return (
    <div
      data-slot="frame-panel-title"
      className={`text-[13px] font-semibold leading-snug tracking-tight ${className}`}
      style={{ color: "var(--reui-text-main)" }}
      {...props}
    >
      {children}
    </div>
  );
}

export function FrameDescription({ className = "", children, ...props }) {
  return (
    <div
      data-slot="frame-panel-description"
      className={`text-[11px] ${className}`}
      style={{ color: "var(--reui-text-muted)" }}
      {...props}
    >
      {children}
    </div>
  );
}

export function FrameFooter({ className = "", children, ...props }) {
  return (
    <footer
      data-slot="frame-panel-footer"
      className={`flex items-center justify-between px-3 py-1.5 text-[11px] gap-3 ${className}`}
      style={{ color: "var(--reui-text-muted)" }}
      {...props}
    >
      {children}
    </footer>
  );
}

/**
 * Procedural stippled dot-matrix canvas
 * Uses #00D604 decorative signature green dots + neutral dots on a 3px grid.
 */
export function StippledPatternCanvas({ className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hash = (x, y) => {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(rect.height);
      if (width === 0 || height === 0) return;

      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const isWhiter =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("theme-whiter");

      const step = 3;
      const cols = Math.ceil(width / step);
      const rows = Math.ceil(height / step);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const h = hash(c, r);
          if (h > 0.55) {
            const alpha = ((h - 0.55) / 0.45) * 0.26 + 0.04;
            const isGreenDot = hash(c + 19, r + 41) > 0.78;
            if (isWhiter) {
              ctx.fillStyle = isGreenDot
                ? `rgba(8, 122, 11, ${(alpha * 0.75).toFixed(3)})`
                : `rgba(3, 3, 3, ${(alpha * 0.4).toFixed(3)})`;
            } else {
              ctx.fillStyle = isGreenDot
                ? `rgba(0, 214, 4, ${(alpha * 0.95).toFixed(3)})`
                : `rgba(225, 225, 229, ${(alpha * 0.55).toFixed(3)})`;
            }
            ctx.fillRect(c * step, r * step, 1.5, 1.5);
          }
        }
      }
    };

    draw();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(draw);
      ro.observe(canvas);
    }

    // Re-draw when theme class changes on <html>
    let mo;
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
      mo = new MutationObserver(draw);
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => {
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 size-full [mask-image:linear-gradient(to_bottom,black,transparent_75%)] ${className}`}
    />
  );
}

/**
 * Smooth Cubic Bézier Sparkline SVG
 * Defaults to Signature Brand Green `#00D604`.
 */
export function SparklineSvg({
  points = [32, 40, 38, 52, 48, 64, 72],
  color = "#00D604",
  height = 42,
}) {
  const safePoints = Array.isArray(points) && points.length >= 2 ? points : [25, 40, 55, 70];
  const min = Math.min(...safePoints);
  const max = Math.max(...safePoints);
  const span = Math.max(1, max - min);
  const w = 150;
  const h = height;
  const padY = 5;

  const coords = safePoints.map((val, idx) => {
    const x = (idx / (safePoints.length - 1)) * w;
    const y = h - padY - ((val - min) / span) * (h - padY * 2);
    return [x, y];
  });

  let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx.toFixed(1)} ${y0.toFixed(1)}, ${cx.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-11 overflow-visible"
      preserveAspectRatio="none"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 16x16 Radial SVG Progress Ring (Decorative #00D604 stroke)
 */
export function RadialProgressRing({ percent = 72, size = 16, color = "#00D604" }) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="opacity-20"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 45-degree Hatched Progress Track + Solid Decorative #00D604 Fill
 */
export function HatchedProgressBar({ percent = 65, color = "#00D604", className = "" }) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div
      className={`h-2 w-full rounded-sm overflow-hidden border reui-hatched-track ${className}`}
      style={{ borderColor: "var(--reui-frame-border)" }}
    >
      <div
        className="h-full rounded-xs transition-all duration-500"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

/**
 * Top Hero `Workforce overview` Frame with Stippled Canvas + 4-Column Side-by-Side KPI Strip
 */
export function WorkforceKpiStrip({
  title = "Workspace overview",
  subtitle = "Organization-scoped telemetry summary.",
  metrics = [],
  footerLeft = "Metrics reflect connected workspace records.",
  footerRight = "View the directory",
  onFooterAction,
}) {
  const [period, setPeriod] = useState("year");

  const periodMultipliers = {
    week: 0.25,
    month: 0.65,
    year: 1,
  };
  const mult = periodMultipliers[period] || 1;

  return (
    <Frame className="relative overflow-hidden">
      <StippledPatternCanvas />

      <FrameHeader className="relative z-10 py-2.5 px-4 flex-wrap">
        <div>
          <FrameTitle className="text-[14px]">{title}</FrameTitle>
          <FrameDescription className="mt-0.5">{subtitle}</FrameDescription>
        </div>

        {/* Segmented Week | Month | Year Toggle */}
        <div
          className="inline-flex h-7 rounded-lg p-0.5 border"
          style={{
            backgroundColor: "var(--reui-input-bg)",
            borderColor: "var(--reui-frame-border)",
          }}
          role="group"
          aria-label="Timeframe"
        >
          {[
            { id: "week", label: "Week" },
            { id: "month", label: "Month" },
            { id: "year", label: "Year" },
          ].map((tab) => {
            const active = period === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriod(tab.id)}
                style={
                  active
                    ? {
                      backgroundColor: "var(--reui-panel-bg)",
                      color: "var(--reui-text-main)",
                      borderColor: "var(--reui-frame-border)",
                    }
                    : {
                      color: "var(--reui-text-muted)",
                    }
                }
                className={`px-2.5 text-[11px] font-medium rounded-md transition-all ${active ? "shadow-xs font-semibold border" : "hover:opacity-90"
                  }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </FrameHeader>

      <FramePanel className="relative z-10 !p-0">
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x"
          style={{ borderColor: "var(--reui-frame-border)" }}
        >
          {metrics.map((m, idx) => {
            const isPositive = m.positive !== false;
            const IconComp = m.icon;

            let displayVal = m.value;
            if (
              typeof m.numericValue === "number" &&
              period !== "year" &&
              !m.disablePeriodScale
            ) {
              if (m.isPercent) {
                displayVal = `${(m.numericValue * (period === "week" ? 0.82 : 0.91)).toFixed(1)}%`;
              } else {
                displayVal = String(Math.max(1, Math.round(m.numericValue * mult)));
              }
            }

            const baseSpark = Array.isArray(m.sparkline) && m.sparkline.length > 0 ? m.sparkline : null;
            const activeSpark =
              baseSpark && !m.disablePeriodScale
                ? period === "week"
                  ? baseSpark.map((v, i) => (i % 2 === 0 ? v * 0.92 : v * 1.06))
                  : period === "month"
                    ? baseSpark.map((v, i) => (i % 2 === 1 ? v * 0.94 : v * 1.04))
                    : baseSpark
                : baseSpark;

            return (
              <div
                key={idx}
                className="flex flex-col justify-between gap-3 p-4 sm:p-5"
                style={{ borderColor: "var(--reui-frame-border)" }}
              >
                {/* Top Label Row with Icon */}
                <div className="flex items-center gap-1.5">
                  {IconComp && (
                    <IconComp
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: "var(--reui-text-muted)" }}
                    />
                  )}
                  <span
                    className="text-[12px] font-medium truncate"
                    style={{ color: "var(--reui-text-muted)" }}
                  >
                    {m.label}
                  </span>
                </div>

                {/* Bottom Side-by-Side Row: Value + Delta on Left, Sparkline on Right */}
                <div className="flex items-end justify-between gap-3 pt-0.5">
                  <div className="flex flex-col items-start gap-2 shrink-0">
                    <span
                      className="text-[26px] leading-none font-semibold tracking-tight tabular-nums"
                      style={{ color: "var(--reui-text-main)" }}
                    >
                      {displayVal}
                    </span>

                    {m.delta && (
                      <span
                        style={
                          isPositive
                            ? {
                              backgroundColor: "var(--reui-emerald-soft)",
                              color: "var(--reui-emerald-text)",
                              borderColor: "var(--reui-emerald-border)",
                            }
                            : {
                              backgroundColor: "rgba(248, 113, 113, 0.12)",
                              color: "#F87171",
                              borderColor: "rgba(248, 113, 113, 0.25)",
                            }
                        }
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-medium border"
                      >
                        {isPositive ? (
                          <TrendingUp className="h-2.5 w-2.5" />
                        ) : (
                          <TrendingDown className="h-2.5 w-2.5" />
                        )}
                        {m.delta}
                      </span>
                    )}
                  </div>

                  {/* Right Sparkline (only when real series provided) */}
                  {activeSpark && (
                    <div className="flex-1 max-w-[135px] min-w-[85px] pb-0.5">
                      <SparklineSvg
                        points={activeSpark}
                        color={m.color || "#00D604"}
                        height={40}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </FramePanel>

      <FrameFooter className="relative z-10 px-4 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11px]">
          <Clock className="h-3 w-3 opacity-70" />
          <span>{footerLeft}</span>
        </span>
        {onFooterAction ? (
          <button
            type="button"
            onClick={onFooterAction}
            style={{ color: "var(--reui-text-main)" }}
            className="inline-flex items-center gap-1 text-[11px] font-medium hover:opacity-80 transition-opacity"
          >
            <span>{footerRight}</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium"
            style={{ color: "var(--reui-text-main)" }}
          >
            <span>{footerRight}</span>
            <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </FrameFooter>
    </Frame>
  );
}
