"use client";

import { Loader2, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { safeHttpUrl } from "@/lib/url";
import { api } from "@/trpc/react";

/**
 * Ship the space's current files to Railway.
 *
 * The build is detached — Railway keeps going after this request returns — so
 * success here means "handed off", and the URL appears once the service has a
 * domain. Saying "deployed" before the build finishes would be a lie the user
 * finds out about later.
 */
export function DeployButton({
  machineId,
  className,
}: {
  machineId: string;
  className?: string;
}) {
  const connections = api.connection.list.useQuery();
  const deploy = api.space.deploy.useMutation();

  const connected = connections.data?.connections.some(
    (c) => c.provider === "railway",
  );

  if (connections.isLoading) return null;

  if (!connected) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={className}
        nativeButton={false}
        render={<a href="/app/settings/connections" />}
      >
        <Rocket className="size-3.5" aria-hidden="true" />
        Connect Railway
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        className={className}
        disabled={deploy.isPending}
        onClick={() => deploy.mutate({ machineId })}
      >
        {deploy.isPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Rocket className="size-3.5" aria-hidden="true" />
        )}
        Deploy
      </Button>

      {deploy.error ? (
        <p className="text-destructive text-xs">{deploy.error.message}</p>
      ) : null}

      {deploy.data ? (
        deploy.data.ok ? (
          <p className="text-muted-foreground text-xs">
            Build started.{" "}
            {/* The URL is scraped from CLI output; never link a scheme we did
                not vet. */}
            {safeHttpUrl(deploy.data.url) ? (
              <a
                href={deploy.data.url!}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline"
              >
                {deploy.data.url!.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              "No domain yet."
            )}
          </p>
        ) : (
          <pre className="text-destructive max-w-xs overflow-x-auto text-[11px] whitespace-pre-wrap">
            {deploy.data.output.slice(-600)}
          </pre>
        )
      ) : null}
    </div>
  );
}
