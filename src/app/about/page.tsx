import Link from "next/link";

import { AtlasHeroLogo } from "@/components/logo-product-name";
import { OverlayCard } from "@/components/overlay-card";
import { PartnersCarousel } from "@/components/partners-carousel";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "About — Atlas Labs",
  description:
    "Atlas Labs builds specialist fine-tuned models. Founded by Benjamin Lopez and Collin Faber.",
};

const LIFE_URL = "https://atlaslabs.life";

const founders = [
  {
    name: "Benjamin Lopez",
    role: "Co-Founder · COO",
    focus: "Systems Engineering",
    image: "/team/benjamin-lopez.jpeg",
    bio: "Designs the infrastructure that turns raw work into closed, usable systems—from pipelines and verification to the product surfaces people actually open. At Atlas Labs he owns how specialist models ship into Life, Remote, and the physical stack.",
  },
  {
    name: "Collin Faber",
    role: "Co-Founder · CTO",
    focus: "Analytics & Security",
    image: "/team/collin-faber.png",
    bio: "Turns observations and training data into verifiable, trustworthy records. Responsible for the analytical and security layer that makes specialist fine-tunes safe enough to put in front of kids, crews, and customers.",
  },
] as const;

const partners = [
  {
    kind: "org" as const,
    name: "YC Advisors",
    role: "Advisor network",
    focus: "Y Combinator",
    mark: "YC",
    logo: "/partners/yc.svg",
    /** Complementary shade for tile background (not a second logo) */
    ghostColor: "#1BAEF2",
    bio: "Operator and founder advisors from the Y Combinator network.",
  },
  {
    kind: "org" as const,
    name: "DARPA",
    role: "Research partner",
    focus: "Defense Advanced Research Projects Agency",
    mark: "DARPA",
    logo: "/partners/darpa-mark-clear.png",
    /** Complementary shade for tile background (not a second logo) */
    ghostColor: "#8C571B",
    bio: "Engagement on advanced research problems where specialist models and ground truth matter.",
  },
  {
    kind: "org" as const,
    name: "FDA",
    role: "Regulatory partner",
    focus: "Food and Drug Administration",
    mark: "FDA",
    logo: "/partners/fda.svg",
    /** Complementary shade for tile background (not a second logo) */
    ghostColor: "#BA3E00",
    bio: "Alignment on safety, labeling, and compliant AI surfaces in regulated domains.",
  },
  {
    kind: "org" as const,
    name: "USDA",
    role: "Domain partner",
    focus: "United States Department of Agriculture",
    mark: "USDA",
    logo: "/partners/usda.svg",
    /** Complementary shade for tile background (not a second logo) */
    ghostColor: "#73001B",
    bio: "Agriculture and field systems—where specialist models meet soil, crop, and supply reality.",
  },
  {
    kind: "org" as const,
    name: "NIST",
    role: "Standards partner",
    focus: "National Institute of Standards and Technology",
    mark: "NIST",
    logo: "/partners/nist.svg",
    /** Complementary shade for tile background (not a second logo) */
    ghostColor: "#3F7373",
    bio: "Measurement, evaluation, and standards that keep specialist models trustworthy at scale.",
  },
  {
    kind: "org" as const,
    name: "NIBS",
    role: "Built-environment partner",
    focus: "National Institute of Building Sciences",
    mark: "NIBS",
    logo: "/partners/nibs.svg",
    /** Complementary shade for tile background (not a second logo) */
    ghostColor: "#734B16",
    bio: "Construction and building-science partners for models that understand the physical built world.",
  },
  {
    kind: "person" as const,
    name: "Elul Neddi",
    role: "Business Partner",
    focus: "Network",
    image: "/team/elul-neddi.jpeg",
    bio: "Network partner. Supports Atlas Labs through introductions and access outside day-to-day product and engineering.",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-6">
          <AtlasHeroLogo />
        <nav className="flex items-center gap-1">
          <Button
            nativeButton={false}
            render={<Link href="/#models" />}
            variant="ghost"
            className="hidden h-8 rounded-md px-2.5 text-sm font-normal text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            Models
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/about" />}
            variant="ghost"
            className="h-8 rounded-md px-2.5 text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            About
          </Button>
          <Button
            nativeButton={false}
            render={<a href="/sign-in" />}
            className="h-8 rounded-md bg-ink px-3 text-sm font-medium text-background hover:bg-ink/90"
          >
            Get Atlas
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto w-full max-w-3xl px-5 pt-16 pb-12 sm:px-6 sm:pt-24">
          <p className="mb-4 text-sm text-muted-foreground">Company</p>
          <h1 className="font-display text-[2.5rem] leading-[1.1] tracking-[-0.03em] sm:text-[3.5rem]">
            Models are only as good as the world they were taught to see.
          </h1>
          <div className="mt-8 space-y-5 text-[1.05rem] leading-relaxed text-muted-foreground">
            <p>
              Atlas Labs started from a simple failure mode: most AI systems
              reason about a world that was already easy to scrape, license, or
              photograph from orbit. The gaps—ground-level conditions, domains
              without tidy datasets, the places and people that never got
              recorded—compound with every model generation.
            </p>
            <p>
              We built our early work around closing that gap: systems that turn
              real observation into structured, verifiable records ready for
              training. That lineage still sits under everything we ship.
            </p>
            <p>
              Today Atlas Labs’ center of gravity is{" "}
              <span className="text-foreground">specialist fine-tuned LLMs</span>
              —models co-built with experts so they actually know a domain.{" "}
              <a
                href={LIFE_URL}
                className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                target="_blank"
                rel="noreferrer"
              >
                Atlas Life
              </a>{" "}
              is the consumer proof: a parent-held chatbot for kids, powered by
              a learning specialist that is safe by construction. Software,
              Remote, and hardware are how those models run jobs and, slowly,
              meet the physical world.
            </p>
            <p>
              We are not building another generic assistant. We are building
              models—and the thin products around them—that earn trust in the
              domains where mistakes matter.
            </p>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-6 sm:py-20">
            <p className="mb-3 text-sm text-muted-foreground">Team</p>
            <h2 className="font-display text-[2rem] tracking-[-0.02em] sm:text-[2.4rem]">
              The people building it
            </h2>
            <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
              Two founders run Atlas Labs day to day—product, systems, and the
              specialist models.
            </p>

            <ul className="mt-12 grid gap-12 sm:grid-cols-2 sm:gap-10">
              {founders.map((person) => (
                <li key={person.name}>
                  <OverlayCard
                    kind="photo"
                    name={person.name}
                    role={person.role}
                    focus={person.focus}
                    bio={person.bio}
                    image={person.image}
                    sizes="(max-width: 640px) 100vw, 50vw"
                    priority
                  />
                </li>
              ))}
            </ul>

            <div className="mt-16 border-t border-border pt-12">
              <p className="mb-2 text-sm text-muted-foreground">Partners</p>
              <p className="max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
                People and organizations who back Atlas Labs outside the
                founding team—investors, advisors, and network partners.
              </p>
              <PartnersCarousel partners={[...partners]} />
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-14 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div className="max-w-lg">
              <h2 className="font-display text-[1.75rem] tracking-[-0.02em]">
                See what we’re building
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Specialist models, Atlas Life, Remote, and the slow move into
                hardware—laid out on the home page.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                nativeButton={false}
                render={<Link href="/" />}
                className="h-9 rounded-md bg-ink px-4 text-sm font-medium text-background hover:bg-ink/90"
              >
                Back home
              </Button>
              <Button
                nativeButton={false}
                render={
                  <a href={LIFE_URL} target="_blank" rel="noreferrer" />
                }
                variant="outline"
                className="h-9 rounded-md px-4 text-sm font-medium"
              >
                Atlas Life
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
