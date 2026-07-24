import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { LocationBlock } from "@/components/LocationBlock";
import { Faq } from "@/components/Faq";
import { SectionHeading } from "@/components/SectionHeading";
import { OrderCta } from "@/components/home/OrderCta";
import { restaurant } from "@/content/restaurant";

export const metadata: Metadata = {
  title: "Location & Hours",
  description: `Visit HaPina HaLevana at ${restaurant.address.street}, ${restaurant.address.city}. Opening hours, free parking, accessibility, and one-tap Waze & Google Maps directions.`,
  alternates: { canonical: "/location" },
};

export default function LocationPage() {
  return (
    <>
      <PageHero
        eyebrow="Find us"
        title="On the corner in Yehud"
        intro={`${restaurant.address.street}, ${restaurant.address.city}. Free parking, fully accessible, open six days a week.`}
        hue={200}
      />
      <div className="container-luxe pb-20">
        <LocationBlock />
      </div>

      <section className="container-luxe pb-24">
        <SectionHeading eyebrow="Good to know" title="Before you visit" align="center" className="mb-12" />
        <Faq />
      </section>

      <OrderCta />
    </>
  );
}
