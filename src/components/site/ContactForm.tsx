"use client";
// src/components/site/ContactForm.tsx
// [CITED: 06-05-PLAN.md Task 2 — public Contact form (RHF + Zod + useTransition)]
// [CITED: src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx L1-180 — the RHF +
//  zodResolver baseline. ADAPT the SHAPE; do NOT import (route-group isolation per D-28)]
// [CITED: 06-CONTEXT.md D-08 — RHF + Zod + useTransition, NOT TanStack Query (D-28 forbids
//  Query in (site); the dashboard's useMutation pattern does NOT cross the route boundary)]
// [CITED: 06-CONTEXT.md D-07 — honeypot field (hidden 'website' input)]
// [CITED: CLAUDE.md "Performance requirements" — keep public client JS lean; the contact
//  form is one of the few genuine client interactivity surfaces on (site)]
//
// The public Contact form (SITE-10). RHF + Zod (shared schema) submitted via
// useTransition + startTransition (NOT TanStack Query — D-28 forbids Query in
// (site) so the dashboard bundle never leaks the public bundle). The form is
// progressive enhancement: JS disabled → no submit; JS enabled → action fires.
//
// Honeypot field "website" (D-07): visually hidden via absolute off-screen
// positioning (NOT `display:none` — bots may skip those; off-screen is the
// classic honeypot trick). aria-hidden + tabIndex -1 + autoComplete off make
// it invisible to assistive tech and password managers. Real users leave it
// blank; bots auto-fill it and the Server Action silently drops the submission.
//
// The INPUT_CLASS / LABEL_CLASS constants are copied (NOT imported) from the
// dashboard's SeoSettingsForm.tsx — the (site)/(admin) isolation rule forbids
// cross-imports. The brand-*/error-*/success-* color tokens are global
// (defined in src/app/globals.css), so the same Tailwind classes work in both
// route groups. This mirrors how the dashboard form styling is intended to be
// reused by feature forms.

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  contactSchema,
  zodResolver,
  type ContactInput,
} from "@/actions/contact-schema";
import { submitContact } from "@/actions/contact";

// === Form styling (copied from SeoSettingsForm.tsx — NOT imported; route-group isolation) ===
// These strings intentionally duplicate the dashboard form's classes so the
// public Contact form visually matches the dashboard forms without crossing
// the (site)/(admin) import boundary. The color tokens (brand-*, error-*,
// success-*) are global CSS variables in src/app/globals.css.
const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const LABEL_CLASS =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

const TEXTAREA_CLASS =
  "w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

type Status =
  | { kind: "idle" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function ContactForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
      website: "", // honeypot — must start empty (real user)
    },
  });

  // D-28: useTransition for Server Action invocation (NOT TanStack useMutation —
  // Query is scoped to (admin) only). isPending drives the submit button label
  // + disabled state while the action is in flight.
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const onValid = (values: ContactInput) => {
    setStatus({ kind: "idle" });
    // startTransition wraps the Server Action call so the submission is
    // non-blocking (concurrent rendering keeps the UI responsive). The action
    // returns { ok: true } on real success AND on honeypot-tripped (silent
    // success — the bot sees the same UX as a real user).
    startTransition(async () => {
      try {
        await submitContact(values as Parameters<typeof submitContact>[0]);
        setStatus({ kind: "success" });
        reset();
      } catch (err) {
        // RATE_LIMITED is the documented public error (rate-limit gate — D-07).
        // Any other error is a generic "something went wrong" — lib/email never
        // throws (R8), so a send failure is swallowed inside the action and
        // surfaces to the user as success. This catch is for parse errors
        // (shouldn't happen — client validates first) and rate-limit.
        const message =
          err instanceof Error && err.message === "RATE_LIMITED"
            ? "Too many messages — please try again later."
            : "Something went wrong. Please try again.";
        setStatus({ kind: "error", message });
      }
    });
  };

  const isSaving = isPending;

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6" noValidate>
      <Field
        label="Your name"
        id="contact-name"
        placeholder="Jane Doe"
        error={errors.name?.message}
        required
        {...register("name")}
      />

      <Field
        label="Email"
        id="contact-email"
        type="email"
        placeholder="jane@example.com"
        error={errors.email?.message}
        required
        {...register("email")}
      />

      <Field
        label="Subject"
        id="contact-subject"
        placeholder="What is this about?"
        error={errors.subject?.message}
        {...register("subject")}
      />

      <div>
        <label htmlFor="contact-message" className={LABEL_CLASS}>
          Message
          <span className="text-error-500"> *</span>
        </label>
        <textarea
          id="contact-message"
          rows={6}
          placeholder="Your message…"
          className={`${TEXTAREA_CLASS} ${errors.message ? "border-error-500" : ""}`}
          {...register("message")}
        />
        {errors.message && (
          <p className="mt-1.5 text-xs text-error-500">
            {errors.message.message}
          </p>
        )}
      </div>

      {/*
        Honeypot field (D-07). Visually hidden via absolute off-screen
        positioning — NOT display:none (some bots skip those). aria-hidden
        keeps screen readers out; tabIndex -1 keeps keyboard focus out;
        autoComplete="off" + name="website" bait bots into auto-filling. Real users
        never see this field; if it has a value at submit, the Server Action
        silently drops the submission (returns ok without sending the email).
      */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "auto",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label htmlFor="contact-website">Website (leave empty)</label>
        <input
          id="contact-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("website")}
        />
      </div>

      {status.kind === "error" && (
        <div
          role="alert"
          className="rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300"
        >
          {status.message}
        </div>
      )}
      {status.kind === "success" && (
        <div
          role="status"
          className="rounded-lg border border-success-300 bg-success-50 p-3 text-sm text-success-700 dark:border-success-700 dark:bg-success-900/20 dark:text-success-300"
        >
          Message sent! We&apos;ll get back to you soon.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}

// ─── Field helper (mirrors the dashboard form pattern; copied, not imported) ──

interface FieldProps {
  label: string;
  id: string;
  type?: "text" | "email";
  placeholder?: string;
  error?: string;
  required?: boolean;
}

function Field({
  label,
  id,
  type = "text",
  placeholder,
  error,
  required,
  ...registerProps
}: FieldProps & Record<string, unknown>) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
        {required && <span className="text-error-500"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        className={`${INPUT_CLASS} ${error ? "border-error-500" : ""}`}
        {...(registerProps as Record<string, unknown>)}
      />
      {error && <p className="mt-1.5 text-xs text-error-500">{error}</p>}
    </div>
  );
}
