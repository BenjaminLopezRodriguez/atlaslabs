import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { UserMenu } from "@/components/atlas/user-menu";
import { AtlasHeroLogo } from "@/components/logo-product-name";
import { PromptBox } from "@/components/prompt-box";
import {
  ProductCard,
  ProductGrid,
  SectionIntro,
  type ProductIconName,
} from "@/components/product-primitive";
import { Button } from "@/components/ui/button";
import { HydrateClient } from "@/trpc/server";

const LIFE_URL = "https://atlaslabs.life";

type Product = {
  name: string;
  blurb: string;
  icon: ProductIconName;
  tone: "clay" | "ink" | "sand";
};

const modelProducts: Product[] = [
  {
    name: "Kids / Learning",
    blurb:
      "Specialist behind Atlas Life—age-aware, safe by default, built to nourish curiosity without open-web risk.",
    icon: "kids",
    tone: "clay",
  },
  {
    name: "Subsurface Map",
    blurb:
      "Construction model for voids, rebar patterns, and utility risk in walls.",
    icon: "subsurface",
    tone: "ink",
  },
  {
    name: "Field Stress",
    blurb:
      "Agriculture model that flags crop stress and moisture anomalies from imaging.",
    icon: "field",
    tone: "sand",
  },
  {
    name: "Floor Habits",
    blurb:
      "Retail model that clusters buying patterns from consented store signals.",
    icon: "floor",
    tone: "clay",
  },
  {
    name: "Robotics Policy",
    blurb:
      "Train in-store or field robots from real captures, not synthetic-only demos.",
    icon: "robot",
    tone: "ink",
  },
];

const softwareProducts: Product[] = [
  {
    name: "Atlas Workspace",
    blurb: "The shared place captures, agents, and humans meet for a job.",
    icon: "workspace",
    tone: "clay",
  },
  {
    name: "Job Runner",
    blurb:
      "Plan a scan, flight, or floor pass; agents execute and report back.",
    icon: "runner",
    tone: "ink",
  },
  {
    name: "Capture Review",
    blurb:
      "Inspect wall maps, crop imagery, and floor signals before you commit.",
    icon: "review",
    tone: "sand",
  },
  {
    name: "Atlas CLI",
    blurb:
      "Drive the same workspace from a terminal when you’re already in the shell.",
    icon: "cli",
    tone: "clay",
  },
];

const remoteProducts: Product[] = [
  {
    name: "Agent Machine",
    blurb:
      "A dedicated VM for long agent loops—isolated rootfs, persistent workspace.",
    icon: "machine",
    tone: "clay",
  },
  {
    name: "Heavy Desk",
    blurb:
      "Spin up when the laptop can’t hold the fine-tune, the stitch, or the sim.",
    icon: "desk",
    tone: "ink",
  },
  {
    name: "Shared Session",
    blurb:
      "Invite a teammate onto the same machine and shell without shipping files around.",
    icon: "share",
    tone: "sand",
  },
];

const hardwareProducts: Product[] = [
  {
    name: "Wall Reader",
    blurb:
      "LiDAR and ultrasound for construction walls—find voids and utilities before you open them.",
    icon: "wall",
    tone: "clay",
  },
  {
    name: "Site Drone",
    blurb:
      "Survey passes that stitch into maps your crew can act on the same day.",
    icon: "drone",
    tone: "ink",
  },
  {
    name: "Soil Rover",
    blurb:
      "Ground-roving transect kit for moisture, compaction, and field samples.",
    icon: "rover",
    tone: "sand",
  },
  {
    name: "Crop Imager",
    blurb:
      "Imaging drones for stress, canopy, and irrigation decisions across rows.",
    icon: "crop",
    tone: "clay",
  },
  {
    name: "Uniform Sensor",
    blurb:
      "Wearable capture for retail floors and crews—motion, posture, and presence.",
    icon: "sensor",
    tone: "ink",
  },
  {
    name: "Edge Node",
    blurb:
      "On-site hardware for LLM and robotics workloads when the cloud is too far.",
    icon: "edge",
    tone: "sand",
  },
];

