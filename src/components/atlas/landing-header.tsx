import { APP_LOGO_AND_NAME } from "@/app/_constants/constants";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "@phosphor-icons/react/ssr";
import { ArrowDown } from "lucide-react";

export function LandingHeader() {
  return (
    <header className="border-none bg-background/10 sticky top-0 z-50  backdrop-blur-sm">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        {/* APP_LOGO_AND_NAME renders its own <Link href="/">; wrapping it in
        another produces nested anchors and a hydration error. */}
        <APP_LOGO_AND_NAME />

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            nativeButton={false}
            render={<a href="/sign-in" />}
            className="rounded-full"
          >
            Sign in
          </Button>

          <Button
            nativeButton={false}
            render={<a href="/docs/cli" />}
            className="rounded-full px-4 py-5"
          >
            Get Atlas <ArrowDown className="size-4 inline-block ml-1" />
          </Button>
        </div>
      </div>
    </header>
  );
}
