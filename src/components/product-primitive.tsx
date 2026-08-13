import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const iconPaths = {
  wall: "M4 6h16v12H4z M8 6v12 M16 6v12 M4 12h16",
  drone: "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M5 8l3 2 M19 8l-3 2 M5 16l3-2 M19 16l-3-2",
  rover: "M5 15h14l-2 4H7z M7 15V9h10v6 M9 9V7h6v2",
  crop: "M12 4v16 M8 8c2 2 4 2 8 0 M8 13c2 2 4 2 8 0",
  sensor: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 3v2 M12 19v2 M3 12h2 M19 12h2",
  edge: "M7 7h10v10H7z M4 10h3 M17 10h3 M4 14h3 M17 14h3",
  workspace: "M4 6h16v12H4z M4 10h16",
  runner: "M5 12h10 M13 8l4 4-4 4",
  review: "M4 5h16v10H4z M8 19h8 M12 15v4",
  cli: "M5 8l4 4-4 4 M11 16h8",
  subsurface: "M4 18h16 M6 18c2-6 4-10 6-10s4 4 6 10",
  field: "M4 16c3-6 6-9 8-9s5 3 8 9 M4 16h16",
  floor: "M5 7h4v4H5z M15 7h4v4h-4z M10 13h4v4h-4z",
  robot: "M8 9h8v8H8z M10 6h4v3h-4z M10 17v2 M14 17v2",
  machine: "M6 8h12v10H6z M9 5h6v3H9z M9 12h6",
  desk: "M4 14h16v2H4z M6 8h12v6H6z",
  share: "M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M10.5 10.5l5 4",
  kids: "M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 20c1.5-3 3.5-4.5 6-4.5S16.5 17 18 20 M9 8.5c.5-1 1.2-1.5 2-1.5 M15 8.5c-.5-1-1.2-1.5-2-1.5",
} as const;

export type ProductIconName = keyof typeof iconPaths;

const tones = {
  clay: "bg-clay/15 text-clay",
  ink: "bg-ink/10 text-ink",
  sand: "bg-sand text-foreground/70",
  mist: "bg-[#f0eee6]/15 text-[#f0eee6]",
} as const;

export function ProductIcon({
  name,
  tone = "clay",
  className,
}: {
  name: ProductIconName;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
        tones[tone],
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d={iconPaths[name]} />
      </svg>
    </span>
  );
}

export function ProductCard({
  name,
  blurb,
  icon,
  tone = "clay",
  inverted = false,
  className,
}: {
  name: string;
  blurb: string;
  icon: ProductIconName;
  tone?: keyof typeof tones;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border p-5 shadow-[0_1px_0_rgba(20,20,19,0.03),0_12px_28px_-20px_rgba(20,20,19,0.35)]",
        inverted
          ? "border-[#f0eee6]/12 bg-[#1c1c1a]"
          : "border-border/80 bg-card",
        className,
      )}
    >
      <ProductIcon name={icon} tone={inverted ? "mist" : tone} />
      <div>
        <h3
          className={cn(
            "text-[0.98rem] font-semibold tracking-tight",
            inverted ? "text-[#f0eee6]" : "text-foreground",
          )}
        >
          {name}
        </h3>
        <p
          className={cn(
            "mt-1.5 text-[0.9rem] leading-relaxed",
            inverted ? "text-[#f0eee6]/65" : "text-muted-foreground",
          )}
        >
          {blurb}
        </p>
      </div>
    </article>
  );
}

export function ProductGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionIntro({
  title,
  body,
  inverted = false,
  action,
}: {
  title: string;
  body: string;
  inverted?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h2
          className={cn(
            "font-display text-[2.5rem] leading-[1.08] tracking-[-0.03em] sm:text-[3.5rem]",
            inverted ? "text-[#f0eee6]" : "text-foreground",
          )}
        >
          {title}
        </h2>
        <p
          className={cn(
            "mt-4 text-[1.05rem] leading-relaxed sm:text-[1.1rem]",
            inverted ? "text-[#f0eee6]/75" : "text-muted-foreground",
          )}
        >
          {body}
        </p>
      </div>
      {action}
    </div>
  );
}
