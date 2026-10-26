// Círculo de color con el ícono de la categoría (como en Buddy).
import type { Visual } from "@/lib/visual";

export function CatIcon({ visual, size = 36, title }: { visual: Visual; size?: number; title?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-white"
      style={{ width: size, height: size, background: visual.color, fontSize: size * 0.48, lineHeight: 1 }}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      {visual.icon}
    </span>
  );
}
