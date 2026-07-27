import { redirect } from "next/navigation";

/**
 * Legacy entry from the marketing prompt box / AuthKit return path.
 * The chooser now lives inside the signed-in app shell.
 */
export default async function NewSpecialistRedirect({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { prompt } = await searchParams;
  if (!prompt?.trim()) redirect("/app");
  redirect(`/app/new?prompt=${encodeURIComponent(prompt)}`);
}
