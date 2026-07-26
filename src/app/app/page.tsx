import { PromptBox } from "@/components/atlas/prompt-box";

/**
 * Signed-in home. Workspace navigation lives in the shell sidebar, so this
 * pane is the composer itself — same entry point as the marketing hero.
 */
export default function AppHome() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-6 py-10">
      <h1 className="text-foreground text-center text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        What should your Atlas become an expert in?
      </h1>
      <div className="mt-6 w-full">
        <PromptBox />
      </div>
    </div>
  );
}
