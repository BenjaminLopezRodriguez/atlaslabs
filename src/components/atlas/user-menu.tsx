"use client";

import { Boxes, CreditCard, LogOut, Settings } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/app/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type UserMenuUser = {
  name: string | null;
  email: string;
  image: string | null;
};

/** First letters of the name, else the email — never empty, never two spaces. */
function initials(user: UserMenuUser): string {
  const source = user.name?.trim() ?? "";
  if (source) {
    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]!.toUpperCase()).join("");
  }
  return (user.email[0] ?? "?").toUpperCase();
}

export function UserMenu({
  user,
  className,
}: {
  user: UserMenuUser;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "size-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted text-xs font-medium text-foreground/80 outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/30",
          className,
        )}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary IdP hosts, which next/image would need configured per-domain
          <img
            src={user.image}
            alt=""
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="grid size-full place-items-center">
            {initials(user)}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="px-2 py-1.5">
          <span className="block truncate text-sm text-foreground">
            {user.name ?? user.email}
          </span>
          {user.name ? (
            <span className="block truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          render={<Link href="/app/spaces" />}
          className="cursor-pointer"
        >
          <Boxes />
          Spaces
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href="/app/settings" />}
          className="cursor-pointer"
        >
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href="/app/plan" />}
          className="cursor-pointer"
        >
          <CreditCard />
          Plan
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* A form, not an onClick: sign-out is a state change, so it posts. */}
        <form action={signOutAction}>
          <DropdownMenuItem
            variant="destructive"
            className="w-full cursor-pointer"
            render={<button type="submit" />}
            closeOnClick={false}
          >
            <LogOut />
            Log out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
