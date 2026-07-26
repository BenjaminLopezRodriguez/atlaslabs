import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mm-shell flex flex-col gap-3 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[13px] font-medium tracking-tight text-foreground">
            atlas
          </span>
          <span className="text-[12px] text-muted-foreground">
            Data and specialist agents.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="#product"
            className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Marketplace
          </Link>
          <Link
            href="#"
            className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy
          </Link>
          <Link
            href="#"
            className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Terms
          </Link>
          <a
            href="mailto:hello@atlaslabs.com"
            className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Contact
          </a>
          <span className="text-[12px] text-muted-foreground">
            &copy; {new Date().getFullYear()}
          </span>
        </div>
      </div>
    </footer>
  );
}
