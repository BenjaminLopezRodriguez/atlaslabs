import Link from "next/link";

import { Button } from "@/components/ui/button";

export function Nav() {
  return (
    <header className="border-border/70 bg-background/75 absolute inset-x-0 top-0 z-20 border-b backdrop-blur-md">
      <div className="mm-shell flex h-12 items-center justify-between">
        <Link
          href="/"
          className="text-foreground text-[13px] font-medium tracking-tight"
        >
          atlas
        </Link>

        <nav className="flex items-center gap-1 sm:gap-1.5">
          <Link
            href="#product"
            className="text-muted-foreground hover:text-foreground hidden rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-black/[0.04] sm:inline"
          >
            Marketplace
          </Link>
          <Link
            href="#how-it-works"
            className="text-muted-foreground hover:text-foreground hidden rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-black/[0.04] sm:inline"
          >
            How it works
          </Link>
          <Link
            href="#waitlist"
            className="text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-black/[0.04]"
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
