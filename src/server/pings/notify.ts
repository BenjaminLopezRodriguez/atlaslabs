import type { PingChannel } from "@/server/db/schema";

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
 *
 * Email arrives via the Resend marketplace integration — once
 * `RESEND_API_KEY` is present this is replaced by the email notifier.
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

export function getNotifier(): Notifier {
  // SMS is deliberately absent: it is not available through the marketplace,
  // so wiring it means a direct provider account. Email first.
  return linkOnlyNotifier;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
