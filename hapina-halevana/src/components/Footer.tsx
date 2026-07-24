import Link from "next/link";
import { Instagram, Facebook, Youtube, MessageCircle, MapPin, Phone, Mail } from "lucide-react";
import { Logo } from "./Logo";
import { restaurant } from "@/content/restaurant";
import { telLink, whatsappOrderLink } from "@/lib/utils";

const TikTok = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M16.5 3c.3 2.1 1.6 3.6 3.7 3.9v2.6c-1.3.1-2.5-.3-3.7-1v5.7c0 3.4-2.4 5.8-5.6 5.8-2.9 0-5.2-2-5.2-4.9 0-3 2.5-5 5.6-4.6v2.8c-.5-.1-1-.2-1.5-.1-1.2.2-2 1-1.9 2.2.1 1.1 1 1.9 2.1 1.8 1.3-.1 2-1 2-2.4V3h3.5Z" />
  </svg>
);

export function Footer() {
  const year = new Date().getFullYear();
  const socials = [
    { href: restaurant.links.instagram, label: "Instagram", icon: Instagram },
    { href: restaurant.links.facebook, label: "Facebook", icon: Facebook },
    { href: restaurant.links.tiktok, label: "TikTok", icon: TikTok },
    { href: restaurant.links.youtube, label: "YouTube", icon: Youtube },
  ];

  return (
    <footer className="relative mt-24 border-t border-white/8 bg-surface-2">
      <div className="container-luxe grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <Logo />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-cream/60">
            {restaurant.legend}. Serving Yehud since {restaurant.founded}.
          </p>
          <div className="mt-6 flex gap-3">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-cream/70 transition-colors hover:border-gold hover:text-gold"
              >
                <s.icon size={18} />
              </a>
            ))}
          </div>
        </div>

        <nav aria-label="Explore">
          <h3 className="text-xs uppercase tracking-[0.25em] text-gold">Explore</h3>
          <ul className="mt-5 space-y-3 text-sm text-cream/70">
            <li><Link href="/story" className="hover:text-gold">Our Story</Link></li>
            <li><Link href="/menu" className="hover:text-gold">Menu</Link></li>
            <li><Link href="/gallery" className="hover:text-gold">Gallery</Link></li>
            <li><Link href="/location" className="hover:text-gold">Location</Link></li>
            <li><Link href="/contact" className="hover:text-gold">Contact</Link></li>
          </ul>
        </nav>

        <div>
          <h3 className="text-xs uppercase tracking-[0.25em] text-gold">Hours</h3>
          <ul className="mt-5 space-y-2 text-sm text-cream/70">
            {restaurant.hours.map((h) => (
              <li key={h.day} className="flex justify-between gap-4">
                <span>{h.label}</span>
                <span className="text-cream/50">
                  {h.open ? `${h.open}–${h.close === "24:00" ? "00:00" : h.close}` : "Closed"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs uppercase tracking-[0.25em] text-gold">Visit & Order</h3>
          <ul className="mt-5 space-y-3 text-sm text-cream/70">
            <li>
              <a href={restaurant.links.googleMaps} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 hover:text-gold">
                <MapPin size={16} className="mt-0.5 shrink-0 text-gold" />
                {restaurant.address.street}, {restaurant.address.city}
              </a>
            </li>
            <li>
              <a href={telLink()} className="flex items-center gap-2 hover:text-gold">
                <Phone size={16} className="shrink-0 text-gold" /> {restaurant.phoneDisplay}
              </a>
            </li>
            <li>
              <a href={`mailto:${restaurant.email}`} className="flex items-center gap-2 hover:text-gold">
                <Mail size={16} className="shrink-0 text-gold" /> {restaurant.email}
              </a>
            </li>
            <li>
              <a href={whatsappOrderLink()} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-gold">
                <MessageCircle size={16} className="shrink-0 text-gold" /> WhatsApp Order
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="container-luxe flex flex-col items-center justify-between gap-3 py-6 text-xs text-cream/40 md:flex-row">
          <p>
            © {year} {restaurant.name} ({restaurant.nameHe}). All rights reserved.
          </p>
          <p className="flex items-center gap-4">
            <span>Kosher · {restaurant.address.city}, Israel</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
