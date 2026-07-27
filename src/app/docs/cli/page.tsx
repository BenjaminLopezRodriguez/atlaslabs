import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  Cpu,
  Download,
  Globe,
  Terminal,
} from "lucide-react";

import { CopyBlock } from "@/components/atlas/copy-block";
import { Footer } from "@/components/atlas/footer";
import { LandingHeader } from "@/components/atlas/landing-header";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Get Atlas — the Atlas CLI",
  description:
    "Install the Atlas CLI, sign in, and spin up a cloud machine you and your agents can work in together.",
};

const CLI_VERSION = "0.1.0";

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      {eyebrow ? (
        <p className="text-muted-foreground mb-2 font-mono text-[11px] tracking-widest uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-heading text-foreground text-2xl font-normal tracking-tight">
        {title}
      </h2>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="border-border text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]">
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-3 pb-2">
        <h3 className="text-foreground text-[15px] font-medium">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function CliDocsPage() {
  return (
    <>
      <LandingHeader />

      <main className="mm-shell max-w-3xl pb-24">
        {/* ---------------------------------------------------------- hero */}
        <div className="pt-14 pb-10">
          <p className="text-muted-foreground mb-3 font-mono text-[11px] tracking-widest uppercase">
            Atlas CLI · v{CLI_VERSION}
          </p>
          <h1 className="font-heading text-foreground text-4xl font-normal tracking-tight text-balance">
            Get Atlas
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl text-[15px] leading-7">
            One command installs a single self-contained file. Sign in, and you
            have a cloud machine you and your agents can work in together —
            with a public URL for anything you serve.
          </p>

          <div className="mt-7">
            <CopyBlock
              label="install"
              lines={["npm install -g @atlaslabsnpm/cli", "atlas login"]}
            />
            <p className="text-muted-foreground mt-2.5 text-[12px]">
              Requires Node.js 20+.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            <a
              href="/download/atlas.cjs"
              download
              className="text-foreground hover:text-muted-foreground inline-flex items-center gap-1.5 underline underline-offset-4 transition-colors"
            >
              <Download className="size-3.5" aria-hidden />
              Download directly
            </a>
            <a
              href="/install.sh"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 underline underline-offset-4 transition-colors"
            >
              Read the install script first
            </a>
            {/* The agent spec: drop it in ~/.claude/skills/atlas/SKILL.md (or any
                agent's skills dir) and the agent knows the whole CLI. */}
            <a
              href="/agents/skills/atlas_skill.md"
              download="SKILL.md"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 underline underline-offset-4 transition-colors"
            >
              <Download className="size-3.5" aria-hidden />
              SKILL.md for coding agents
            </a>
          </div>
        </div>

        <Separator />

        {/* ------------------------------------------------- other installs */}
        <div className="py-10">
          <Section id="install" eyebrow="Install" title="Other ways in">
            <div className="space-y-5">
              <div>
                <p className="text-muted-foreground mb-2 text-[13px]">
                  <strong className="text-foreground font-medium">
                    No npm.
                  </strong>{" "}
                  Installs one self-contained file. Goes to{" "}
                  <code className="font-mono">/usr/local/bin</code> when
                  writable, otherwise <code className="font-mono">~/.local/bin</code>
                  {" "}— never needs <code className="font-mono">sudo</code>, and
                  verifies a SHA-256 checksum before anything lands on your PATH.
                </p>
                <CopyBlock
                  lines={["curl -fsSL https://www.atlaslabs.id/install.sh | sh"]}
                />
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-[13px]">
                  <strong className="text-foreground font-medium">
                    Direct download.
                  </strong>{" "}
                  One file, no installer. Everything is bundled in — the only
                  requirement is Node.
                </p>
                <CopyBlock
                  lines={[
                    "curl -fsSL https://www.atlaslabs.id/download/atlas.cjs -o atlas.cjs",
                    "node atlas.cjs whoami",
                  ]}
                />
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-[13px]">
                  <strong className="text-foreground font-medium">
                    From source.
                  </strong>{" "}
                  If you have the repo checked out.
                </p>
                <CopyBlock
                  lines={[
                    "cd packages/cli && npm install && npm run bundle",
                    "node dist/atlas.cjs --help",
                  ]}
                />
              </div>
            </div>
          </Section>
        </div>

        <Separator />

        {/* -------------------------------------------------------- started */}
        <div className="py-10">
          <Section id="start" eyebrow="Getting started" title="Your first machine">
            <div className="space-y-6">
              <Step n={1} title="Sign in">
                <p className="text-muted-foreground text-[13px] leading-6">
                  Opens your browser and approves this device. The token goes to
                  your system keychain — you never paste a key anywhere.
                </p>
                <CopyBlock lines={["atlas login", "atlas whoami"]} />
              </Step>

              <Step n={2} title="Create a machine">
                <p className="text-muted-foreground text-[13px] leading-6">
                  The name is a slug: lowercase letters, numbers and dashes.
                  Running this twice is a clean conflict, never a second machine.
                </p>
                <CopyBlock lines={["atlas machine create my-app"]} />
              </Step>

              <Step n={3} title="Push your work and run it">
                <p className="text-muted-foreground text-[13px] leading-6">
                  Paths are relative to <code className="font-mono">/workspace</code>.
                  Everything after <code className="font-mono">--</code> runs on
                  the machine verbatim, and the exit code comes back to your
                  shell — so this fails your CI when the tests fail.
                </p>
                <CopyBlock
                  lines={[
                    "atlas put my-app ./server.js server.js",
                    "atlas exec my-app -- 'npm install && npm test'",
                  ]}
                />
              </Step>

              <Step n={4} title="Serve it and get a public URL">
                <p className="text-muted-foreground text-[13px] leading-6">
                  Bind to <code className="font-mono">0.0.0.0</code> on port{" "}
                  <strong className="text-foreground font-medium">3000</strong>{" "}
                  or <strong className="text-foreground font-medium">8000</strong> —
                  those are the ports routed from outside, and they are fixed
                  when the machine is created.
                </p>
                <CopyBlock
                  lines={[
                    "atlas exec my-app -- 'cd /workspace && (nohup node server.js >/tmp/dev.log 2>&1 &)'",
                    "atlas ports my-app",
                  ]}
                />
              </Step>

              <Step n={5} title="Stop it when you're done">
                <p className="text-muted-foreground text-[13px] leading-6">
                  Machines bill while they run. There is a 1-hour cap and a
                  5-minute idle timeout as a backstop, but stopping is the habit.
                  Stopping is final — the filesystem does not survive, so pull
                  anything you want to keep first.
                </p>
                <CopyBlock
                  lines={[
                    "atlas get my-app dist/build.zip ./build.zip",
                    "atlas machine rm my-app",
                  ]}
                />
              </Step>
            </div>
          </Section>
        </div>

        <Separator />

        {/* -------------------------------------------------------- coworking */}
        <div className="py-10">
          <Section
            id="coworking"
            eyebrow="How it works"
            title="Coworking with Atlas"
          >
            <p className="text-muted-foreground text-[14px] leading-7">
              Most tools make an agent work <em>on</em> your machine. Atlas gives
              you and your agents a third place: a machine that belongs to the
              work, not to either of you. You both reach it through the same
              commands, and neither of you has to be online for it to keep
              existing.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Terminal,
                  title: "One surface",
                  body: "You type atlas exec. Your agent runs the same command. There is no separate agent API to drift out of sync with what you can do by hand.",
                },
                {
                  icon: Cpu,
                  title: "Off your laptop",
                  body: "Installs, builds and dev servers run in the cloud. Your fan stays quiet, and closing the lid does not kill the run.",
                },
                {
                  icon: Globe,
                  title: "Ends in a URL",
                  body: "Anything you serve on port 3000 or 8000 gets a public HTTPS address. The handoff is a link, not \"works on my machine\".",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="border-border bg-card rounded-xl border p-4"
                >
                  <Icon className="text-muted-foreground mb-3 size-4" aria-hidden />
                  <h3 className="text-foreground text-[13px] font-medium">
                    {title}
                  </h3>
                  <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-6">
                    {body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 space-y-5">
              <div>
                <h3 className="text-foreground text-[15px] font-medium">
                  Give your agent the same machine
                </h3>
                <p className="text-muted-foreground mt-1.5 text-[13px] leading-7">
                  Point your coding agent at the workspace and it can drive the
                  machine directly — push files, run builds, read logs, hand back
                  the URL. Because it uses the CLI you already approved, you are
                  not clicking through a new permission prompt for every command
                  it invents.
                </p>
                <CopyBlock
                  className="mt-3"
                  lines={[
                    "atlas machine create my-app",
                    "# then, to your agent: \"build the landing page on my-app and send me the URL\"",
                  ]}
                />
              </div>

              <div>
                <h3 className="text-foreground text-[15px] font-medium">
                  Everything is attributed
                </h3>
                <p className="text-muted-foreground mt-1.5 text-[13px] leading-7">
                  Every device that signs in gets its own identity, and every
                  command, upload and agent run is recorded against it. When two
                  people and three agents share a workspace, &ldquo;who ran
                  that?&rdquo; has an answer. Revoke a device and its access ends
                  immediately, everywhere.
                </p>
                <CopyBlock className="mt-3" lines={["atlas device list"]} />
              </div>

              <div>
                <h3 className="text-foreground text-[15px] font-medium">
                  Open it in Atlas Browser
                </h3>
                <p className="text-muted-foreground mt-1.5 text-[13px] leading-7">
                  A workspace has its own address. Hand it to Atlas Browser and
                  you get the terminal, files and a live preview in one window,
                  pointed at the same machine your agent is using.
                </p>
                <CopyBlock className="mt-3" lines={["atlas open my-app"]} />
              </div>
            </div>
          </Section>
        </div>

        <Separator />

        {/* -------------------------------------------------------- reference */}
        <div className="py-10">
          <Section id="reference" eyebrow="Reference" title="Command reference">
            <div className="border-border overflow-hidden rounded-xl border">
              <table className="w-full text-left text-[13px]">
                <tbody>
                  {[
                    ["atlas login", "Sign in on this device"],
                    ["atlas whoami", "Who you are signed in as"],
                    ["atlas machine create <slug>", "Provision a machine"],
                    ["atlas machine list", "Your machines and their status"],
                    ["atlas machine status <slug>", "Status and ports"],
                    ["atlas machine rm <slug>", "Terminate it"],
                    ["atlas exec <slug> -- <cmd>", "Run a command; mirrors its exit code"],
                    ["atlas put <slug> <local> <remote>", "Upload a file"],
                    ["atlas get <slug> <remote> [local|-]", "Download a file"],
                    ["atlas ports <slug>", "Public URLs for the machine"],
                    ["atlas open <slug>", "Open in Atlas Browser"],
                    ["atlas device list | rm <id>", "Signed-in devices; revoke one"],
                  ].map(([cmd, desc]) => (
                    <tr key={cmd} className="border-border/70 border-b last:border-0">
                      <td className="text-foreground w-1/2 px-4 py-2.5 align-top font-mono text-[12.5px] whitespace-nowrap">
                        {cmd}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 align-top">
                        {desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* The text lives in its own <span>: with `flex gap-2` on the row,
            every inline child becomes a flex item and inline <code> picks up a
            stray gap on both sides. */}
            <div className="text-muted-foreground mt-6 space-y-2 text-[12.5px] leading-6">
              {[
                <>
                  Machines run Debian 12 as root in{" "}
                  <code className="font-mono">/workspace</code>, with Node 22,
                  pnpm, Python 3.13, git and build tools preinstalled. Install
                  anything else with <code className="font-mono">apt-get</code>.
                </>,
                <>
                  Machines cannot be suspended and resumed. Stopping one is
                  final.
                </>,
                <>
                  Public URLs are unguessable but unauthenticated — treat a
                  machine&rsquo;s URL as shareable with anyone who has the link.
                </>,
              ].map((note, i) => (
                <p key={i} className="flex gap-2">
                  <CircleCheck
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden
                  />
                  <span>{note}</span>
                </p>
              ))}
            </div>
          </Section>
        </div>

        <div className="border-border bg-card mt-4 flex flex-col gap-3 rounded-xl border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-foreground text-[15px] font-medium">
              Ready to start?
            </h3>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Install, sign in, and create your first machine in about a minute.
            </p>
          </div>
          <Link
            href="/sign-in"
            className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
          >
            Create an account
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </main>

      <Footer />
    </>
  );
}
