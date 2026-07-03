"use client";
// src/components/auth/ForgotPasswordForm.tsx
// [CITED: 02-04-PLAN.md Task 1 — AUTH-06 forgot-password UI; D-09 requireEmailVerification]
// [CITED: T-02-04 — email-enumeration protection: always show "check your email" regardless of outcome]
//
// Triggers the already-wired sendResetPassword server hook (src/lib/auth/index.ts:55)
// via authClient.requestPasswordReset. The response is ALWAYS treated as success from
// the user's perspective (T-02-04) — we never reveal whether the email exists.
//
// No Suspense boundary needed — this form does NOT use useSearchParams (unlike SignInForm
// which reads the `next` param), so there is no PPR requirement.
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon } from "@/icons";
import Link from "next/link";
import React, { useState } from "react";
import { authClient } from "@/lib/auth/client";

export default function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "").trim();

    // T-02-04 email-enumeration protection: regardless of result (success or error),
    // show the generic "check your email" confirmation below. The server hook
    // sendResetPassword fires only for real accounts. The client never surfaces
    // whether the email exists.
    await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });

    setSubmitting(false);
    setSubmitted(true);
  }

  // Post-submit confirmation state — generic message shown for BOTH success and error.
  if (submitted) {
    return (
      <div className="flex flex-col flex-1 lg:w-1/2 w-full">
        <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
          <Link
            href="/signin"
            className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <ChevronLeftIcon />
            Back to sign in
          </Link>
        </div>
        <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
          <div className="rounded-lg border border-success-200 bg-success-50 p-4 dark:border-success-900 dark:bg-success-950">
            <p className="text-sm text-success-700 dark:text-success-400">
              Check your email. If an account exists for that address, a password
              reset link is on its way.
            </p>
          </div>
          <div className="mt-5">
            <Link
              href="/signin"
              className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
        <Link
          href="/signin"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon />
          Back to sign in
        </Link>
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Forgot Password
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your email and we&apos;ll send you a link to reset your
              password.
            </p>
          </div>
          <div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <Label>
                    Email <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    placeholder="info@gmail.com"
                    type="email"
                    name="email"
                  />
                </div>
                <div>
                  <Button className="w-full" size="sm" disabled={submitting}>
                    {submitting ? "Sending…" : "Send reset link"}
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Remembered your password?{" "}
                <Link
                  href="/signin"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
