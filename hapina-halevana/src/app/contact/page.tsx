import type { Metadata } from "next";
import { Phone, Mail, MapPin, MessageCircle, Instagram, Facebook, Youtube } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { ContactForm } from "@/components/ContactForm";
import { restaurant } from "@/content/restaurant";
import { telLink, whatsappOrderLink } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with HaPina HaLevana in ${restaurant.address.city} — WhatsApp, phone, email, or send us a message.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const channels = [
    { icon: MessageCircle, label: "WhatsApp", value: "Message us", href: whatsappOrderLink(), external: true },
    { icon: Phone, label: "Phone", value: restaurant.phoneDisplay, href: telLink() },
    { icon: Mail, label: "Email", value: restaurant.email, href: `mailto:${restaurant.email}` },
    { icon: MapPin, label: "Address", value: `${restaurant.address.street}, ${restaurant.address.city}`, href: restaurant.links.googleMaps, external: true },
  ];
  const socials = [
    { icon: Instagram, href: restaurant.links.instagram, label: "Instagram" },
    { icon: Facebook, href: restaurant.links.facebook, label: "Facebook" },
    { icon: Youtube, href: restaurant.links.youtube, label: "YouTube" },
  ];

  return (
    <>
      <PageHero
        eyebrow="Say hello"
        title="Let's talk"
        intro="Orders, catering, feedback or a big family celebration — we'd love to hear from you."
        hue={140}
      />
      <div className="container-luxe grid gap-10 pb-24 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <ul className="space-y-3">
            {channels.map((c) => (
              <li key={c.label}>
                <a
                  href={c.href}
                  {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex items-center gap-4 rounded-xl2 hairline bg-surface p-5 transition-colors hover:border-gold/50"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
                    <c.icon size={20} />
                  </span>
                  <span>
                    <span className="block text-xs uppercase tracking-wider text-cream/45">{c.label}</span>
                    <span className="block text-cream">{c.value}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex gap-3">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-cream/70 transition-colors hover:border-gold hover:text-gold"
              >
                <s.icon size={19} />
              </a>
            ))}
          </div>
        </div>

        <ContactForm />
      </div>
    </>
  );
}
