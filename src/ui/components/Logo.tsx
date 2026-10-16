/** Logotipo: o símbolo de divisão num quadrado arredondado. */
export function Logo({ size = 28, inverted = false }: { size?: number; inverted?: boolean }) {
  const bg = inverted ? "#5bc5a7" : "#fff";
  const fg = inverted ? "#fff" : "#5bc5a7";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <rect x="2" y="2" width="60" height="60" rx="16" fill={bg} />
      <circle cx="32" cy="17.5" r="6" fill={fg} />
      <rect x="13" y="28.5" width="38" height="7" rx="3.5" fill={fg} />
      <circle cx="32" cy="46.5" r="6" fill={fg} />
    </svg>
  );
}
