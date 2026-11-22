import SpotlightCard from "./SpotlightCard";

/**
 * BentoGrid + BentoCard
 *
 * Usage:
 *   <BentoGrid>
 *     <BentoCard featured icon={...} title="..." desc="..." />
 *     <BentoCard icon={...} title="..." desc="..." />
 *   </BentoGrid>
 */
export function BentoCard({
  icon: Icon,
  title,
  desc,
  tag,
  featured = false,
  extra = null,
  className = "",
}) {
  return (
    <SpotlightCard
      spotColor="rgba(255,255,255,0.04)"
      className={`
        rounded-2xl border border-white/[0.07] bg-white/[0.02]
        hover:border-white/[0.13] transition-all duration-300 group
        ${featured ? "md:col-span-2 md:row-span-2" : ""}
        ${className}
      `}
    >
      <div className="p-6 h-full flex flex-col">
        {tag && (
          <span className="inline-block text-[9px] font-mono text-white/25 uppercase tracking-[0.2em] border border-white/[0.07] px-2 py-0.5 rounded-full mb-5 w-fit">
            {tag}
          </span>
        )}
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-5 group-hover:bg-white/[0.07] transition-colors shrink-0">
            <Icon className="h-5 w-5 text-white/40 group-hover:text-white/60 transition-colors" />
          </div>
        )}
        <h3 className={`font-semibold text-white/80 mb-2 leading-snug ${featured ? "text-[18px] md:text-[22px]" : "text-[14px]"}`}>
          {title}
        </h3>
        <p className={`text-white/38 leading-relaxed flex-1 ${featured ? "text-[13px] md:text-[14px]" : "text-[12px]"}`}>
          {desc}
        </p>
        {extra && <div className="mt-5">{extra}</div>}
      </div>
    </SpotlightCard>
  );
}

export function BentoGrid({ children, className = "" }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[minmax(160px,auto)] ${className}`}>
      {children}
    </div>
  );
}
