"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Agent prose, rendered as markdown.
 *
 * Ported from manycat's `message-list.tsx`. Every element is styled here rather
 * than through a prose plugin: the thread is a chat, not an article, so the
 * scale is chat-sized and headings do not tower over the messages around them.
 *
 * Fenced code keeps the `language-` class so a highlighter can be dropped in
 * later without touching this file.
 */

const COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="text-foreground text-sm leading-relaxed wrap-break-word [&:not(:first-child)]:mt-2">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-foreground hover:text-foreground/80 underline underline-offset-2"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="marker:text-muted-foreground mt-2 list-disc pl-5 text-sm leading-relaxed first:mt-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="marker:text-muted-foreground mt-2 list-decimal pl-5 text-sm leading-relaxed first:mt-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="mt-0.5">{children}</li>,
  h1: ({ children }) => (
    <h1 className="mt-3 text-base font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-3 text-[15px] font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2.5 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-border mt-2 border-l-2 pl-3 text-sm italic first:mt-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border my-3" />,
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto first:mt-0">
      <table className="text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-border border-b px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-border border-b px-2 py-1">{children}</td>
  ),
  pre: ({ children }) => (
    <pre className="bg-code-background text-code-foreground border-code-border/50 my-2 overflow-x-auto rounded-lg border p-3 font-mono text-[13px] leading-relaxed first:mt-0">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    // Fenced code is already inside <pre>; only inline code gets a chip.
    if (className?.includes("language-")) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="bg-muted rounded px-1 py-0.5 font-mono text-[12px]">
        {children}
      </code>
    );
  },
};

export function AgentMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
}
