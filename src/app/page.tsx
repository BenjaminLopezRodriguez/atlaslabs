import { Hero } from "@/components/atlas/hero";
import { Features } from "@/components/atlas/features";
import { HowItWorks } from "@/components/atlas/how-it-works";
import { Waitlist } from "@/components/atlas/waitlist";
import { Footer } from "@/components/atlas/footer";
import { LandingHeader } from "@/components/atlas/landing-header";

export default function Home() {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <main id="main">
        <LandingHeader />
        <Hero />
        <Features />
        <HowItWorks />
        <Waitlist />
      </main>
      <Footer />
    </div>
  );
}
