import { AppMobileChrome, AppSidebar } from "@/components/atlas/app-sidebar";

/**
 * Chat shell — manycat architecture:
 * desktop rail | main
 * mobile: main stacked above bottom bar + Base UI drawers
 * @see https://ui.shadcn.com/docs/components/base/drawer
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground flex h-svh flex-col overflow-hidden md:flex-row">
      <AppSidebar />
      <main
        id="main"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        {children}
      </main>
      <AppMobileChrome />
    </div>
  );
}
