import { useRef, useState } from "react";

/**
 * SpotlightCard
 * Aceternity-inspired radial spotlight follows the cursor inside the card.
 * Props:
 *   className  — wrapper className
 *   spotColor  — rgba string for the spotlight color (default: subtle white)
 *   children
 */
export default function SpotlightCard({
  className = "",
  spotColor = "rgba(255,255,255,0.05)",
  children,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: "50%", y: "50%" });
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPos({ x: `${x}%`, y: `${y}%` });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative overflow-hidden ${className}`}
      style={{
        background: hovered
          ? `radial-gradient(circle at ${pos.x} ${pos.y}, ${spotColor} 0%, transparent 65%)`
          : undefined,
        transition: "background 0.04s",
      }}
    >
      {children}
    </div>
  );
}
