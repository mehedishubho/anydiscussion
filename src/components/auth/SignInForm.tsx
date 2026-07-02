"use client";
// src/components/auth/SignInForm.tsx
// [CITED: 02-02-PLAN.md Task 2 Step 2 — wire to authClient.signIn.email]
// [CITED: 02-CONTEXT.md D-18 (remember-me) + D-19 (deep-link callbackURL)]
// [CITED: RESEARCH.md Code Examples lines 927-930 + Pattern 8 lines 697-713]
//
// Wires the existing TailAdmin signin form to Better Auth. The "Keep me logged in"
// Checkbox `isChecked` state maps to `rememberMe` (D-18 — checked=~30d, unchecked=browser-session).
// The `next` search param (set by proxy.ts on bounce) maps to `callbackURL` with
// `/dashboard` fallback (D-19 deep-link return).
//
// Social-auth (Google/X) buttons REMOVED (locked exclusion — out of scope for v1).
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";

/** Reads the `next` search param (set by proxy.ts) with /dashboard fallback (D-19). */
function useCallbackURL(): string {
  const params = useSearchParams();
  const next = params.get("next");
  // T-02-08 mitigation: do NOT accept absolute URLs — only same-origin paths.
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/dashboard";
}

function SignInFormInner() {
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const callbackURL = useCallbackURL();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    const result = await authClient.signIn.email({
      email,
      password,
      rememberMe: isChecked, // D-18 — checkbox state
      callbackURL, // D-19 — deep-link return or /dashboard
    });

    setSubmitting(false);

    if (result?.error) {
      // T-02-07 mitigation: generic message — do not reveal whether the email exists.
      setError("Invalid email or password.");
    }
    // On success, Better Auth's callbackURL handles the redirect client-side.
  }

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon />
          Back to dashboard
        </Link>
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Sign In
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your email and password to sign in!
            </p>
          </div>
          <div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <Label>
                    Email <span className="text-error-500">*</span>{" "}
                  </Label>
                  <Input
                    placeholder="info@gmail.com"
                    type="email"
                    name="email"
                  />
                </div>
                <div>
                  <Label>
                    Password <span className="text-error-500">*</span>{" "}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      name="password"
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                    >
                      {showPassword ? (
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                      )}
                    </span>
                  </div>
                </div>
                {error && (
                  <p
                    role="alert"
                    className="text-sm text-error-500 dark:text-error-400"
                  >
                    {error}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={isChecked} onChange={setIsChecked} />
                    <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">
                      Keep me logged in
                    </span>
                  </div>
                  <Link
                    href="/reset-password"
                    className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div>
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={submitting}
                  >
                    {submitting ? "Signing in…" : "Sign in"}
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Don&apos;t have an account? {""}
                <Link
                  href="/signup"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Sign Up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * SignInForm — wraps the inner form in <Suspense> because useSearchParams()
 * requires a Suspense boundary in Next 16 (static prerender compatibility).
 */
export default function SignInForm() {
  return (
    <Suspense fallback={null}>
      <SignInFormInner />
    </Suspense>
  );
}
