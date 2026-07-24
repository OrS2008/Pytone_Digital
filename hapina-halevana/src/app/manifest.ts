import type { MetadataRoute } from "next";
import { restaurant } from "@/content/restaurant";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${restaurant.name} — ${restaurant.tagline}`,
    short_name: restaurant.name,
    description: restaurant.descriptionShort,
    start_url: "/",
    display: "standalone",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    orientation: "portrait",
    categories: ["food", "restaurant", "lifestyle"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Menu", url: "/menu" },
      { name: "Order", url: "/#order" },
      { name: "Directions", url: "/location" },
    ],
  };
}
