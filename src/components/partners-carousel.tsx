"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { OverlayCard } from "@/components/overlay-card";

export type Partner =
  | {
      kind: "org";
      name: string;
      role: string;
      focus: string;
      mark: string;
      logo: string;
      ghostColor: string;
      bio: string;
    }
  | {
      kind: "person";
      name: string;
      role: string;
      focus: string;
      image: string;
      bio: string;
    };

export function PartnersCarousel({ partners }: { partners: Partner[] }) {
  return (
    <Carousel
      opts={{
        align: "start",
        loop: true,
        skipSnaps: false,
      }}
      className="mt-8 w-full"
    >
      <CarouselContent className="-ml-4">
        {partners.map((partner) => (
          <CarouselItem
            key={partner.name}
            className="basis-[78%] pl-4 sm:basis-1/2 lg:basis-1/3"
          >
            {partner.kind === "person" ? (
              <OverlayCard
                kind="photo"
                name={partner.name}
                role={partner.role}
                focus={partner.focus}
                bio={partner.bio}
                image={partner.image}
                sizes="(max-width: 640px) 78vw, (max-width: 1024px) 50vw, 33vw"
              />
            ) : (
              <OverlayCard
                kind="logo"
                name={partner.name}
                role={partner.role}
                focus={partner.focus}
                bio={partner.bio}
                logo={partner.logo}
                ghostColor={partner.ghostColor}
              />
            )}
          </CarouselItem>
        ))}
      </CarouselContent>

      <div className="mt-6 flex items-center gap-2">
        <CarouselPrevious
          variant="outline"
          className="static top-auto left-auto size-9 translate-y-0 rounded-md"
        />
        <CarouselNext
          variant="outline"
          className="static top-auto right-auto size-9 translate-y-0 rounded-md"
        />
      </div>
    </Carousel>
  );
}
