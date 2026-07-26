import Link from "next/link";

import { Button } from "@/components/ui/button";

export function Nav() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 border-b border-border/70 bg-background/75 backdrop-blur-md">
      <div className="mm-shell flex h-12 items-center justify-between">
        <Link
          href="/"
          className="text-[13px] font-medium tracking-tight text-foreground"
        >
          atlas
        </Link>

        <nav className="flex items-center gap-1 sm:gap-1.5">
          <Link
            href="#product"
            className="hover:bg-black/[0.04] hidden rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Marketplace
          </Link>
          <Link
            href="#how-it-works"
            className="hover:bg-black/[0.04] hidden rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            How it works
          </Link>
          <Link
            href="#waitlist"
            className="hover:bg-black/[0.04] rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Waitlist
          </Link>
          <Button
            size="sm"
            className="ml-1.5 h-7 rounded-md px-2.5 text-[13px] font-medium shadow-xs"
            render={<a href="#waitlist" />}
          >
            Request access
          </Button>
        </nav>
      </div>
    </header>
  );
}
