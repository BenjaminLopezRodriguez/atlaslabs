"use client";

import { Bot, ChevronDown, Menu, MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { APP_LOGO_AND_NAME } from "@/app/_constants/constants";

const CREATE_MODES = [
  {
    id: "chat",
    label: "New chat",
    href: "/app",
    icon: MessageSquarePlus,
    match: (path: string) => path === "/app",
  },
  {
    id: "specialist",
    label: "New specialist",
    href: "/app/new",
    icon: Bot,
    match: (path: string) =>
      path === "/app/new" || path.startsWith("/app/new/"),
  },
] as const;

type NavItem = { key: string; label: string; href: string; active: boolean };

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
  /** True while the section's data is still loading, so it renders a skeleton. */
  pending: boolean;
  empty: string;
};

function activeMode(pathname: string) {
  return CREATE_MODES.find((m) => m.match(pathname)) ?? CREATE_MODES[0];
}

/**
 * Workspaces and threads for whichever surface is rendering.
 *
 * One hook, so the desktop rail and the mobile drawer cannot drift into
 * showing different workspaces or a different active row — they did, because
 * each used to build its own list from its own copy of these queries.
 */
function useNavSections(pathname: string): NavSection[] {
  const params = useParams<{ workspaceId?: string }>();
  const workspaces = api.workspace.list.useQuery();
  const workspaceId = params.workspaceId ?? workspaces.data?.personal.id;

  const threads = api.thread.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: Boolean(workspaceId) },
  );

  const workspaceItems: NavItem[] = workspaces.data
    ? [
        {
          key: workspaces.data.personal.id,
          label: "Personal",
          href: `/app/w/${workspaces.data.personal.id}`,
          active: workspaceId === workspaces.data.personal.id,
        },
        ...workspaces.data.groupWorkspaces.map((ws) => ({
          key: ws.id,
          label: ws.group?.name ?? ws.name,
          href: `/app/w/${ws.id}`,
          active: workspaceId === ws.id,
        })),
      ]
    : [];

  // Without a workspace there is no thread URL to build — an href containing
  // "undefined" is a 404 that looks like a working link.
  const threadItems: NavItem[] = workspaceId
    ? (threads.data ?? []).map((t) => {
        const href = `/app/w/${workspaceId}/t/${t.id}`;
        return { key: t.id, label: t.title, href, active: pathname === href };
      })
    : [];

  return [
    {
      id: "workspaces",
      label: "Workspaces",
      items: workspaceItems,
      pending: workspaces.isPending,
      empty: "No workspaces yet.",
    },
    {
      id: "threads",
      label: "Threads",
      items: threadItems,
      // A disabled query reports `isPending` forever; without a workspace there
      // is nothing being fetched, so that is not a loading state.
      pending: Boolean(workspaceId) && threads.isPending,
      empty: "No threads yet.",
    },
  ];
}

/**
 * Desktop rail. Mobile bottom bar + drawers live in `AppMobileChrome`
 * (same manycat architecture: sidebar on md+, drawers below main on mobile).
 */
export function AppSidebar() {
  const pathname = usePathname();
  const sections = useNavSections(pathname);

  return (
    <aside className="border-border bg-card/40 hidden w-64 shrink-0 flex-col border-r md:flex">
      {/* APP_LOGO_AND_NAME renders its own <Link href="/">; wrapping it in
          another produces nested anchors and a hydration error. */}
      <div className="flex h-14 shrink-0 items-center px-3">
        <APP_LOGO_AND_NAME href="/app" className="[&_h1]:text-lg" />
      </div>

      <div className="mx-2">
        <CreateModeMenu pathname={pathname} />
      </div>

      {sections.map((section) => (
        <nav
          key={section.id}
          aria-label={section.label}
          className={cn(
            "mt-4 px-2",
            // Threads is the list that grows, so it takes the leftover height.
            section.id === "threads" && "min-h-0 flex-1 overflow-y-auto pb-4",
          )}
        >
          <h2 className="text-muted-foreground px-2 text-[11px] font-medium tracking-wide uppercase">
            {section.label}
          </h2>
          <SectionBody section={section} />
        </nav>
      ))}
    </aside>
  );
}

