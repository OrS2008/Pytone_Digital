"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, UtensilsCrossed } from "lucide-react";
import { whatsappOrderLink, cn } from "@/lib/utils";

/** App-like bottom order bar shown on small screens after the hero scrolls past. */
export function StickyOrderBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "transition-transform duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        show ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="glass m-3 flex items-center gap-2 rounded-2xl p-2 shadow-2xl shadow-black/50">
        <Link
          href="/menu"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gold/30 px-4 py-3 text-sm font-medium text-gold"
        >
          <UtensilsCrossed size={18} /> Menu
        </Link>
        <a
          href={whatsappOrderLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-ink"
        >
          <MessageCircle size={18} /> Order now
        </a>
      </div>
    </div>
  );
}
