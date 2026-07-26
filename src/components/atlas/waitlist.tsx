"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EllipseGradientBg } from "./gradient-card";

export function Waitlist() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
    }
  }

  return (
    <section
      id="waitlist"
      aria-labelledby="waitlist-h"
      className="mm-shell scroll-mt-14 py-6 sm:py-8"
    >
      <Card className="relative flex w-full items-center justify-center overflow-hidden rounded-lg border-0 bg-transparent py-0 shadow-none ring-0">
        <EllipseGradientBg seed="atlas-waitlist" veil="bg-black/40" />

        <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col items-start px-6 py-16 sm:px-10 sm:py-20 md:items-center md:text-center">
          <h2 id="waitlist-h" className="mm-title text-white">
            Join the marketplace
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70 sm:text-base">
            Whether you&apos;re buying data, hiring specialist agents, or
            publishing your own — we&apos;re opening access in cohorts.
          </p>

          {submitted ? (
            <p className="mt-8 text-[13px] text-white/80">
              Thank you — we&apos;ll be in touch.
            </p>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-8 flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center"
            >
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-9 flex-1 rounded-md border-0 bg-white/15 px-3 text-[13px] text-white shadow-none placeholder:text-white/45 focus-visible:ring-white/30"
              />
              <Button
                type="submit"
                className="h-9 shrink-0 rounded-md bg-white px-3.5 text-[13px] font-medium text-[#141414] hover:bg-white/90"
              >
                Request access
              </Button>
            </form>
          )}
        </div>
      </Card>
    </section>
  );
}
