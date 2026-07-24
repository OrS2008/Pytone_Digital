"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, CheckCircle2, Loader2 } from "lucide-react";
import { contactSchema, topicLabels, type ContactInput } from "@/lib/contact-schema";
import { cn } from "@/lib/utils";

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { topic: "order", email: "", company: "" },
  });

  async function onSubmit(data: ContactInput) {
    setServerError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Something went wrong.");
      setSent(true);
      reset();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center rounded-xl2 hairline bg-surface p-10 text-center">
        <CheckCircle2 size={48} className="text-olive" />
        <h3 className="mt-4 font-display text-2xl text-cream">Message sent</h3>
        <p className="mt-2 max-w-sm text-sm text-cream/60">
          Toda! We&apos;ll be in touch shortly. For anything urgent, message us on WhatsApp.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-6 rounded-full border border-gold/40 px-5 py-2.5 text-sm text-gold hover:border-gold"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="rounded-xl2 hairline bg-surface p-6 md:p-8">
      {/* honeypot */}
      <div className="absolute left-[-9999px]" aria-hidden>
        <label>
          Company
          <input tabIndex={-1} autoComplete="off" {...register("company")} />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" error={errors.name?.message}>
          <input
            {...register("name")}
            autoComplete="name"
            className={inputCls(!!errors.name)}
            placeholder="Your name"
          />
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <input
            {...register("phone")}
            autoComplete="tel"
            inputMode="tel"
            className={inputCls(!!errors.phone)}
            placeholder="050-000-0000"
          />
        </Field>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label="Email (optional)" error={errors.email?.message}>
          <input
            {...register("email")}
            autoComplete="email"
            inputMode="email"
            className={inputCls(!!errors.email)}
            placeholder="you@email.com"
          />
        </Field>
        <Field label="Topic" error={errors.topic?.message}>
          <select {...register("topic")} className={inputCls(!!errors.topic)}>
            {Object.entries(topicLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Message" error={errors.message?.message}>
          <textarea
            {...register("message")}
            rows={5}
            className={cn(inputCls(!!errors.message), "resize-y")}
            placeholder="How can we help?"
          />
        </Field>
      </div>

      {serverError && (
        <p role="alert" className="mt-4 rounded-lg bg-ember/10 px-4 py-3 text-sm text-ember">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gold px-6 py-3.5 font-semibold text-ink transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
      >
        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {isSubmitting ? "Sending…" : "Send message"}
      </button>
      <p className="mt-3 text-center text-xs text-cream/40">
        Protected against spam. We never share your details.
      </p>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-cream/70">{label}</span>
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-ember">
          {error}
        </span>
      )}
    </label>
  );
}

function inputCls(hasError: boolean): string {
  return cn(
    "w-full rounded-xl border bg-ink/60 px-4 py-3 text-sm text-cream placeholder:text-cream/35 focus:outline-none",
    hasError ? "border-ember/60 focus:border-ember" : "border-white/10 focus:border-gold/60"
  );
}
