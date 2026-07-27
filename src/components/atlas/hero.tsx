import { Apple } from "lucide-react";

import { ATLAS_PROMPT_HEADER } from "@/app/_constants/constants";
import { PromptBox } from "@/components/atlas/prompt-box";
import { getSessionUser } from "@/server/auth";
import { listMachines } from "@/server/machines/store";

export async function Hero() {
  // Signed out, the composer's space control becomes a sign-in link, so there
  // is nothing to fetch and nothing to leak.
  const user = await getSessionUser();
  const spaces = user
    ? (await listMachines(user.id)).map((m) => ({
        id: m.id,
        slug: m.slug,
        status: m.status,
        workspaceId: m.workspaceId,
      }))
    : [];

  return (
    <section aria-labelledby="hero-h" className=" relative overflow-hidden h-svh">
      <div className="relative mx-auto flex w-full max-w-xl flex-col items-center px-5 pt-26 pb-16 text-center sm:px-8 sm:pt-24 sm:pb-20 h-svh">
        <h1
          id="hero-h"
          className="animate-mm font-heading text-foreground text-3xl font-normal tracking-tight text-balance sm:text-4xl"
        >
          {ATLAS_PROMPT_HEADER}
        </h1>

        <div className="animate-mm animate-delay-100 mt-8 w-full text-left">
          <PromptBox spaces={spaces} signedIn={!!user} />
        </div>

        {/* The "from anywhere" promise, stated where it is made. */}
        <p className="animate-mm animate-delay-200 text-muted-foreground border-border mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]">
          <Apple className="size-3.5" aria-hidden="true" />
          iOS app coming soon — keep building from your phone
        </p>
      </div>
    </section>
  );
}
