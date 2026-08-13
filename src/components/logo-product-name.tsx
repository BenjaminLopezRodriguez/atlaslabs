import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const logoProductNameVariants = cva(
  "inline-flex items-center text-foreground select-none",
  {
    variants: {
      /** Class categories for how the mark + name are stamped */
      variant: {
        /** Header / masthead stamp — used in the site chrome */
        hero: "gap-2.5",
        /** Compact inline mark for dense UI */
        compact: "gap-1.5",
        /** Quiet stamp for footers / secondary surfaces */
        stamp: "gap-2 opacity-90",
        /** Name-only wordmark */
        wordmark: "gap-0",
      },
      size: {
        sm: "",
        md: "",
        lg: "",
      },
    },
    compoundVariants: [
      {
        variant: "hero",
        size: "md",
        class: "[&_[data-slot=logo-mark]]:size-6 [&_[data-slot=logo-name]]:text-[1.35rem]",
      },
      {
        variant: "hero",
        size: "sm",
        class: "[&_[data-slot=logo-mark]]:size-5 [&_[data-slot=logo-name]]:text-[1.15rem]",
      },
      {
        variant: "hero",
        size: "lg",
        class: "[&_[data-slot=logo-mark]]:size-8 [&_[data-slot=logo-name]]:text-[1.75rem]",
      },
      {
        variant: "compact",
        size: "md",
        class: "[&_[data-slot=logo-mark]]:size-4 [&_[data-slot=logo-name]]:text-sm",
      },
      {
        variant: "stamp",
        size: "md",
        class: "[&_[data-slot=logo-mark]]:size-5 [&_[data-slot=logo-name]]:text-base",
      },
      {
        variant: "wordmark",
        size: "md",
        class: "[&_[data-slot=logo-name]]:text-[1.35rem]",
      },
    ],
    defaultVariants: {
      variant: "hero",
      size: "md",
    },
  },
);

export type LogoProductNameProps = {
  /** Product or brand name shown beside the mark */
  name: string;
  /**
   * Logo mark — image URL (masked to currentColor) or custom React node.
   * Omit for wordmark-only.
   */
  mark?: string | ReactNode;
  className?: string;
  nameClassName?: string;
  markClassName?: string;
} & VariantProps<typeof logoProductNameVariants>;

/**
 * Generalized logo + product name stamp.
 * Use `variant="hero"` for masthead / header regions.
 */
export function LogoProductName({
  name,
  mark,
  variant = "hero",
  size = "md",
  className,
  nameClassName,
  markClassName,
}: LogoProductNameProps) {
  const showMark = variant !== "wordmark" && mark != null;

  return (
    <span className={cn(logoProductNameVariants({ variant, size }), className)}>
      {showMark ? (
        typeof mark === "string" ? (
          <span
            data-slot="logo-mark"
            aria-hidden
            className={cn(
              "inline-block shrink-0 bg-current",
              markClassName,
            )}
            style={{
              WebkitMaskImage: `url(${mark})`,
              maskImage: `url(${mark})`,
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
            }}
          />
        ) : (
          <span data-slot="logo-mark" className={cn("inline-flex shrink-0", markClassName)}>
            {mark}
          </span>
        )
      ) : null}
      <span
        data-slot="logo-name"
        className={cn(
          "font-logo leading-none tracking-[-0.02em]",
          nameClassName,
        )}
      >
        {name}
      </span>
    </span>
  );
}

const ATLAS_MARK = "/brand/atlas-mark.png";

/**
 * Hero-region Atlas stamp — child of LogoProductName that always
 * links back to the landing page. Use in headers / mastheads.
 */
export function AtlasHeroLogo({
  className,
  size = "md",
}: {
  className?: string;
  size?: NonNullable<VariantProps<typeof logoProductNameVariants>["size"]>;
}) {
  return (
    <Link href="/" className={cn("hover:opacity-70", className)}>
      <LogoProductName
        name="atlas"
        mark={ATLAS_MARK}
        variant="hero"
        size={size}
      />
    </Link>
  );
}

/** @deprecated Prefer AtlasHeroLogo in chrome; LogoProductName elsewhere */
export function AtlasLogo({ className }: { className?: string }) {
  return <AtlasHeroLogo className={className} />;
}
