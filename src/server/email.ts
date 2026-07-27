/**
 * Outbound email via Resend's REST API.
 *
 * Called directly with `fetch` rather than through the SDK: one documented
 * endpoint, no dependency to keep current.
 *
 * The `from` address must be on a domain verified in Resend, otherwise every
 * send is rejected. `ATLAS_PING_FROM` overrides the default.
 *
 * Never throws. Every caller here is sending a notification *about* something
 * that already exists and is reachable by link — a transport failure must
 * degrade to "nobody was told", never to losing the thing itself.
 */
export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SendEmailResult = { delivered: boolean; error?: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { delivered: false, error: "RESEND_API_KEY is not set" };

  const from = process.env.ATLAS_PING_FROM ?? "Atlas <atlas@atlaslabs.id>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      // A hung provider must not hold the calling request open.
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // Resend returns { name, message } on error. Never echo the key.
      const detail = await res.text().catch(() => "");
      return {
        delivered: false,
        error: `resend ${res.status}: ${detail.slice(0, 300)}`,
      };
    }

    return { delivered: true };
  } catch (err) {
    return {
      delivered: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Anything user-supplied that goes into an HTML body must pass through this. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The public origin, trailing slash stripped. Shared by every emailed link. */
export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}
