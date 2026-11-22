/**
 * BackgroundBeams
 * Aceternity-inspired animated SVG beam lines radiating from a point.
 * Renders as an absolutely-positioned layer behind content.
 * Usage: wrap your section with relative + overflow-hidden, then place this inside.
 */
export default function BackgroundBeams({ className = "" }) {
  const beams = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    angle: (i / 16) * 360,
    length: 55 + (i % 4) * 8,
    opacity: 0.04 + (i % 3) * 0.015,
    delay: (i * 0.22).toFixed(2),
    duration: (3.5 + (i % 5) * 0.7).toFixed(1),
  }));

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Radial beams SVG */}
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.6 }}
      >
        <defs>
          <radialGradient id="beamGrad" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="white" stopOpacity="0.12" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Beam lines from center */}
        {beams.map(b => {
          const cx = 50, cy = 45;
          const rad = (b.angle * Math.PI) / 180;
          const x2 = cx + Math.cos(rad) * b.length;
          const y2 = cy + Math.sin(rad) * b.length;
          return (
            <line
              key={b.id}
              x1={`${cx}%`} y1={`${cy}%`}
              x2={`${x2}%`} y2={`${y2}%`}
              stroke="white"
              strokeOpacity={b.opacity}
              strokeWidth="1"
              style={{
                animation: `beam-pulse ${b.duration}s ease-in-out ${b.delay}s infinite`,
              }}
            />
          );
        })}

        {/* Soft radial glow at center */}
        <ellipse
          cx="50%" cy="45%"
          rx="30%" ry="20%"
          fill="url(#beamGrad)"
          style={{ animation: "glow-pulse 4s ease-in-out infinite" }}
        />
      </svg>

      {/* Subtle vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#030303] opacity-60" />

      <style>{`
        @keyframes beam-pulse {
          0%, 100% { stroke-opacity: var(--base-op, 0.04); }
          50%       { stroke-opacity: calc(var(--base-op, 0.04) * 3); }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
