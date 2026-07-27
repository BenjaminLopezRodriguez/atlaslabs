import { appOrigin, escapeHtml, sendEmail } from "@/server/email";

/**
 * The invite email: an accept link plus the two or three commands the invitee
 * runs to be useful.
 *
 * Same contract as a ping notification — the accept link is the mechanism, the
 * email is only the transport. A send failure leaves a valid invitation the
 * inviter can still share by hand, so this never throws.
 */
export type InviteEmailInput = {
  to: string;
  token: string;
  groupName: string;
  groupSlug: string;
  role: string;
  invitedBy: string;
  /** The machine the invitee is being pulled in to work on, if any. */
  machine?: { slug: string; id: string } | null;
};

export type InviteEmailResult = { delivered: boolean; error?: string };

export function acceptUrl(token: string): string {
  return `${appOrigin()}/invite?token=${encodeURIComponent(token)}`;
}

export async function sendInviteEmail(
  input: InviteEmailInput,
): Promise<InviteEmailResult> {
  const url = acceptUrl(input.token);
  return sendEmail({
    to: input.to,
    subject: input.machine
      ? `${input.invitedBy} invited you to work on ${input.machine.slug}`
      : `${input.invitedBy} invited you to ${input.groupName} on Atlas`,
    text: plainBody(input, url),
    html: htmlBody(input, url),
  });
}

/** The commands an invitee runs after accepting, in order. */
function steps(input: InviteEmailInput): string[] {
  return [
    "npm i -g @atlaslabsnpm/cli",
    "atlas login",
    `atlas group use ${input.groupSlug}`,
    ...(input.machine
      ? [
          `atlas machine list`,
          `atlas exec ${input.machine.slug} -- 'echo hello'`,
        ]
      : []),
  ];
}

function plainBody(input: InviteEmailInput, url: string): string {
  return [
    `${input.invitedBy} invited you to ${input.groupName} on Atlas as ${input.role}.`,
    "",
    `Accept: ${url}`,
    "",
    ...(input.machine
      ? [
          `You have been added to work on the machine "${input.machine.slug}" (id ${input.machine.id}).`,
          "",
        ]
      : []),
    "Then, from your terminal:",
    ...steps(input).map((s) => `  ${s}`),
    "",
    "The invite link expires in 7 days.",
  ].join("\n");
}

function htmlBody(input: InviteEmailInput, url: string): string {
  // Inline styles only — email clients strip <style> blocks.
  const machineLine = input.machine
    ? `<p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#16181d;">
         You are being added to the machine
         <strong>${escapeHtml(input.machine.slug)}</strong>
         <span style="color:#8a8f98;">(${escapeHtml(input.machine.id)})</span>.
       </p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e8eb;border-radius:12px;padding:28px;">
      <p style="margin:0 0 18px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a8f98;">
        Atlas &middot; ${escapeHtml(input.groupName)}
      </p>
      <p style="margin:0 0 22px;font-size:18px;line-height:1.5;color:#16181d;">
        ${escapeHtml(input.invitedBy)} invited you as
        <strong>${escapeHtml(input.role)}</strong>.
      </p>
      ${machineLine}
      <a href="${escapeHtml(url)}"
         style="display:inline-block;background:#16181d;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-size:14px;">
        Accept invite
      </a>
      <p style="margin:26px 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a8f98;">
        Then, from your terminal
      </p>
      <pre style="margin:0;padding:14px 16px;background:#f6f7f9;border:1px solid #e6e8eb;border-radius:8px;font-size:13px;line-height:1.7;color:#16181d;overflow-x:auto;">${steps(
        input,
      )
        .map((s) => escapeHtml(s))
        .join("\n")}</pre>
      <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#8a8f98;">
        The invite expires in 7 days.<br />
        If the button does not work: ${escapeHtml(url)}
      </p>
    </div>
  </body>
</html>`;
}
