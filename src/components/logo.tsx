// Logo: dona del presupuesto repartida entre los dos, con el signo de pesos.
// Es el mismo dibujo de src/app/icon.svg (ícono de la app).
export function Logo({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} role="img" aria-label="Finanzas en pareja">
      <rect width="512" height="512" rx="112" fill="#0f766e" />
      <g transform="rotate(-90 256 256)" fill="none" strokeWidth="56">
        <circle cx="256" cy="256" r="150" stroke="#ccfbf1" opacity="0.35" />
        <circle cx="256" cy="256" r="150" stroke="#ffffff" strokeDasharray="560 943" strokeLinecap="round" />
        <circle cx="256" cy="256" r="150" stroke="#5eead4" strokeDasharray="222 943" strokeDashoffset="-640" strokeLinecap="round" />
      </g>
      <text x="256" y="300" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="150" fontWeight="700" fill="#ffffff">
        $
      </text>
    </svg>
  );
}
