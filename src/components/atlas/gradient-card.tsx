import {
  generateEllipses,
  OPENAI_PALETTE,
  type EllipseConfig,
} from "@/lib/ellipse-gradient";
import { cn } from "@/lib/utils";

function EllipseGradientSvg({
  ellipses,
  baseColor,
  idPrefix,
}: {
  ellipses: EllipseConfig[];
  baseColor: string;
  idPrefix: string;
}) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 600 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ filter: "saturate(125%)" }}
    >
      <defs>
        {ellipses.map((ellipse, index) => (
          <radialGradient
            key={`${idPrefix}-grad-${index}`}
            id={`${idPrefix}-grad-${index}`}
            fx={ellipse.fx}
            fy={0.5}
          >
            <stop offset="0%" stopColor={ellipse.color} />
            <stop offset="100%" stopColor={ellipse.color} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill={baseColor} />
      {ellipses.map((ellipse, index) => (
        <rect
          key={`${idPrefix}-rect-${index}`}
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={`url(#${idPrefix}-grad-${index})`}
          transform={`translate(300 300) scale(${ellipse.scale[0]} ${ellipse.scale[1]}) skewX(${ellipse.skew}) rotate(${ellipse.rotation}) translate(${ellipse.translation[0]} ${ellipse.translation[1]}) translate(-300 -300)`}
        />
      ))}
    </svg>
  );
}

/** Full-bleed OpenAI-style ellipse gradient background. */
export function EllipseGradientBg({
  seed,
  veil = "bg-indigo-950/30",
  className,
}: {
  seed: string;
  veil?: string;
  className?: string;
}) {
  const ellipses = generateEllipses(seed, OPENAI_PALETTE);
  const idPrefix = `eg-${seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;

  return (
    <div
      className={cn("pointer-events-none absolute inset-0", className)}
      aria-hidden="true"
    >
      <EllipseGradientSvg
        ellipses={ellipses}
        baseColor={OPENAI_PALETTE[0]}
        idPrefix={idPrefix}
      />
      {veil ? <div className={cn("absolute inset-0", veil)} /> : null}
    </div>
  );
}

export function GradientCard({
  seed,
  id,
  className,
  children,
}: {
  seed: string;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      id={id}
      className={cn(
        "relative overflow-hidden rounded-lg p-6 sm:p-8",
        className,
      )}
    >
      <EllipseGradientBg seed={seed} veil="bg-indigo-950/25" />
      <div className="relative z-10">{children}</div>
    </article>
  );
}
