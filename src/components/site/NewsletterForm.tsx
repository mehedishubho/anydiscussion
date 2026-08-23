"use client";
// src/components/site/NewsletterForm.tsx
// [CITED: 260824-3l2-CONTEXT.md D-06 — small client island with useActionState
//  rendered INSIDE the cached SiteFooter; the cache boundary stays intact]
// [CITED: 260823-6je-PLAN.md locked decision 2 — superseded by 260824-3l2 D-06:
//  the column was inert visuals; it is now a functional client island]
// [CITED: src/components/auth/SignUpForm.tsx — the codebase's useActionState
//  precedent (React.useActionState + <form action={formAction}> + pending)]
// [CITED: src/components/site/ThemeToggle.tsx — client-island sibling in (site)]
// [CITED: nextjs.org/docs/app/api-reference/directives/use-cache — cached
//  components may return trees containing client components; the island
//  imports the Server Action directly so no function prop ever crosses the
//  footer cache boundary — only these three serializable string props do]
//
// The footer newsletter column island. Renders the ENTIRE column (heading,
// description, form) with the footer's always-dark classes copied verbatim
// from the previous inert markup (white/10 borders, gray-400 text, brand-500
// button, bg-white/5 input — decision 6: one white/gray palette, no dark:
// variants). Non-JS users degrade to the previous inert visuals (progressive
// enhancement accepted per D-06, not a gate).
import React from "react";
import { subscribeNewsletter } from "@/actions/newsletter";
import type { SubscribeState } from "@/actions/newsletter-schema";

interface NewsletterFormProps {
  /** Column heading from newsletter.heading (settings, default "Newsletter"). */
  heading: string;
  /** Blurb from newsletter.description (settings default applied). */
  description: string;
  /** Inline confirmation from newsletter.success_message — rendered from the
   *  settings prop on success, NOT from the action payload (keeps the action
   *  payload constant and the text cache-controlled). */
  successMessage: string;
}

export default function NewsletterForm({
  heading,
  description,
  successMessage,
}: NewsletterFormProps) {
  // The useActionState signature is carried by the action itself
  // (subscribeNewsletter(prev, formData)) — no local wrapper needed.
  const [state, formAction, pending] = React.useActionState<SubscribeState, FormData>(
    subscribeNewsletter,
    { status: "idle" },
  );

  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-white">{heading}</h3>
      <p className="mb-4 text-sm text-gray-400">{description}</p>

      {state.status === "success" ? (
        // Success replaces the form entirely; aria-live announces it politely.
        // The text comes from the settings prop (D-02), not the action payload.
        <p aria-live="polite" className="text-sm font-medium text-brand-400">
          {successMessage}
        </p>
      ) : (
        <>
          <form action={formAction} className="flex gap-3">
            <input
              type="email"
              name="email"
              required
              placeholder="Enter your email"
              aria-label="Email address"
              className="w-full min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition-colors placeholder:text-gray-500 focus:border-brand-400 focus:outline-none"
            />
            {/* Honeypot (D-05) — hidden from humans AND assistive tech:
                absolutely positioned off-screen (NOT display:none — bots skip
                hidden inputs more often), unfocusable, aria-hidden. Bots
                auto-fill fields named "website"; the action silently succeeds
                without inserting when it is non-empty. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
              className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden border-0 p-0"
            />
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Subscribing…" : "Subscribe"}
            </button>
          </form>
          {state.status === "error" && (
            // Sentinel mapping (SubscribeState.message): RATE_LIMITED gets the
            // specific line; INVALID_EMAIL / UNKNOWN share the generic one.
            // Never leaks whether the email already existed (T-3l2-04).
            <p role="alert" className="mt-2 text-xs text-error-400">
              {state.message === "RATE_LIMITED"
                ? "Too many subscriptions — please try again later."
                : "Something went wrong. Please try again."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
