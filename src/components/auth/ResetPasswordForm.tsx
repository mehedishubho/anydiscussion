"use client";
// src/components/auth/ResetPasswordForm.tsx
// [CITED: 02-04-PLAN.md Task 2 — AUTH-06 reset-password UI; D-09 requireEmailVerification]
// [CITED: T-02-10 — token validated server-side by Better Auth (consumeVerificationValue)]
//
// Reads the `token` query param (set by Better Auth's GET /reset-password/:token callback
// which redirects to /reset-password?token=xxx). Calls authClient.resetPassword with the
// new password + token. On success → redirect to /signin so the user can authenticate.
//
// The inner component is wrapped in <Suspense> because useSearchParams() requires a
// Suspense boundary in Next 16 (static prerender compatibility — same as SignInForm).
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import React, { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

function ResetPasswordFormInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // T-02-10: no token in the URL → the reset link is invalid. Show an error
  // immediately and do NOT call resetPassword (there is nothing to send).
  if (!token) {
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
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Reset Password
            </h1>
          </div>
          <p
            role="alert"
            className="text-sm text-error-500 dark:text-error-400"
          >
            Invalid reset link — request a new one.
          </p>
          <div className="mt-5">
            <Link
              href="/forgot-password"
              className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const newPassword = String(formData.get("newPassword") ?? "");

    // `token` is guaranteed non-null here — the early `if (!token) return` above
    // renders the error state before this handler can be reached. The non-null
    // assertion satisfies TS (function declarations are hoisted, so the narrowing
    // from the control-flow guard does not carry into this closure).
    const result = await authClient.resetPassword({
      newPassword,
      token: token!,
    });

    setSubmitting(false);

    if (result?.error) {
      // T-02-10: the token was rejected by Better Auth (expired/forged/consumed).
      // Show the error; do NOT redirect.
      setError(result.error.message ?? "Invalid or expired token.");
      return;
    }

    // On success, redirect to /signin so the user can authenticate with the
    // new password (D-09 — after reset the user must still sign in).
    router.push("/signin");
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
              Reset Password
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter a new password for your account.
            </p>
          </div>
          <div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <Label>
                    New Password <span className="text-error-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your new password"
                      name="newPassword"
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
                <div>
                  <Button className="w-full" size="sm" disabled={submitting}>
                    {submitting ? "Resetting…" : "Reset password"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ResetPasswordForm — wraps the inner form in <Suspense> because useSearchParams()
 * requires a Suspense boundary in Next 16 (static prerender compatibility).
 */
export default function ResetPasswordForm() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordFormInner />
    </Suspense>
  );
}
