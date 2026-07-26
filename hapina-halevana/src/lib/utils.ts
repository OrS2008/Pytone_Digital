import { restaurant } from "@/content/restaurant";
import type { MenuItem } from "@/content/menu";

/** Tiny classNames joiner (no dependency needed). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Format an ILS price. */
export function shekel(amount: number): string {
  return `₪${amount}`;
}

/** Jerusalem-time "now" as {day, minutes}. Works regardless of server TZ. */
function nowInIsrael(): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: map[wd] ?? 0, minutes: (hour % 24) * 60 + minute };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export type OpenStatus = {
  open: boolean;
  label: string;
  nextChange?: string;
};

/**
 * Compute whether the restaurant is currently open, in Israel time.
 * NOTE: call this on the client (or with `suppressHydrationWarning`) since it
 * depends on the current moment.
 */
export function openStatus(): OpenStatus {
  const { day, minutes } = nowInIsrael();
  const today = restaurant.hours.find((h) => h.day === day);
  if (!today || today.open === null || today.close === null) {
    return { open: false, label: "Closed today" };
  }
  const openM = toMinutes(today.open);
  // "24:00" -> midnight close
  const closeM = today.close === "24:00" ? 24 * 60 : toMinutes(today.close);
  const isOpen = minutes >= openM && minutes < closeM;
  if (isOpen) {
    return { open: true, label: "Open now", nextChange: `until ${today.close === "24:00" ? "00:00" : today.close}` };
  }
  if (minutes < openM) {
    return { open: false, label: "Opens later", nextChange: `at ${today.open}` };
  }
  return { open: false, label: "Closed now", nextChange: `Opens tomorrow` };
}

/** Build a WhatsApp deep link pre-filled with an order message. */
export function whatsappOrderLink(items?: MenuItem[]): string {
  const base = `https://wa.me/${restaurant.whatsappE164}`;
  let text = `Hi ${restaurant.name}! I'd like to place an order:`;
  if (items && items.length) {
    text += "\n" + items.map((i) => `• ${i.name} — ${shekel(i.price)}`).join("\n");
  } else {
    text += " ";
  }
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function telLink(): string {
  return `tel:${restaurant.phoneE164}`;
}

/**
 * Deterministic premium "plate" for a menu item, used until real photography is
 * dropped in. Rather than bright rainbow gradients, this renders a warm, moody,
 * low-saturation scene that reads like out-of-focus studio food photography:
 * a soft key light, a warm food "mound", depth shadow, and a dark ceramic
 * vignette. Hues are mapped into appetizing bands (warm food / fresh greens /
 * cool drinks) so nothing ever looks neon or artificial.
 */
export function plateBackground(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  const fresh = h >= 80 && h <= 165; // salads, herbs
  const cool = h > 165 && h < 275; // drinks, night scenes

  // dominant food hue, its shadow hue, and overall saturation
  const key = fresh ? 96 : cool ? 205 : 24;
  const shade = fresh ? 74 : cool ? 214 : 15;
  const sat = fresh ? 30 : cool ? 22 : 46;

  return [
    // soft warm key light from top
    `radial-gradient(75% 55% at 50% 10%, rgba(255,244,222,0.20), transparent 55%)`,
    // the food, catching the light
    `radial-gradient(78% 66% at 50% 44%, hsl(${key} ${sat}% 41%), transparent 72%)`,
    // secondary mass / depth
    `radial-gradient(62% 58% at 66% 74%, hsl(${shade} ${sat + 6}% 25%), transparent 66%)`,
    // ceramic vignette
    `radial-gradient(125% 105% at 50% 46%, transparent 52%, rgba(0,0,0,0.58))`,
    // base ground
    `linear-gradient(158deg, hsl(${shade} 30% 11%), hsl(${key} 22% 6%))`,
  ].join(", ");
}
