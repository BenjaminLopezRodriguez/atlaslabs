import { redirect } from "next/navigation";

import { WorkspaceChooser } from "@/app/new/workspace-chooser";

export default async function NewSpecialistPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { prompt } = await searchParams;
  if (!prompt?.trim()) redirect("/");

  return (
    <main className="bg-background text-foreground min-h-svh">
      <div className="mx-auto max-w-xl px-4 pt-20 pb-16">
        <h1 className="text-xl font-medium tracking-tight">
          Where should this specialist live?
        </h1>
        <blockquote className="border-border text-muted-foreground mt-4 border-l-2 pl-3 text-sm leading-relaxed">
          {prompt}
        </blockquote>
        <WorkspaceChooser prompt={prompt} />
      </div>
    </main>
  );
}
