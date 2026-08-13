"use client";

import Image from "next/image";
import { ChevronUpIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

type OverlayCardProps = {
  name: string;
  role: string;
  focus: string;
  bio: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
} & (
  | { kind: "photo"; image: string }
  | {
      kind: "logo";
      logo: string;
      ghostColor: string;
    }
);

/**
 * Media card with copy overlaid on a bottom backdrop gradient.
 * Bio is hover-reveal on desktop; mobile uses an about toggle popup.
 */
export function OverlayCard(props: OverlayCardProps) {
  const { name, role, focus, bio, className, sizes, priority } = props;
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "group relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-secondary",
        className,
      )}
      style={
        props.kind === "logo"
          ? {
              background: `linear-gradient(165deg, color-mix(in oklab, ${props.ghostColor} 22%, #eceae3) 0%, color-mix(in oklab, ${props.ghostColor} 10%, #f7f6f2) 42%, #fffcf7 100%)`,
            }
          : undefined
      }
    >
      {props.kind === "photo" ? (
        <Image
          src={props.image}
          alt={name}
          fill
          sizes={sizes ?? "(max-width: 640px) 100vw, 50vw"}
          className="object-cover object-top"
          priority={priority}
        />
      ) : (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(110% 80% at 28% 18%, color-mix(in oklab, ${props.ghostColor} 28%, transparent) 0%, transparent 58%)`,
            }}
          />
          <div className="absolute inset-x-0 top-[12%] flex justify-center px-8">
            <img
              src={props.logo}
              alt={`${name} logo`}
              className="h-[28%] w-full max-w-[8.5rem] object-contain opacity-[0.9]"
            />
          </div>
        </>
      )}

      {/* Backdrop gradient + copy */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink/90 via-ink/55 to-transparent pt-24 pb-5 transition-[padding] duration-300",
          open && "from-ink/95 via-ink/80 pt-32",
        )}
      >
        <div className="px-5 text-[#f7f6f2] sm:px-6">
          <p className="text-base font-medium tracking-tight">{name}</p>
          <p className="mt-0.5 text-sm text-[#f7f6f2]/80">{role}</p>
          <p className="mt-0.5 text-xs tracking-wide text-[#f7f6f2]/65 uppercase">
            {focus}
          </p>

          {/* Desktop: bio on hover */}
          <p
            className={cn(
              "mt-3 hidden text-sm leading-relaxed text-[#f7f6f2]/78 transition-opacity duration-300 md:block",
              "md:max-h-0 md:overflow-hidden md:opacity-0",
              "md:group-hover:max-h-40 md:group-hover:opacity-100",
              "md:group-focus-within:max-h-40 md:group-focus-within:opacity-100",
            )}
          >
            {bio}
          </p>

          {/* Mobile: about toggle */}
          <div className="mt-3 md:hidden">
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Hide about" : "About"}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#f7f6f2]/18 px-2.5 py-1.5 text-xs font-medium tracking-wide text-[#f7f6f2] uppercase backdrop-blur-sm transition-colors hover:bg-[#f7f6f2]/28"
            >
              about
              <ChevronUpIcon
                aria-hidden
                className={cn(
                  "size-3.5 transition-transform duration-200",
                  open ? "rotate-0" : "rotate-180",
                )}
              />
            </button>

            {open ? (
              <p className="mt-3 text-sm leading-relaxed text-[#f7f6f2]/78">
                {bio}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
