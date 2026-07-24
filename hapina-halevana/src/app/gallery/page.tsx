import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { Gallery } from "@/components/Gallery";
import { OrderCta } from "@/components/home/OrderCta";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Step inside HaPina HaLevana — shawarma close-ups, the fire, fresh ingredients, and the atmosphere of Yehud's legendary corner.",
  alternates: { canonical: "/gallery" },
};

export default function GalleryPage() {
  return (
    <>
      <PageHero
        eyebrow="Come hungry"
        title="Inside the corner"
        intro="The fire, the food, the faces. A cinematic look at what keeps generations of Yehud coming back."
        hue={20}
      />
      <div className="container-luxe pb-24">
        <Gallery />
      </div>
      <OrderCta />
    </>
  );
}
