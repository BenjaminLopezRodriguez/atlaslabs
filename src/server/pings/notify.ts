import type { PingChannel } from "@/server/db/schema";
import { escapeHtml, isEmailConfigured, sendEmail } from "@/server/email";

/**
 * How a ping reaches the human.
 *
 * Delivery is a transport for one thing: the reply link. The link is the actual
 * mechanism — a ping is answerable from it whether or not any provider is
 * configured — so a missing or failing transport degrades to "the link exists,
 * nobody was told" rather than losing the question.
 */
export type NotifyInput = {
  to: string;
  question: string;
  replyUrl: string;
  machineSlug: string;
  context?: string | null;
};

export type NotifyResult = {
  channel: PingChannel;
  delivered: boolean;
  error?: string;
};

export interface Notifier {
  readonly channel: PingChannel;
  /** Never throws — a transport failure must not lose the question. */
  send(input: NotifyInput): Promise<NotifyResult>;
}

/**
 * No transport configured. The ping is still fully answerable from its reply
 * link; this records that nobody was actively told.
 */
const linkOnlyNotifier: Notifier = {
  channel: "link",
  send() {
    return Promise.resolve({
      channel: "link" as const,
      delivered: false,
      error: "no notification transport configured; reply link only",
    });
  },
};

/** Email via Resend. The transport itself lives in `@/server/email`. */
const emailNotifier: Notifier = {
  channel: "email",
  async send(input) {
    const subject = input.context
      ? `[${input.machineSlug}] ${input.context}`
      : `A question about ${input.machineSlug}`;

    const { delivered, error } = await sendEmail({
      to: input.to,
      subject,
      text: plainBody(input),
      html: htmlBody(input),
    });
    return { channel: "email", delivered, error };
  },
};

function plainBody(input: NotifyInput): string {
  return [
    input.question,
    "",
    `Reply: ${input.replyUrl}`,
    "",
    `Asked by an agent working on "${input.machineSlug}". The link works once.`,
  ].join("\n");
}

function htmlBody(input: NotifyInput): string {
  // Inline styles only — email clients strip <style> blocks.
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e8eb;border-radius:12px;padding:28px;">
      <p style="margin:0 0 18px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a8f98;">
        Atlas &middot; ${escapeHtml(input.machineSlug)}
      </p>
      <p style="margin:0 0 22px;font-size:18px;line-height:1.5;color:#16181d;">
        ${escapeHtml(input.question)}
      </p>
      <a href="${escapeHtml(input.replyUrl)}"
         style="display:inline-block;background:#16181d;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-size:14px;">
        Reply
      </a>
      <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#8a8f98;">
        An agent is waiting on this. The link works once.<br />
        If the button does not work: ${escapeHtml(input.replyUrl)}
      </p>
    </div>
  </body>
</html>`;
}

export function getNotifier(): Notifier {
  // SMS is deliberately absent: it is not available through the marketplace,
  // so wiring it means a direct provider account.
  return isEmailConfigured() ? emailNotifier : linkOnlyNotifier;
}

export { isEmailConfigured };
