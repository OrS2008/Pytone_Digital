"use client";

import Link from "next/link";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { MapPin, MessageCircle, UtensilsCrossed, PlayCircle } from "lucide-react";
import { restaurant } from "@/content/restaurant";
import { whatsappOrderLink } from "@/lib/utils";

/**
 * Full-screen cinematic hero.
 *
 * PRODUCTION: drop a 4K restaurant reel at /public/hero.mp4 (H.264/AV1) and a
 * poster at /public/hero-poster.jpg, then uncomment the <video> below. Until
 * then we render a fully animated ember/fire/spit scene so the section already
 * reads as a premium commercial — no blank placeholder, no stock feeling.
 */
export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);

  return (
    <section ref={ref} className="relative flex min-h-[100svh] items-center overflow-hidden grain">
      {/* ---- Cinematic background ---- */}
      <motion.div style={{ scale: reduce ? 1 : scale }} className="absolute inset-0">
        {/*
        <video autoPlay muted loop playsInline poster="/hero-poster.jpg"
          className="h-full w-full object-cover">
          <source src="/hero.av1.mp4" type="video/mp4; codecs=av01" />
          <source src="/hero.mp4" type="video/mp4" />
        </video>
        */}
        <div className="absolute inset-0 bg-ink" />
        {/* rotating spit glow */}
        <div className="absolute left-1/2 top-1/2 h-[80vmax] w-[80vmax] -translate-x-1/2 -translate-y-1/2">
          <div
            className="animate-ember absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 50% 62%, rgba(229,155,58,0.45), rgba(200,155,60,0.18) 30%, transparent 60%)",
            }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "conic-gradient(from 180deg at 50% 62%, transparent, rgba(200,155,60,0.10), transparent, rgba(229,155,58,0.14), transparent)",
            }}
          />
        </div>
        {/* embers */}
        {!reduce &&
          Array.from({ length: 14 }).map((_, i) => (
            <motion.span
              key={i}
              className="absolute bottom-0 h-1 w-1 rounded-full bg-ember"
              style={{ left: `${(i * 7 + 6) % 100}%` }}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: -520, opacity: [0, 1, 0] }}
              transition={{
                duration: 6 + (i % 5),
                repeat: Infinity,
                delay: i * 0.7,
                ease: "easeOut",
              }}
            />
          ))}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/70" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-transparent to-ink/50" />
        <div className="grain-layer" />
      </motion.div>

      {/* ---- Content ---- */}
      <motion.div style={{ y: reduce ? 0 : y, opacity }} className="container-luxe relative z-10 pt-24">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mb-5 flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-gold"
        >
          <span className="h-px w-10 bg-gold/60" />
          Yehud · Est. {restaurant.founded}
        </motion.p>

        <h1 className="font-display text-[clamp(2.75rem,8vw,6.5rem)] font-semibold leading-[0.98] text-cream">
          <motion.span
            className="block"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            The Legendary
          </motion.span>
          <motion.span
            className="text-gradient-gold block"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            Shawarma Experience
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 max-w-xl text-lg leading-relaxed text-cream/75"
        >
          {restaurant.descriptionShort}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.46, ease: [0.16, 1, 0.3, 1] }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <Link
            href="/menu"
            className="group flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 font-medium text-ink transition-transform hover:scale-[1.03] active:scale-95"
          >
            <UtensilsCrossed size={18} /> View Menu
          </Link>
          <a
            href={whatsappOrderLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-gold/40 px-7 py-3.5 font-medium text-cream backdrop-blur transition-colors hover:border-gold hover:text-gold"
          >
            <MessageCircle size={18} /> WhatsApp Order
          </a>
          <a
            href={restaurant.links.waze}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full px-5 py-3.5 font-medium text-cream/70 transition-colors hover:text-gold"
          >
            <MapPin size={18} /> Directions
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.7 }}
          className="mt-14 flex flex-wrap items-center gap-x-10 gap-y-4 text-sm text-cream/60"
        >
          <Stat value={`${restaurant.proof.yearsServing}+`} label="Years serving Yehud" />
          <Stat value={restaurant.proof.rating.toFixed(1)} label={`★ from ${restaurant.proof.reviewCount.toLocaleString()} reviews`} />
          <Stat value={restaurant.proof.portionsServed} label="Portions served" />
        </motion.div>
      </motion.div>

      {/* scroll cue */}
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-cream/40">
        <PlayCircle className="animate-ember" size={22} aria-hidden />
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl text-gold">{value}</div>
      <div className="text-xs uppercase tracking-wider text-cream/50">{label}</div>
    </div>
  );
}
