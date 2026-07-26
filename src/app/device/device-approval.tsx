"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";

export function DeviceApproval({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [done, setDone] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = api.cli.approveDevice.useMutation({
    onSuccess: () => setDone("approved"),
    onError: (e) => setError(e.message),
  });
  const deny = api.cli.denyDevice.useMutation({
    onSuccess: () => setDone("denied"),
  });

  if (done === "approved") {
    return (
      <p className="mt-6 text-sm">
        CLI connected. Return to your terminal — you can close this tab.
      </p>
    );
  }
  if (done === "denied") {
    return <p className="mt-6 text-sm">Request denied.</p>;
  }

  return (
    <div className="mt-6 space-y-3">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="XXXX-XXXX"
        className="h-10 font-mono tracking-widest"
        autoFocus
      />
      <div className="flex gap-2">
        <Button
          className="h-9 rounded-md px-3.5 text-[13px]"
          disabled={approve.isPending || code.trim().length < 9}
          onClick={() => approve.mutate({ userCode: code })}
        >
          {approve.isPending ? "Approving…" : "Approve"}
        </Button>
        <Button
          variant="outline"
          className="h-9 rounded-md px-3.5 text-[13px]"
          disabled={deny.isPending || code.trim().length < 9}
          onClick={() => deny.mutate({ userCode: code })}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
