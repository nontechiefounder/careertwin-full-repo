/**
 * MovingBorder
 * Aceternity-inspired travelling light border using CSS animation.
 * Props:
 *   className   — className applied to the outer container
 *   innerClass  — className applied to the inner content wrapper
 *   as          — element to render (default: "div")
 *   children
 */
export default function MovingBorder({
  className = "",
  innerClass = "",
  children,
}) {
  return (
    <div className={`relative rounded-2xl p-[1px] overflow-hidden ${className}`}>
      {/* Rotating conic-gradient for the border */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: "conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(255,255,255,0.55) 60deg, transparent 120deg)",
          animation: "moving-border-spin 3.5s linear infinite",
        }}
      />
      {/* Inner fill — clips the gradient to just the border */}
      <div className={`relative rounded-[calc(1rem-1px)] z-10 ${innerClass}`}>
        {children}
      </div>

      <style>{`
        @keyframes moving-border-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
