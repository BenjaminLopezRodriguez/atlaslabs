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

type WorkspaceList = {
  personal: { id: string };
  groupWorkspaces: {
    id: string;
    name: string;
    group?: { name: string } | null;
  }[];
};

type ThreadList = { id: string; title: string }[];

/**
 * Desktop rail. Mobile bottom bar + drawers live in `AppMobileChrome`
 * (same manycat architecture: sidebar on md+, drawers below main on mobile).
 */
export function AppSidebar() {
  const pathname = usePathname();
  const params = useParams<{ workspaceId?: string; threadId?: string }>();

  const workspaces = api.workspace.list.useQuery();
  const workspaceId = params.workspaceId ?? workspaces.data?.personal.id;
  const threads = api.thread.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: Boolean(workspaceId) },
  );

  return (
    <aside className="border-border bg-card/40 hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="flex h-12 items-center px-3">
        <Link
          href="/app"
          className="font-heading text-foreground text-[15px] font-normal tracking-tight"
        >
          atlas
        </Link>
      </div>

      <div className="mx-2">
        <CreateModeMenu pathname={pathname} />
      </div>

      <SidebarNav
        pathname={pathname}
        workspaceId={workspaceId}
        workspaces={workspaces.data}
        threads={threads.data}
        threadsPending={threads.isPending}
      />
    </aside>
  );
}

/**
 * manycat mobile chrome: bottom create-mode control + hamburger, each opening
 * a Base UI / shadcn Drawer (https://ui.shadcn.com/docs/components/base/drawer).
 */
export function AppMobileChrome() {
  const pathname = usePathname();
  const params = useParams<{ workspaceId?: string; threadId?: string }>();
  const router = useRouter();

  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);

  const workspaces = api.workspace.list.useQuery();
  const workspaceId = params.workspaceId ?? workspaces.data?.personal.id;
  const threads = api.thread.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: Boolean(workspaceId) },
  );

  const activeMode =
    CREATE_MODES.find((m) => m.match(pathname)) ?? CREATE_MODES[0];

  function goCreate(href: string) {
    setCreateDrawerOpen(false);
    router.push(href);
  }

  function goNav(href: string) {
    setNavMenuOpen(false);
    router.push(href);
  }

  return (
    <>
      <nav className="border-border bg-background flex shrink-0 items-center gap-2 border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        <button
          type="button"
          onClick={() => setCreateDrawerOpen(true)}
          className="hover:bg-muted flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition-colors"
        >
          <span className="bg-foreground/10 text-foreground flex size-6 shrink-0 items-center justify-center rounded-full">
            <activeMode.icon className="size-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {activeMode.label}
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
            <DrawerTitle>{activeMode.label}</DrawerTitle>
            <DrawerDescription className="sr-only">
              Choose what to create
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-3 pb-6">
            <p className="text-muted-foreground px-3 py-1.5 text-xs font-medium">
              Create
            </p>
            {CREATE_MODES.map((m) => {
              const active = m.id === activeMode.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "hover:bg-muted/60 text-foreground",
                  )}
                  onClick={() => goCreate(m.href)}
                >
                  <m.icon className="size-4 shrink-0" aria-hidden="true" />
                  {m.label}
                </button>
              );
            })}
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
            {/* <DrawerTitle>Menu</DrawerTitle> */}
            <DrawerDescription className="sr-only">
              Workspaces and threads
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex max-h-[min(70dvh,28rem)] flex-col gap-1 overflow-y-auto px-3 pb-6">
            <Link
              href="/app"
              onClick={() => setNavMenuOpen(false)}
              className="font-heading text-foreground mb-2 px-3 py-1 text-[15px] font-normal tracking-tight"
            >
              <APP_LOGO_AND_NAME />
            </Link>

            <div className="bg-border my-2 h-px" />

            <p className="text-muted-foreground px-3 py-1.5 text-xs font-medium tracking-wide uppercase">
              Workspaces
            </p>
            {workspaces.data && (
              <MobileMenuItem
                label="Personal"
                active={workspaceId === workspaces.data.personal.id}
                onClick={() => goNav(`/app/w/${workspaces.data.personal.id}`)}
              />
            )}
            {workspaces.data?.groupWorkspaces.map((ws) => (
              <MobileMenuItem
                key={ws.id}
                label={ws.group?.name ?? ws.name}
                active={workspaceId === ws.id}
                onClick={() => goNav(`/app/w/${ws.id}`)}
              />
            ))}

            <div className="bg-border my-2 h-px" />

            <p className="text-muted-foreground px-3 py-1.5 text-xs font-medium tracking-wide uppercase">
              Threads
            </p>
            {threads.isPending && workspaceId ? (
              <div className="space-y-1.5 px-3" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-muted h-4 animate-pulse rounded" />
                ))}
              </div>
            ) : threads.data?.length ? (
              threads.data.map((t) => {
                const href = `/app/w/${workspaceId}/t/${t.id}`;
                return (
                  <MobileMenuItem
                    key={t.id}
                    label={t.title}
                    active={pathname === href}
                    onClick={() => goNav(href)}
                  />
                );
              })
            ) : (
              <p className="text-muted-foreground px-3 py-2 text-[13px]">
                No threads yet.
              </p>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function SidebarNav({
  pathname,
  workspaceId,
  workspaces,
  threads,
  threadsPending,
}: {
  pathname: string;
  workspaceId?: string;
  workspaces?: WorkspaceList;
  threads?: ThreadList;
  threadsPending: boolean;
}) {
  return (
    <>
      <nav aria-label="Workspaces" className="mt-4 px-2">
        <h2 className="text-muted-foreground px-2 text-[11px] font-medium tracking-wide uppercase">
          Workspaces
        </h2>
        <ul className="mt-1 space-y-0.5">
          {workspaces && (
            <WorkspaceLink
              href={`/app/w/${workspaces.personal.id}`}
              label="Personal"
              active={workspaceId === workspaces.personal.id}
            />
          )}
          {workspaces?.groupWorkspaces.map((ws) => (
            <WorkspaceLink
              key={ws.id}
              href={`/app/w/${ws.id}`}
              label={ws.group?.name ?? ws.name}
              active={workspaceId === ws.id}
            />
          ))}
        </ul>
      </nav>

      <nav
        aria-label="Threads"
        className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-4"
      >
        <h2 className="text-muted-foreground px-2 text-[11px] font-medium tracking-wide uppercase">
          Threads
        </h2>
        {threadsPending && workspaceId ? (
          <ul className="mt-2 space-y-1.5 px-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="bg-muted h-4 animate-pulse rounded" />
            ))}
          </ul>
        ) : threads?.length ? (
          <ul className="mt-1 space-y-0.5">
            {threads.map((t) => {
              const href = `/app/w/${workspaceId}/t/${t.id}`;
              return (
                <li key={t.id}>
                  <Link
                    href={href}
                    className={cn(
                      "block truncate rounded-md px-2 py-1.5 text-sm transition-colors",
                      pathname === href
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                    )}
                  >
                    {t.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-1 px-2 text-[13px]">
            No threads yet.
          </p>
        )}
      </nav>
    </>
  );
}

function CreateModeMenu({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const active = CREATE_MODES.find((m) => m.match(pathname)) ?? CREATE_MODES[0];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          "hover:bg-muted flex w-full min-w-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-black/10",
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

function WorkspaceLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "block truncate rounded-md px-2 py-1.5 text-sm transition-colors",
          active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        )}
      >
        {label}
      </Link>
    </li>
  );
}
