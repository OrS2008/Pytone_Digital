"use client";

import { useEffect, useState } from "react";
import { MapPin, Navigation, Clock, Phone, Car, Accessibility, CircleCheck } from "lucide-react";
import { restaurant } from "@/content/restaurant";
import { openStatus, telLink, cn } from "@/lib/utils";

/**
 * Location panel: hours (with live open/closed), address, amenities, and a
 * stylized map with one-tap Waze + Google Maps directions.
 *
 * PRODUCTION: to show a live interactive map, drop a Google Maps Embed iframe
 * (or Mapbox GL) into the `.map-slot` div below — the frame is already sized.
 */
export function LocationBlock() {
  const [status, setStatus] = useState<{ open: boolean; label: string; nextChange?: string } | null>(null);
  const [today, setToday] = useState<number | null>(null);

  useEffect(() => {
    setStatus(openStatus());
    const d = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" }).format(new Date());
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    setToday(map[d] ?? null);
  }, []);

  const amenities = [
    { icon: CircleCheck, label: "Kosher certified", on: restaurant.kosher },
    { icon: Car, label: "Free parking nearby", on: restaurant.parking },
    { icon: Accessibility, label: "Wheelchair accessible", on: restaurant.accessible },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      {/* Map */}
      <div className="relative overflow-hidden rounded-xl2 hairline bg-surface min-h-[22rem]">
        <div className="map-slot absolute inset-0">
          {/* stylized street grid */}
          <svg className="h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <rect width="400" height="300" fill="#101010" />
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 32} x2="400" y2={i * 32} stroke="#1e1e1e" strokeWidth="1.5" />
            ))}
            {Array.from({ length: 14 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 32} y1="0" x2={i * 32} y2="300" stroke="#1e1e1e" strokeWidth="1.5" />
            ))}
            <path d="M0 150 L400 140" stroke="#2a2a2a" strokeWidth="6" />
            <path d="M180 0 L200 300" stroke="#2a2a2a" strokeWidth="6" />
            <circle cx="200" cy="146" r="46" fill="rgba(200,155,60,0.08)" />
            <circle cx="200" cy="146" r="8" fill="#c89b3c" className="animate-ember" />
          </svg>
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[calc(50%+34px)]">
            <div className="rounded-full bg-gold p-2 text-ink shadow-[0_10px_30px_-6px_rgba(200,155,60,0.7)]">
              <MapPin size={22} />
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-3 bg-gradient-to-t from-ink to-transparent p-5 pt-16">
          <a
            href={restaurant.links.waze}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-ink"
          >
            <Navigation size={16} /> Waze
          </a>
          <a
            href={restaurant.links.googleMaps}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-cream/25 px-5 py-2.5 text-sm font-medium text-cream backdrop-blur hover:border-gold hover:text-gold"
          >
            <MapPin size={16} /> Google Maps
          </a>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-xl2 hairline bg-surface p-7">
        <div className="flex items-center gap-2">
          {status && (
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
                status.open ? "bg-olive/20 text-olive" : "bg-ember/15 text-ember"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", status.open ? "bg-olive" : "bg-ember")} />
              {status.label} {status.nextChange && <span className="opacity-70">· {status.nextChange}</span>}
            </span>
          )}
        </div>

        <address className="mt-5 not-italic">
          <p className="flex items-start gap-3 text-cream">
            <MapPin size={18} className="mt-0.5 shrink-0 text-gold" />
            <span>
              {restaurant.address.street}
              <br />
              {restaurant.address.city}, {restaurant.address.countryName}
            </span>
          </p>
          <a href={telLink()} className="mt-3 flex items-center gap-3 text-cream hover:text-gold">
            <Phone size={18} className="shrink-0 text-gold" /> {restaurant.phoneDisplay}
          </a>
        </address>

        <div className="mt-6 border-t border-white/8 pt-5">
          <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-gold">
            <Clock size={14} /> Opening hours
          </p>
          <ul className="space-y-1.5 text-sm">
            {restaurant.hours.map((h) => (
              <li
                key={h.day}
                className={cn(
                  "flex items-center justify-between gap-4 rounded-lg px-2 py-1",
                  today === h.day && "bg-gold/10"
                )}
              >
                <span className={cn(today === h.day ? "text-gold" : "text-cream/70")}>{h.label}</span>
                <span className={cn("tabular-nums", today === h.day ? "text-gold" : "text-cream/50")}>
                  {h.open ? `${h.open}–${h.close === "24:00" ? "00:00" : h.close}` : "Closed"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <ul className="mt-6 flex flex-wrap gap-2 border-t border-white/8 pt-5">
          {amenities.filter((a) => a.on).map((a) => (
            <li key={a.label} className="flex items-center gap-1.5 rounded-full bg-ink/60 px-3 py-1.5 text-xs text-cream/70">
              <a.icon size={13} className="text-olive" /> {a.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
