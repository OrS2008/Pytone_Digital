"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, Phone, MessageCircle } from "lucide-react";
import { Logo } from "./Logo";
import { restaurant } from "@/content/restaurant";
import { openStatus, telLink, whatsappOrderLink, cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Home" },
  { href: "/story", label: "Story" },
  { href: "/menu", label: "Menu" },
  { href: "/gallery", label: "Gallery" },
  { href: "/location", label: "Location" },
  { href: "/contact", label: "Contact" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ open: boolean; label: string } | null>(null);

  useEffect(() => {
    setStatus(openStatus());
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500",
          scrolled ? "glass py-2 shadow-lg shadow-black/40" : "bg-transparent py-4"
        )}
      >
        <nav className="container-luxe flex items-center justify-between" aria-label="Primary">
          <Link href="/" aria-label={`${restaurant.name} — home`} className="shrink-0">
            <Logo markSize={scrolled ? 34 : 38} />
          </Link>

          <ul className="hidden items-center gap-8 lg:flex">
            {nav.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className="text-sm tracking-wide text-cream/80 transition-colors hover:text-gold"
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-3 lg:flex">
            {status && (
              <span className="flex items-center gap-2 text-xs text-cream/70">
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    status.open ? "bg-olive shadow-[0_0_10px_2px_rgba(85,107,47,0.8)]" : "bg-ember/70"
                  )}
                  aria-hidden
                />
                {status.label}
              </span>
            )}
            <a
              href={whatsappOrderLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-ink transition-transform hover:scale-[1.03] active:scale-95"
            >
              Order now
            </a>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-cream lg:hidden"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu size={26} />
          </button>
        </nav>
      </header>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-[60] lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/70 transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "glass absolute right-0 top-0 flex h-full w-[82%] max-w-sm flex-col p-6 transition-transform duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
            open ? "translate-x-0" : "translate-x-full"
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="flex items-center justify-between">
            <Logo markSize={32} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-cream"
              aria-label="Close menu"
            >
              <X size={26} />
            </button>
          </div>
          <ul className="mt-10 flex flex-col gap-1">
            {nav.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-white/5 py-4 font-display text-2xl text-cream transition-colors hover:text-gold"
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-col gap-3">
            <a
              href={whatsappOrderLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-full bg-gold px-5 py-3.5 font-medium text-ink"
            >
              <MessageCircle size={18} /> WhatsApp Order
            </a>
            <a
              href={telLink()}
              className="flex items-center justify-center gap-2 rounded-full border border-gold/40 px-5 py-3.5 font-medium text-gold"
            >
              <Phone size={18} /> {restaurant.phoneDisplay}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
