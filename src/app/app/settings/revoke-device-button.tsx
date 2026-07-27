"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Signing out the current device ends the session you are reading this in, so
 * it says so rather than looking like the others.
 */
export function RevokeDeviceButton({
  isCurrent,
  action,
}: {
  isCurrent: boolean;
  action: () => Promise<void>;
}) {
  return (
    <form action={action}>
      <Submit isCurrent={isCurrent} />
    </form>
  );
}

function Submit({ isCurrent }: { isCurrent: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      className="rounded-full text-destructive"
    >
      {pending ? "Signing out…" : isCurrent ? "Sign out (this)" : "Sign out"}
    </Button>
  );
}
