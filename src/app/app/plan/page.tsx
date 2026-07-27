import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/auth";

export const metadata = { title: "Plan · Atlas" };

/**
 * Placeholder. Atlas has no billing yet — this exists so the account menu has
 * somewhere real to land, and so the shape is here when plans are.
 */
export default async function PlanPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-xl font-medium tracking-tight">Plan</h1>
        <div className="mt-6 rounded-2xl border border-border px-4 py-6">
          <p className="text-sm">
            You are on <span className="font-medium">Free</span>.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Machines, specialists, and pings are unmetered while Atlas is in
            preview. Paid plans are not available yet.
          </p>
        </div>
      </div>
    </div>
  );
}
