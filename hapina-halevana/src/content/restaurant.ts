/**
 * Central restaurant profile.
 *
 * This is the single source of truth for NAP (Name / Address / Phone) data,
 * hours, and social links. It is intentionally a plain typed object so it can
 * be swapped for a Sanity/Contentful query without touching any component:
 * every component imports `restaurant` and reads from it.
 */

export type OpeningHour = {
  /** 0 = Sunday … 6 = Saturday (Israel week starts Sunday). */
  day: number;
  label: string;
  labelHe: string;
  open: string | null; // "11:00", null = closed
  close: string | null; // "23:00"
  note?: string;
};

export const restaurant = {
  name: "HaPina HaLevana",
  nameHe: "הפינה הלבנה",
  tagline: "The White Corner",
  taglineHe: "הפינה הלבנה",
  legend: "The Legendary Shawarma Experience of Yehud",
  descriptionShort:
    "Serving Yehud for decades with authentic Israeli flavors, generous portions and unforgettable taste.",
  descriptionLong:
    "HaPina HaLevana — The White Corner — is a Yehud institution. For decades, generations of families have gathered around our fire for shawarma carved to order, laffa baked fresh, and salads cut by hand every morning. This is not fast food. It is a ritual.",
  founded: 1987,

  // Contact
  phoneDisplay: "03-536-0000",
  phoneE164: "+97235360000",
  whatsappE164: "972535360000", // used for wa.me deep links
  email: "hello@hapinahalevana.co.il",

  // Address (Yehud, Israel)
  address: {
    street: "Rehov HaMelacha 12",
    streetHe: "רחוב המלאכה 12",
    city: "Yehud",
    cityHe: "יהוד",
    region: "Center District",
    postalCode: "5652012",
    country: "IL",
    countryName: "Israel",
  },

  // Geo (approximate central Yehud coordinates — replace with exact rooftop coords)
  geo: {
    lat: 32.0339,
    lng: 34.8894,
  },

  // Deep links
  links: {
    googleMaps:
      "https://www.google.com/maps/search/?api=1&query=HaPina+HaLevana+Yehud",
    waze: "https://waze.com/ul?ll=32.0339,34.8894&navigate=yes",
    instagram: "https://instagram.com/hapinahalevana",
    facebook: "https://facebook.com/hapinahalevana",
    tiktok: "https://tiktok.com/@hapinahalevana",
    youtube: "https://youtube.com/@hapinahalevana",
    orderOnline: "#order", // wire to your ordering provider (Wolt / 10bis / Tabit)
  },

  // Trust / social proof
  proof: {
    rating: 4.8,
    reviewCount: 2140,
    yearsServing: new Date().getFullYear() - 1987,
    portionsServed: "3M+",
  },

  hours: [
    { day: 0, label: "Sunday", labelHe: "ראשון", open: "11:00", close: "23:00" },
    { day: 1, label: "Monday", labelHe: "שני", open: "11:00", close: "23:00" },
    { day: 2, label: "Tuesday", labelHe: "שלישי", open: "11:00", close: "23:00" },
    { day: 3, label: "Wednesday", labelHe: "רביעי", open: "11:00", close: "23:00" },
    { day: 4, label: "Thursday", labelHe: "חמישי", open: "11:00", close: "24:00" },
    {
      day: 5,
      label: "Friday",
      labelHe: "שישי",
      open: "10:00",
      close: "15:00",
      note: "Closes early before Shabbat",
    },
    { day: 6, label: "Saturday", labelHe: "שבת", open: null, close: null, note: "Closed for Shabbat" },
  ] as OpeningHour[],

  kosher: true,
  parking: true,
  accessible: true,
  delivery: true,
  pickup: true,
} as const;

export type Restaurant = typeof restaurant;
