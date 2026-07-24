import { restaurant } from "@/content/restaurant";
import { menuItems } from "@/content/menu";

const SITE = "https://hapinahalevana.co.il";

/**
 * Schema.org Restaurant markup for rich results and local SEO.
 * Rendered once in the root layout.
 */
export function RestaurantJsonLd() {
  const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const data = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${SITE}/#restaurant`,
    name: restaurant.name,
    alternateName: restaurant.nameHe,
    description: restaurant.descriptionShort,
    servesCuisine: ["Israeli", "Middle Eastern", "Shawarma", "Street Food"],
    priceRange: "₪₪",
    url: SITE,
    telephone: restaurant.phoneE164,
    email: restaurant.email,
    image: `${SITE}/opengraph-image`,
    logo: `${SITE}/icons/512`,
    foundingDate: String(restaurant.founded),
    hasMenu: `${SITE}/menu`,
    acceptsReservations: "False",
    paymentAccepted: "Cash, Credit Card, Apple Pay, Google Pay",
    currenciesAccepted: "ILS",
    address: {
      "@type": "PostalAddress",
      streetAddress: restaurant.address.street,
      addressLocality: restaurant.address.city,
      addressRegion: restaurant.address.region,
      postalCode: restaurant.address.postalCode,
      addressCountry: restaurant.address.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: restaurant.geo.lat,
      longitude: restaurant.geo.lng,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: restaurant.proof.rating,
      reviewCount: restaurant.proof.reviewCount,
      bestRating: 5,
    },
    openingHoursSpecification: restaurant.hours
      .filter((h) => h.open && h.close)
      .map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${dayMap[h.day]}`,
        opens: h.open,
        closes: h.close === "24:00" ? "23:59" : h.close,
      })),
    sameAs: [
      restaurant.links.instagram,
      restaurant.links.facebook,
      restaurant.links.tiktok,
      restaurant.links.youtube,
    ],
    menu: {
      "@type": "Menu",
      hasMenuSection: {
        "@type": "MenuSection",
        name: "Signature",
        hasMenuItem: menuItems
          .filter((i) => i.recommended)
          .map((i) => ({
            "@type": "MenuItem",
            name: i.name,
            description: i.description,
            offers: { "@type": "Offer", price: i.price, priceCurrency: "ILS" },
          })),
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
