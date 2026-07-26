import { DeviceApproval } from "./device-approval";

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <main className="bg-background text-foreground min-h-svh">
      <div className="mx-auto max-w-md px-4 pt-24">
        <h1 className="text-xl font-medium tracking-tight">
          Connect the Atlas CLI
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Approve the sign-in code shown in your terminal. Only approve codes
          you requested yourself.
        </p>
        <DeviceApproval initialCode={code ?? ""} />
      </div>
    </main>
  );
}
