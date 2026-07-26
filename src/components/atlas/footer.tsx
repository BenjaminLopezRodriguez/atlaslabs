import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-border border-t">
      <div className="mm-shell flex flex-col gap-3 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-foreground text-[13px] font-medium tracking-tight">
            atlas
          </span>
          <span className="text-muted-foreground text-[12px]">
            Data and specialist agents.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="#product"
            className="text-muted-foreground hover:text-foreground text-[12px] transition-colors"
          >
            Marketplace
          </Link>
          <Link
            href="#"
            className="text-muted-foreground hover:text-foreground text-[12px] transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="#"
            className="text-muted-foreground hover:text-foreground text-[12px] transition-colors"
          >
            Terms
          </Link>
          <a
            href="mailto:hello@atlaslabs.com"
            className="text-muted-foreground hover:text-foreground text-[12px] transition-colors"
          >
            Contact
          </a>
          <span className="text-muted-foreground text-[12px]">
            &copy; {new Date().getFullYear()}
          </span>
        </div>
      </div>
    </footer>
  );
}
