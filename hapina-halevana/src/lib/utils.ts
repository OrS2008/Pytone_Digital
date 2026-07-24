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
 * Deterministic premium "plate" gradient for a menu item, used until real
 * photography is dropped in. Returns an inline CSS background value built from
 * the item's hue so every dish reads as a distinct, warm, cinematic plate.
 */
export function plateBackground(hue: number): string {
  const h = hue;
  return [
    `radial-gradient(120% 120% at 30% 25%, hsl(${h} 65% 42% / 0.95), transparent 60%)`,
    `radial-gradient(130% 130% at 75% 80%, hsl(${(h + 24) % 360} 70% 30%), transparent 65%)`,
    `radial-gradient(90% 90% at 50% 50%, hsl(${(h + 12) % 360} 55% 22%), hsl(${h} 40% 10%))`,
  ].join(", ");
}
