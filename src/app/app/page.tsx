import { ChatHome } from "@/app/app/w/[workspaceId]/t/[threadId]/chat-thread";

/**
 * Signed-in home — manycat-style center composer that morphs into a thread
 * on first send. Optional ?prompt= auto-starts (marketing return path), and
 * ?space= carries the space picked in the landing composer.
 */
export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string; space?: string }>;
}) {
  const { prompt, space } = await searchParams;
  return (
    <ChatHome
      initialPrompt={prompt?.trim() ?? undefined}
      initialSpaceId={space?.trim() ?? undefined}
    />
  );
}
