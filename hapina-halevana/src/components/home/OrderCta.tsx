import Link from "next/link";
import { MessageCircle, Phone, MapPin, UtensilsCrossed } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { restaurant } from "@/content/restaurant";
import { whatsappOrderLink, telLink } from "@/lib/utils";

export function OrderCta() {
  return (
    <section id="order" className="relative overflow-hidden py-28 md:py-36 grain">
      <div className="absolute inset-0" aria-hidden>
        <div
          className="absolute left-1/2 top-1/2 h-[60vmax] w-[60vmax] -translate-x-1/2 -translate-y-1/2 animate-ember rounded-full"
          style={{ background: "radial-gradient(circle, rgba(229,155,58,0.22), transparent 60%)" }}
        />
        <div className="grain-layer" />
      </div>
      <div className="container-luxe relative text-center">
        <Reveal>
          <p className="mb-4 text-xs uppercase tracking-[0.4em] text-gold">Hungry yet?</p>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="mx-auto max-w-3xl font-display text-[clamp(2.25rem,6vw,4.5rem)] font-semibold leading-[1.02] text-cream">
            Your table at the corner is{" "}
            <span className="text-gradient-gold">always ready.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-lg text-cream/65">
            Order in seconds for pickup or delivery, message us on WhatsApp, or come taste the
            legend in {restaurant.address.city}.
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a
              href={whatsappOrderLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-gold px-7 py-4 font-semibold text-ink transition-transform hover:scale-[1.03] active:scale-95"
            >
              <MessageCircle size={19} /> WhatsApp Order
            </a>
            <Link
              href="/menu"
              className="flex items-center gap-2 rounded-full border border-gold/40 px-7 py-4 font-medium text-cream transition-colors hover:border-gold hover:text-gold"
            >
              <UtensilsCrossed size={19} /> View Menu
            </Link>
            <a
              href={telLink()}
              className="flex items-center gap-2 rounded-full px-6 py-4 font-medium text-cream/70 transition-colors hover:text-gold"
            >
              <Phone size={19} /> {restaurant.phoneDisplay}
            </a>
            <a
              href={restaurant.links.waze}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full px-6 py-4 font-medium text-cream/70 transition-colors hover:text-gold"
            >
              <MapPin size={19} /> Get Directions
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
