"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Status = "pending" | "answered" | "expired" | "cancelled";

export function PingReply({
  token,
  question,
  context,
  status,
  existingAnswer,
  askedAt,
}: {
  token: string;
  question: string;
  context: string | null;
  status: Status;
  existingAnswer: string | null;
  askedAt: string;
}) {
  const [answer, setAnswer] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/v1/pings/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, answer }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError("Could not reach Atlas. Check your connection and try again.");
      setState("idle");
    }
  }

  const asked = new Date(askedAt).toLocaleString();

  if (state === "sent") {
    return (
      <Answered
        question={question}
        answer={answer}
        note="Sent. The agent picks this up on its next check — you can close this."
      />
    );
  }

  if (status === "answered") {
    return (
      <Answered
        question={question}
        answer={existingAnswer ?? ""}
        note="This was already answered. A reply link works once."
      />
    );
  }

  if (status === "expired" || status === "cancelled") {
    return (
      <div>
        <Question question={question} context={context} asked={asked} />
        <p className="text-muted-foreground mt-6 text-[14px] leading-7">
          {status === "expired"
            ? "This question timed out, so the agent stopped waiting and carried on. Nothing is broken — reply in your chat if it still matters."
            : "This question was cancelled."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Question question={question} context={context} asked={asked} />

      <form onSubmit={submit} className="mt-6">
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        <Textarea
          id="answer"
          autoFocus
          rows={4}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer…"
          className="w-full"
        />

        {error ? (
          <p className="text-destructive mt-3 text-[13px]">{error}</p>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <Button
            type="submit"
            disabled={!answer.trim() || state === "sending"}
            className="rounded-full px-5"
          >
            {state === "sending" ? "Sending…" : "Send reply"}
          </Button>
          <span className="text-muted-foreground text-[12px]">
            Goes straight back to the agent.
          </span>
        </div>
      </form>
    </div>
  );
}

function Question({
  question,
  context,
  asked,
}: {
  question: string;
  context: string | null;
  asked: string;
}) {
  return (
    <>
      {context ? (
        <p className="text-muted-foreground mb-2 font-mono text-[11px] tracking-widest uppercase">
          {context}
        </p>
      ) : null}
      <h1 className="font-heading text-foreground text-2xl leading-9 font-normal tracking-tight text-balance">
        {question}
      </h1>
      <p className="text-muted-foreground mt-3 text-[12px]">Asked {asked}</p>
    </>
  );
}

function Answered({
  question,
  answer,
  note,
}: {
  question: string;
  answer: string;
  note: string;
}) {
  return (
    <div>
      <h1 className="font-heading text-foreground text-2xl leading-9 font-normal tracking-tight text-balance">
        {question}
      </h1>
      <div className="border-border bg-muted/40 mt-5 rounded-xl border px-4 py-3">
        <p className="text-muted-foreground mb-1 font-mono text-[11px] tracking-widest uppercase">
          Your answer
        </p>
        <p className="text-foreground text-[14px] leading-7 whitespace-pre-wrap">
          {answer}
        </p>
      </div>
      <p className="text-muted-foreground mt-4 text-[13px]">{note}</p>
    </div>
  );
}
