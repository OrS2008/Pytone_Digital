import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { StickyOrderBar } from "@/components/StickyOrderBar";
import { RestaurantJsonLd } from "@/components/StructuredData";
import { restaurant } from "@/content/restaurant";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const SITE = "https://hapinahalevana.co.il";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: `${restaurant.name} — ${restaurant.legend}`,
    template: `%s · ${restaurant.name}`,
  },
  description: restaurant.descriptionShort,
  applicationName: restaurant.name,
  keywords: [
    "shawarma Yehud",
    "best shawarma",
    "Israeli street food",
    "HaPina HaLevana",
    "הפינה הלבנה",
    "kosher restaurant Yehud",
    "laffa",
    "falafel",
    "hummus",
  ],
  authors: [{ name: restaurant.name }],
  creator: restaurant.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_IL",
    url: SITE,
    siteName: restaurant.name,
    title: `${restaurant.name} — ${restaurant.legend}`,
    description: restaurant.descriptionShort,
  },
  twitter: {
    card: "summary_large_image",
    title: `${restaurant.name} — ${restaurant.legend}`,
    description: restaurant.descriptionShort,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>
        <RestaurantJsonLd />
        <Nav />
        <main id="main">{children}</main>
        <Footer />
        <StickyOrderBar />
      </body>
    </html>
  );
}
