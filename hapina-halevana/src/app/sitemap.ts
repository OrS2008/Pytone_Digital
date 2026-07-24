import type { MetadataRoute } from "next";

const SITE = "https://hapinahalevana.co.il";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = ["", "/story", "/menu", "/gallery", "/location", "/contact"];
  return routes.map((r) => ({
    url: `${SITE}${r}`,
    lastModified: now,
    changeFrequency: r === "" || r === "/menu" ? "weekly" : "monthly",
    priority: r === "" ? 1 : r === "/menu" ? 0.9 : 0.7,
  }));
}
