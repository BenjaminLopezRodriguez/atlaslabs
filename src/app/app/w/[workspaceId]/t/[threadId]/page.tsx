import { ChatThread } from "./chat-thread";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ workspaceId: string; threadId: string }>;
}) {
  const { workspaceId, threadId } = await params;
  return <ChatThread workspaceId={workspaceId} threadId={threadId} />;
}
