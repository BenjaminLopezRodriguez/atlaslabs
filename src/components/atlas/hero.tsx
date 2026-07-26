import { Button } from "@/components/ui/button";

import { PromptBox } from "@/components/atlas/prompt-box";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-h"
      className="mm-atmosphere relative overflow-hidden pt-12"
    >
      <div className="mm-shell relative mx-auto flex max-w-2xl flex-col items-center pt-16 pb-16 text-center sm:pt-24 sm:pb-20">
        <p className="animate-mm mm-display text-foreground">Atlas</p>

        <h1
          id="hero-h"
          className="animate-mm animate-delay-100 text-foreground/90 mt-5 text-2xl leading-snug tracking-tight text-balance sm:text-3xl"
        >
          What should your Atlas become an expert in?
        </h1>

        <p className="animate-mm animate-delay-200 text-muted-foreground mt-4 max-w-md text-base leading-relaxed">
          Build an AI that understands how you work. Create it in chat, connect
          your work through the Atlas CLI, collaborate in an Atlas Group, use it
          through an API.
        </p>

        <div className="animate-mm animate-delay-300 mt-8 w-full text-left">
          <PromptBox />
        </div>

        <div className="animate-mm animate-delay-300 mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Button
            variant="outline"
            className="border-border bg-card h-9 rounded-md px-3.5 text-[13px] font-medium shadow-none"
            render={<a href="/sign-in" />}
          >
            Sign in
          </Button>
          <Button
            variant="outline"
            className="border-border bg-card h-9 rounded-md px-3.5 text-[13px] font-medium shadow-none"
            render={<a href="/docs/cli" />}
          >
            Download Atlas CLI
          </Button>
        </div>
      </div>
    </section>
  );
}
