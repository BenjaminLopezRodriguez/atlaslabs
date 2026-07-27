import { ChatHome } from "@/app/app/w/[workspaceId]/t/[threadId]/chat-thread";

/**
 * Signed-in home — manycat-style center composer that morphs into a thread
 * on first send. Optional ?prompt= auto-starts (marketing return path).
 */
export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { prompt } = await searchParams;
  return <ChatHome initialPrompt={prompt?.trim() ?? undefined} />;
}
