"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";

export function WorkspaceChooser({ prompt }: { prompt: string }) {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const workspaces = api.workspace.list.useQuery();
  const create = api.specialist.createFromPrompt.useMutation({
    onSuccess: ({ specialist, threadId }) =>
      router.push(`/app/w/${specialist.workspaceId}/t/${threadId}`),
    onError: (e) => setError(e.message),
  });
  const createGroup = api.group.create.useMutation({
    onError: (e) => setError(e.message),
  });

  async function startInGroup() {
    const name = groupName.trim();
    if (!name) return;
    const group = await createGroup.mutateAsync({ name });
    // Group creation also created its workspace; refetch to find it.
    const fresh = await workspaces.refetch();
    const ws = fresh.data?.groupWorkspaces.find((w) => w.groupId === group.id);
    if (ws) create.mutate({ workspaceId: ws.id, prompt });
  }

  const busy = create.isPending || createGroup.isPending;

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <section>
        <h2 className="text-muted-foreground text-[13px] font-medium">
          Personal workspace
        </h2>
        <Button
          className="mt-2 h-9 rounded-md px-3.5 text-[13px]"
          disabled={busy || !workspaces.data}
          onClick={() =>
            create.mutate({
              workspaceId: workspaces.data!.personal.id,
              prompt,
            })
          }
        >
          {create.isPending ? "Creating…" : "Create in personal workspace"}
        </Button>
      </section>

      {workspaces.data && workspaces.data.groupWorkspaces.length > 0 && (
        <section>
          <h2 className="text-muted-foreground text-[13px] font-medium">
            Your Atlas Groups
          </h2>
          <ul className="mt-2 space-y-2">
            {workspaces.data.groupWorkspaces.map((ws) => (
              <li key={ws.id}>
                <Button
                  variant="outline"
                  className="h-9 rounded-md px-3.5 text-[13px]"
                  disabled={busy}
                  onClick={() => create.mutate({ workspaceId: ws.id, prompt })}
                >
                  {ws.group?.name ?? ws.name}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-muted-foreground text-[13px] font-medium">
          Create an Atlas Group
        </h2>
        <div className="mt-2 flex gap-2">
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Atlas Labs Engineering"
            className="h-9"
          />
          <Button
            variant="outline"
            className="h-9 shrink-0 rounded-md px-3.5 text-[13px]"
            disabled={busy || !groupName.trim()}
            onClick={startInGroup}
          >
            {createGroup.isPending ? "Creating…" : "Create group & start"}
          </Button>
        </div>
      </section>
    </div>
  );
}