function SectionBody({ section }: { section: NavSection }) {
  if (section.pending) {
    return (
      <ul className="mt-2 space-y-1.5 px-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="bg-muted h-4 animate-pulse rounded" />
        ))}
      </ul>
    );
  }
  if (!section.items.length) {
    return (
      <p className="text-muted-foreground mt-1 px-2 text-[13px]">
        {section.empty}
      </p>
    );
  }
  return (
    <ul className="mt-1 space-y-0.5">
      {section.items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            // Colour alone does not tell a screen reader which row is open.
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "block truncate rounded-md px-2 py-1.5 text-sm transition-colors",
              item.active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * manycat mobile chrome: bottom create-mode control + hamburger, each opening
 * a Base UI / shadcn Drawer (https://ui.shadcn.com/docs/components/base/drawer).
 */
export function AppMobileChrome() {
  const pathname = usePathname();
  const router = useRouter();
  const sections = useNavSections(pathname);

  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);

  const mode = activeMode(pathname);

  function go(href: string, close: (open: boolean) => void) {
    close(false);
    router.push(href);
  }

  return (
    <>
      <nav
        aria-label="App"
        className="border-border bg-background flex shrink-0 items-center gap-2 border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <button
          type="button"
          onClick={() => setCreateDrawerOpen(true)}
          className="hover:bg-muted flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition-colors"
        >
          <span className="bg-foreground/10 text-foreground flex size-6 shrink-0 items-center justify-center rounded-full">
            <mode.icon className="size-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {mode.label}
          </span>
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
        </button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="shrink-0"
          onClick={() => setNavMenuOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
      </nav>

      <Drawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        swipeDirection="down"
        showSwipeHandle
      >
        <DrawerContent className="max-h-[85dvh] md:hidden">
          <DrawerHeader className="text-left">
            <DrawerTitle>Create</DrawerTitle>
            <DrawerDescription className="sr-only">
              Choose what to create
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-3 pb-6">
            {CREATE_MODES.map((m) => (
              <MobileMenuItem
                key={m.id}
                label={m.label}
                active={m.id === mode.id}
                onClick={() => go(m.href, setCreateDrawerOpen)}
              >
                <m.icon className="size-4 shrink-0" aria-hidden="true" />
              </MobileMenuItem>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer
        open={navMenuOpen}
        onOpenChange={setNavMenuOpen}
        swipeDirection="down"
        showSwipeHandle
      >
        <DrawerContent className="max-h-[85dvh] md:hidden">
          <DrawerHeader className="text-left">
            {/* A drawer without a title is an unnamed dialog to a screen
                reader; hide it visually rather than dropping it. */}
            <DrawerTitle className="sr-only">Menu</DrawerTitle>
            <DrawerDescription className="sr-only">
              Workspaces and threads
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex max-h-[min(70dvh,28rem)] flex-col gap-1 overflow-y-auto px-3 pb-6">
            <div className="mb-2 px-3">
              <APP_LOGO_AND_NAME
                href="/app"
                className="[&_h1]:text-lg"
                onClick={() => setNavMenuOpen(false)}
              />
            </div>

            {sections.map((section) => (
              <div key={section.id}>
                <div className="bg-border my-2 h-px" />
                <p className="text-muted-foreground px-3 py-1.5 text-xs font-medium tracking-wide uppercase">
                  {section.label}
                </p>
                {section.pending ? (
                  <div className="space-y-1.5 px-3" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="bg-muted h-4 animate-pulse rounded"
                      />
                    ))}
                  </div>
                ) : section.items.length ? (
                  section.items.map((item) => (
                    <MobileMenuItem
                      key={item.key}
                      label={item.label}
                      active={item.active}
                      onClick={() => go(item.href, setNavMenuOpen)}
                    />
                  ))
                ) : (
                  <p className="text-muted-foreground px-3 py-2 text-[13px]">
                    {section.empty}
                  </p>
                )}
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function CreateModeMenu({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const active = activeMode(pathname);
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          "hover:bg-muted flex w-full min-w-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition-colors",
          "focus-visible:ring-ring/30 outline-none focus-visible:ring-2",
          active.match(pathname) && "bg-muted",
        )}
      >
        <span className="bg-foreground/10 text-foreground flex size-6 shrink-0 items-center justify-center rounded-full">
          <ActiveIcon className="size-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {active.label}
        </span>
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Create</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={active.id}
            onValueChange={(value) => {
              const next = CREATE_MODES.find((m) => m.id === value);
              if (!next) return;
              setOpen(false);
              router.push(next.href);
            }}
          >
            {CREATE_MODES.map((m) => (
              <DropdownMenuRadioItem key={m.id} value={m.id}>
                <m.icon className="size-4" aria-hidden="true" />
                {m.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileMenuItem({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children ? (
        <span className="flex size-5 shrink-0 items-center justify-center">
          {children}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
