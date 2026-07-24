import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { MenuExplorer } from "@/components/MenuExplorer";
import { OrderCta } from "@/components/home/OrderCta";
import { restaurant } from "@/content/restaurant";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "Explore the full HaPina HaLevana menu — legendary shawarma, laffa, hummus, falafel, grill, salads and more. Search, filter by diet, and order in seconds.",
  alternates: { canonical: "/menu" },
};

export default function MenuPage() {
  return (
    <>
      <PageHero
        eyebrow="Carved to order"
        title="The Menu"
        intro={`Eleven categories, generous portions, fresh every dawn. Search, filter for vegetarian, vegan and gluten-free, and order from ${restaurant.address.city} in seconds.`}
      />
      <div className="container-luxe pb-24">
        <MenuExplorer />
      </div>
      <OrderCta />
    </>
  );
}
