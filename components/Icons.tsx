export const Chevron = ({ dir = "down", size = 14 }: { dir?: "down" | "left" | "right"; size?: number }) => {
  const d = { down: "M6 9l6 6 6-6", left: "M15 18l-6-6 6-6", right: "M9 18l6-6-6-6" }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
};
export const SearchIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
    <circle cx={11} cy={11} r={7} />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);
export const Check = ({ color = "#fff", size = 12 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5L20 7" />
  </svg>
);
/** The neon arrow mark (public/brand/logo.png). Black in the art blends away via mix-blend-mode. */
export const Mark = ({ size = 46 }: { size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src="/brand/logo.png" alt="" width={size} height={size} style={{ width: size, height: size }} />
);
export const DashArrow = () => (
  <svg width={150} height={14} viewBox="0 0 150 14" fill="none" aria-hidden="true">
    <path className="flow" d="M2 7h140" stroke="#42E3D4" strokeWidth={2.5} strokeDasharray="6 6" style={{ filter: "drop-shadow(0 0 4px #19B9B1)" }} />
    <path d="M136 1l8 6-8 6" stroke="#CCF1F7" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const SmallArrow = () => (
  <svg width={22} height={12} viewBox="0 0 22 12" fill="none" aria-hidden="true">
    <path d="M1 6h16M13 1l5 5-5 5" stroke="#42E3D4" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