const domains = [
  {
    title: "Learning",
    body: "Atlas Life — a parent-held learning buddy powered by our kids specialist. Safe chat that grows with them and can link to school.",
    kit: "Kids / Learning · atlaslabs.life",
  },
  {
    title: "Construction",
    body: "Map walls and sites before you cut. Specialist models plus wall readers and site drones.",
    kit: "Subsurface Map · Wall Reader · Site Drone",
  },
  {
    title: "Agriculture",
    body: "Field models and kit that summarize moisture, stress, and next actions from real captures.",
    kit: "Field Stress · Soil Rover · Crop Imager",
  },
  {
    title: "Retail",
    body: "Floor signals and uniform sensors train habit models and in-store robotics on consented data.",
    kit: "Floor Habits · Uniform Sensor · Robotics Policy",
  },
] as const;

export default async function Home() {
  const { user } = await withAuth();
  const signedIn = Boolean(user);

  return (
    <HydrateClient>
      <div className="min-h-screen bg-background text-foreground">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-6">
          <AtlasHeroLogo />

          <nav className="flex items-center gap-1">
            <Button
              nativeButton={false}
              render={<Link href="#models" />}
              variant="ghost"
              className="hidden h-8 rounded-md px-2.5 text-sm font-normal text-muted-foreground hover:text-foreground md:inline-flex"
            >
              Models
            </Button>
            <Button
              nativeButton={false}
              render={
                <a href={LIFE_URL} target="_blank" rel="noreferrer" />
              }
              variant="ghost"
              className="hidden h-8 rounded-md px-2.5 text-sm font-normal text-muted-foreground hover:text-foreground md:inline-flex"
            >
              Life
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="#remote" />}
              variant="ghost"
              className="hidden h-8 rounded-md px-2.5 text-sm font-normal text-muted-foreground hover:text-foreground lg:inline-flex"
            >
              Remote
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/about" />}
              variant="ghost"
              className="hidden h-8 rounded-md px-2.5 text-sm font-normal text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              About
            </Button>
            {signedIn ? (
              <UserMenu
                user={{
                  name:
                    [user!.firstName, user!.lastName].filter(Boolean).join(" ") ||
                    null,
                  email: user!.email,
                  image: user!.profilePictureUrl ?? null,
                }}
                className="ml-1"
              />
            ) : (
              <Button
                nativeButton={false}
                render={<a href="/sign-in" />}
                variant="ghost"
                className="h-8 rounded-md px-2.5 text-sm font-normal text-muted-foreground hover:text-foreground"
              >
                Sign in
              </Button>
            )}
            <Button
              nativeButton={false}
              render={<a href={signedIn ? "/app" : "/sign-in"} />}
              className="h-8 rounded-md bg-ink px-3 text-sm font-medium text-background hover:bg-ink/90"
            >
              Get Atlas
            </Button>
          </nav>
        </header>

        <main>
          <section className="mx-auto flex w-full max-w-2xl flex-col items-center px-5 pt-20 pb-24 sm:px-6 sm:pt-28">
            <p className="mb-4 text-center text-sm text-muted-foreground">
              Specialist fine-tuned models
            </p>
            <h1 className="font-display mb-8 text-center text-[2.5rem] leading-[1.1] tracking-[-0.03em] sm:text-[3.25rem]">
              Models that know the domain. Products that use them.
            </h1>
            <PromptBox signedIn={signedIn} className="w-full" />
          </section>

          <section
            id="models"
            className="flex min-h-svh w-full scroll-mt-0 items-center bg-background"
          >
            <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8">
              <SectionIntro
                title="Specialist models"
                body="Our core: fine-tuned LLMs co-built with experts on consented data—so the system actually knows construction, fields, floors, and how kids learn."
              />
              <ProductGrid className="lg:grid-cols-3">
                {modelProducts.map((product) => (
                  <ProductCard
                    key={product.name}
                    name={product.name}
                    blurb={product.blurb}
                    icon={product.icon}
                    tone={product.tone}
                  />
                ))}
              </ProductGrid>
            </div>
          </section>

          <section
            id="life"
            className="flex min-h-svh w-full scroll-mt-0 items-center bg-secondary/45"
          >
            <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8">
              <SectionIntro
                title="Atlas Life"
                body="The consumer proof of our stack: a parent-held chatbot powered by our kids specialist—safe by default, grows with them, optional school link. Nourish the mind without open-web risk."
                action={
                  <Button
                    nativeButton={false}
                    render={
                      <a href={LIFE_URL} target="_blank" rel="noreferrer" />
                    }
                    className="h-10 shrink-0 rounded-md bg-ink px-5 text-sm font-medium text-background hover:bg-ink/90"
                  >
                    Open atlaslabs.life
                  </Button>
                }
              />
              <ProductGrid className="lg:grid-cols-3">
                <ProductCard
                  name="Safe by default"
                  blurb="Age-appropriate answers and tone—safety is how the specialist is asked to think, not a filter bolted on."
                  icon="kids"
                  tone="clay"
                />
                <ProductCard
                  name="Parents hold the account"
                  blurb="You set boundaries and can read conversations. Kids get space inside the household—no separate login to lose."
                  icon="share"
                  tone="ink"
                />
                <ProductCard
                  name="Grows with them"
                  blurb="Remembers what clicked, links to school when you want, and moves as they do."
                  icon="field"
                  tone="sand"
                />
              </ProductGrid>
            </div>
          </section>

          <section
            id="software"
            className="flex min-h-svh w-full scroll-mt-0 items-center bg-background"
          >
            <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8">
              <SectionIntro
                title="Software"
                body="Runtime for specialists and agents—workspaces, jobs, review, and CLI. How teams operate the models day to day."
              />
              <ProductGrid className="lg:grid-cols-2">
                {softwareProducts.map((product) => (
                  <ProductCard
                    key={product.name}
                    name={product.name}
                    blurb={product.blurb}
                    icon={product.icon}
                    tone={product.tone}
                  />
                ))}
              </ProductGrid>
            </div>
          </section>

          <section
            id="remote"
            className="flex min-h-svh w-full scroll-mt-0 items-center bg-ink text-[#f0eee6]"
          >
            <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8">
              <SectionIntro
                title="Remote"
                body="Dedicated cloud machines for fine-tunes, agents, and heavy software—isolated rootfs, persistent workspace, built for long loops."
                inverted
                action={
                  <Button
                    nativeButton={false}
                    render={<a href={signedIn ? "/app" : "/sign-in"} />}
                    className="h-10 shrink-0 rounded-md bg-[#f0eee6] px-5 text-sm font-medium text-ink hover:bg-white"
                  >
                    Get early access
                  </Button>
                }
              />
              <ProductGrid>
                {remoteProducts.map((product) => (
                  <ProductCard
                    key={product.name}
                    name={product.name}
                    blurb={product.blurb}
                    icon={product.icon}
                    inverted
                  />
                ))}
              </ProductGrid>
            </div>
          </section>

          <section
            id="hardware"
            className="flex min-h-svh w-full scroll-mt-0 items-center bg-secondary/45"
          >
            <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:px-8">
              <SectionIntro
                title="Hardware"
                body="We’re moving into the physical world so specialists train and run on real work—mapping, sensing, and edge compute. Expansion, not the core."
              />
              <ProductGrid className="lg:grid-cols-3">
                {hardwareProducts.map((product) => (
                  <ProductCard
                    key={product.name}
                    name={product.name}
                    blurb={product.blurb}
                    icon={product.icon}
                    tone={product.tone}
                  />
                ))}
              </ProductGrid>
            </div>
          </section>

          <section id="program" className="scroll-mt-24">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-14 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-16">
              <div className="max-w-xl">
                <h2 className="font-display text-[1.75rem] leading-tight tracking-[-0.02em] sm:text-[2rem]">
                  Rent hardware. Train models. Pay less.
                </h2>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-muted-foreground">
                  One loop among many: rent kit at a discount when you consent
                  to training on job data—so specialists get sharper where work
                  happens.
                </p>
              </div>
              <Button
                nativeButton={false}
                render={<a href={signedIn ? "/app" : "/sign-in"} />}
                variant="outline"
                className="h-9 shrink-0 rounded-md px-4 text-sm font-medium"
              >
                Ask about rental
              </Button>
            </div>
          </section>

          <section className="border-t border-border">
            <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4 sm:gap-8 sm:px-6 sm:py-16">
              {domains.map((domain) => (
                <div key={domain.title}>
                  <h3 className="font-display text-[1.25rem] tracking-[-0.02em]">
                    {domain.title}
                  </h3>
                  <p className="mt-2 text-[0.9rem] leading-relaxed text-muted-foreground">
                    {domain.body}
                  </p>
                  <p className="mt-3 text-[0.8rem] text-foreground/55">
                    {domain.kit}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </HydrateClient>
  );
}
