"use client";
// src/components/auth/SignUpForm.tsx
// [CITED: 02-02-PLAN.md Task 1 Step D — rebind to createFirstAdmin]
// [CITED: 02-CONTEXT.md D-05/D-06/D-07 — repurposed as the first-run admin-creation form]
//
// Bound to the createFirstAdmin Server Action. Social-auth (Google/X) buttons REMOVED
// (locked exclusion — out of scope for v1). The setup page only renders this form when
// count(admins)===0 (the page Server Component handles that gate — D-06/D-07/D-08).
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import React, { useState } from "react";
import { createFirstAdmin } from "@/actions/users";

type State =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };

async function setupAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) {
    return { status: "error", message: "All fields are required." };
  }

  try {
    await createFirstAdmin({ name, email, password });
    return { status: "success" };
  } catch (error) {
    // Log the real cause server-side (dev diagnosis); return a generic message
    // to the client so we don't leak whether an admin exists (T-02-04 email/enum).
    console.error("[createFirstAdmin] failed:", error);
    return {
      status: "error",
      message:
        "Setup is unavailable. An admin account may already exist — try signing in instead.",
    };
  }
}

export default function SignUpForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = React.useActionState<State, FormData>(
    setupAction,
    { status: "idle" },
  );

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full overflow-y-auto no-scrollbar">
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
              Create Admin Account
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Set up the first administrator account to get started. This screen
              disables itself once an admin exists.
            </p>
          </div>
          <div>
            <form action={formAction}>
              <div className="space-y-5">
                {/* Name */}
                <div>
                  <Label>
                    Name<span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    id="name"
                    name="name"
                    placeholder="Enter the admin name"
                  />
                </div>
                {/* Email */}
                <div>
                  <Label>
                    Email<span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="Enter the admin email"
                  />
                </div>
                {/* Password */}
                <div>
                  <Label>
                    Password<span className="text-error-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      placeholder="Enter a password (min 8 chars)"
                      type={showPassword ? "text" : "password"}
                      id="password"
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
                {/* Error / success messaging */}
                {state.status === "error" && (
                  <p
                    role="alert"
                    className="text-sm text-error-500 dark:text-error-400"
                  >
                    {state.message}
                  </p>
                )}
                {state.status === "success" && (
                  <div className="rounded-lg border border-success-200 bg-success-50 p-4 dark:border-success-900 dark:bg-success-950">
                    <p className="text-sm text-success-700 dark:text-success-400">
                      Admin account created. Redirecting to sign in…
                    </p>
                  </div>
                )}
                {/* Submit */}
                <div>
                  <button
                    type="submit"
                    disabled={pending || state.status === "success"}
                    className="flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-white transition rounded-lg bg-brand-500 shadow-theme-xs hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {pending ? "Creating admin…" : "Create Admin Account"}
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Already have an account?
                <Link
                  href="/signin"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  {" "}
                  Sign In
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
