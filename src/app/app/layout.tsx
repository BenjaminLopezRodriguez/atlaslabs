import { AppSidebar } from "@/components/atlas/app-sidebar";

/** Chat shell: persistent sidebar + scrollable main pane. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground flex h-svh overflow-hidden">
      <AppSidebar />
      <main id="main" className="min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
