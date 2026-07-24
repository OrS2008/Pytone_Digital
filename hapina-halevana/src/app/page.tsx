import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Hero } from "@/components/home/Hero";
import { Marquee } from "@/components/home/Marquee";
import { SignatureDishes } from "@/components/home/SignatureDishes";
import { StoryTeaser } from "@/components/home/StoryTeaser";
import { MenuTeaser } from "@/components/home/MenuTeaser";
import { Gallery } from "@/components/Gallery";
import { Reviews } from "@/components/home/Reviews";
import { LocationBlock } from "@/components/LocationBlock";
import { Faq } from "@/components/Faq";
import { OrderCta } from "@/components/home/OrderCta";
import { SectionHeading } from "@/components/SectionHeading";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Marquee />
      <SignatureDishes />
      <StoryTeaser />
      <MenuTeaser />

      {/* Gallery */}
      <section className="container-luxe py-24 md:py-32">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow="The gallery"
            title="Come hungry. Leave a regular."
            intro="A look inside the corner — the fire, the food, the faces that keep Yehud coming back."
          />
          <Link href="/gallery" className="group hidden items-center gap-2 text-sm text-gold md:flex">
            See the full gallery
            <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
        <div className="mt-14">
          <Gallery />
        </div>
      </section>

      <Reviews />

      {/* Location */}
      <section className="container-luxe py-24 md:py-32">
        <SectionHeading
          eyebrow="Find us"
          title="On the corner in Yehud"
          intro="Free parking, fully accessible, and open six days a week. Navigate in one tap."
          className="mb-14"
        />
        <LocationBlock />
      </section>

      {/* FAQ */}
      <section className="container-luxe pb-24 md:pb-32">
        <SectionHeading eyebrow="Good to know" title="Frequently asked" align="center" className="mb-12" />
        <Faq />
      </section>

      <OrderCta />
    </>
  );
}
