"use client";
// src/app/(admin)/dashboard/profile/PasswordForm.tsx
// [CITED: 260827-869-PLAN.md Task 3 <action> step 4 — Change password card]
// [CITED: 04-CONTEXT.md D-27 — NON-optimistic mutation (single-source credential)]
//
// Client component for self-service password change (any signed-in role).
// RHF + Zod + TanStack useMutation, modeled on ProfileForm.tsx: same
// INPUT_CLASS, same error/success banner markup, so the two cards on the
// profile page look identical.
//
// Local form schema = changePasswordSchema's field rules + confirmPassword,
// with superRefine for the two cross-field rules (confirm must match; new
// must differ from current). The shared changePasswordSchema itself lives in
// src/actions/users-schema.ts and is re-applied server-side inside
// changeOwnPassword — client validation is UX only, the Zod gate in the
// action is the contract.
//
// Error mapping: production flights forward digests, never .message (CR-02) —
// so the failure banner maps err.digest via CHANGE_PASSWORD_ERROR_MESSAGES
// with a CHANGE_FAILED fallback (same pattern UsersTable uses for delete
// errors). "Password updated." on success; fields reset (passwords should not
// linger in the DOM after a successful change).
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { changeOwnPassword } from "@/actions/users";
import {
  CHANGE_PASSWORD_ERROR_MESSAGES,
  type ChangePasswordDigest,
} from "@/actions/users-schema";

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .superRefine((values, ctx) => {
    if (values.confirmPassword !== values.newPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
    if (values.newPassword === values.currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "New password must be different from the current password",
      });
    }
  });

type PasswordFormInput = z.infer<typeof passwordFormSchema>;

// Identical to ProfileForm's input styling — the two cards render side by side
// on the profile page and must look the same.
const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const LABEL_CLASS =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

export default function PasswordForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormInput>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // D-27 NON-optimistic — the credential is the single-source user secret;
  // wait for the server (which re-verifies the current password) before
  // flipping UI state.
  const mutation = useMutation({
    mutationFn: (values: PasswordFormInput) =>
      changeOwnPassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      // Clear the fields — passwords must not linger in the DOM after a
      // successful change (the endpoint already revoked other sessions).
      reset();
    },
  });

  const onValid = (values: PasswordFormInput) => {
    mutation.mutate(values);
  };

  // Digest-only mapping (CR-02): production flights forward err.digest, never
  // err.message. Unknown/missing digest → the CHANGE_FAILED fallback copy.
  const mutationError = mutation.error as
    | (Error & { digest?: string })
    | null;
  const submitError = mutationError
    ? CHANGE_PASSWORD_ERROR_MESSAGES[
        (mutationError.digest ?? "CHANGE_FAILED") as ChangePasswordDigest
      ]
    : null;
  const isSubmitting = mutation.isPending;
  const succeeded = mutation.isSuccess;

  return (
    <form onSubmit={handleSubmit(onValid)} className="max-w-xl space-y-5">
      <div>
        <label htmlFor="current-password" className={LABEL_CLASS}>
          Current password
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          placeholder="Your current password"
          {...register("currentPassword")}
          className={`${INPUT_CLASS} ${errors.currentPassword ? "border-error-500" : ""}`}
        />
        {errors.currentPassword && (
          <p className="mt-1.5 text-xs text-error-500">
            {errors.currentPassword.message as string}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="new-password" className={LABEL_CLASS}>
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          {...register("newPassword")}
          className={`${INPUT_CLASS} ${errors.newPassword ? "border-error-500" : ""}`}
        />
        {errors.newPassword && (
          <p className="mt-1.5 text-xs text-error-500">
            {errors.newPassword.message as string}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="confirm-password" className={LABEL_CLASS}>
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat the new password"
          {...register("confirmPassword")}
          className={`${INPUT_CLASS} ${errors.confirmPassword ? "border-error-500" : ""}`}
        />
        {errors.confirmPassword && (
          <p className="mt-1.5 text-xs text-error-500">
            {errors.confirmPassword.message as string}
          </p>
        )}
      </div>

      {submitError && (
        <div className="rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {submitError}
        </div>
      )}
      {succeeded && (
        <div className="rounded-lg border border-success-300 bg-success-50 p-3 text-sm text-success-700 dark:border-success-700 dark:bg-success-900/20 dark:text-success-300">
          Password updated.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
