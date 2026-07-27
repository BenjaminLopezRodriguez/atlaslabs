import { APP_LOGO_AND_NAME } from "@/app/_constants/constants";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { signOut, withAuth } from "@workos-inc/authkit-nextjs";

export async function LandingHeader() {
  const { user } = await withAuth();

  return (
    <header className="border-none bg-background/10 sticky top-0 z-50  backdrop-blur-sm">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        {/* APP_LOGO_AND_NAME renders its own <Link href="/">; wrapping it in
        another produces nested anchors and a hydration error. */}
        <APP_LOGO_AND_NAME />

        <div className="flex items-center gap-3">
          {user ? (
            /* Sign-out clears the session, so it is a POST: a GET would let a
            <Link> prefetch or an <img src> log the user out. */
            <form
              action={async () => {
                "use server";
                await signOut({ returnTo: "/" });
              }}
            >
              <Button type="submit" variant="ghost" className="rounded-full">
                Sign out
              </Button>
            </form>
          ) : (
            <Button
              variant="ghost"
              nativeButton={false}
              render={<a href="/sign-in" />}
              className="rounded-full"
            >
              Sign in
            </Button>
          )}

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
