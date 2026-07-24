import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="grid min-h-[80svh] place-items-center px-6 text-center">
      <div>
        <Logo showWordmark={false} markSize={64} className="justify-center" />
        <p className="mt-8 text-xs uppercase tracking-[0.4em] text-gold">404</p>
        <h1 className="mt-3 font-display text-4xl text-cream md:text-5xl">This corner is empty</h1>
        <p className="mx-auto mt-4 max-w-md text-cream/60">
          The page you&apos;re looking for has moved or never existed. Let&apos;s get you back to the food.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-full bg-gold px-6 py-3 font-medium text-ink">
            Back home
          </Link>
          <Link href="/menu" className="rounded-full border border-gold/40 px-6 py-3 font-medium text-gold">
            View menu
          </Link>
        </div>
      </div>
    </div>
  );
}
