export const Chevron = ({ dir = "down", size = 14 }: { dir?: "down" | "left" | "right"; size?: number }) => {
  const d = { down: "M6 9l6 6 6-6", left: "M15 18l-6-6 6-6", right: "M9 18l6-6-6-6" }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
};
export const SearchIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#5B6070" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
    <circle cx={11} cy={11} r={7} />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);
export const Check = ({ color = "#fff", size = 12 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5L20 7" />
  </svg>
);
export const Mark = () => (
  <svg width={38} height={30} viewBox="0 0 38 30" fill="none" aria-hidden="true">
    <path d="M3 4l11 11L3 26" stroke="#2F4BFF" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 4l11 11-11 11" stroke="#FF7A1A" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const DashArrow = () => (
  <svg width={150} height={14} viewBox="0 0 150 14" fill="none" aria-hidden="true">
    <path d="M2 7h140" stroke="#FF7A1A" strokeWidth={3} strokeDasharray="6 6" />
    <path d="M136 1l8 6-8 6" stroke="#FF7A1A" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const SmallArrow = () => (
  <svg width={22} height={12} viewBox="0 0 22 12" fill="none" aria-hidden="true">
    <path d="M1 6h16M13 1l5 5-5 5" stroke="#FF7A1A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
