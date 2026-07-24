import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/contact-schema";

export const runtime = "nodejs";

/**
 * Contact endpoint.
 *
 * - Zod-validates the payload (server side, never trust the client).
 * - Honeypot field ("company") blocks the most common bots.
 * - In-memory sliding-window rate limit per IP (swap for Upstash/Redis in prod).
 *
 * PRODUCTION: wire the delivery step below to your provider of choice —
 * Resend/SendGrid for email, or a WhatsApp Business / Telegram webhook. Add a
 * CAPTCHA (hCaptcha/Turnstile) token check here for stronger spam protection.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again in a minute." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Please check the form and try again.", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  // Honeypot tripped — pretend success so bots don't learn.
  if (parsed.data.company && parsed.data.company.length > 0) {
    return NextResponse.json({ ok: true });
  }

  // TODO(production): deliver the message.
  // await resend.emails.send({ ... }) or POST to a WhatsApp Business webhook.
  console.info("[contact] new enquiry", {
    name: parsed.data.name,
    topic: parsed.data.topic,
  });

  return NextResponse.json({ ok: true });
}
