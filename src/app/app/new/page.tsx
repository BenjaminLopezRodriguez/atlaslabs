import { PromptBox } from "@/components/atlas/prompt-box";
import { WorkspaceChooser } from "@/app/app/new/workspace-chooser";
import { ATLAS_PROMPT_HEADER } from "@/app/_constants/constants";

/**
 * Specialist creation inside the app shell. With no prompt, show the
 * composer; with a prompt, pick personal vs group workspace.
 */
export default async function NewSpecialistPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { prompt } = await searchParams;
  const trimmed = prompt?.trim();

  if (!trimmed) {
    return (
      <div className="height-full mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col justify-center overflow-y-auto px-6 py-10">
        <h1 className="text-foreground text-center text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {ATLAS_PROMPT_HEADER}
        </h1>
        <div className="mt-6 w-full">
          <PromptBox chatHref="/app/new" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl flex-1 overflow-y-auto px-6 pt-16 pb-16">
      <h1 className="text-xl font-medium tracking-tight">
        Where should this specialist live?
      </h1>
      <blockquote className="border-border text-muted-foreground mt-4 border-l-2 pl-3 text-sm leading-relaxed">
        {trimmed}
      </blockquote>
      <WorkspaceChooser prompt={trimmed} />
    </div>
  );
}
