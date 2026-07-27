import { Button } from "@/components/ui/button";

import { PromptBox } from "@/components/atlas/prompt-box";
import { ATLAS_PROMPT_HEADER, ATLAS_VERSION } from "@/app/_constants/constants";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-h"
      className=" relative overflow-hidden h-svh"
    >
      <div className="relative mx-auto flex w-full max-w-xl flex-col items-center px-5 pt-26 pb-16 text-center sm:px-8 sm:pt-24 sm:pb-20 h-svh">
        <h1
          id="hero-h"
          className="animate-mm font-heading text-foreground text-3xl font-normal tracking-tight text-balance sm:text-4xl"
        >
          {ATLAS_PROMPT_HEADER}
        </h1>

        <div className="animate-mm animate-delay-100 mt-8 w-full text-left">
          <PromptBox />
        </div>
      </div>
    </section>
  );
}
