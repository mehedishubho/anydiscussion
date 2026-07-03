// src/app/(full-width-pages)/(auth)/reset-password/page.tsx
// [CITED: 02-04-PLAN.md Task 2 — AUTH-06 reset-password page]
//
// Thin Server Component delegation to ResetPasswordForm. The token is read
// client-side from the URL query param (no DB query or redirect gate here).
// This page is intentionally NOT in the proxy matcher — it is reached via an
// email reset link by a logged-out user carrying a token (see proxy.ts comment).
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password | Any Discussion",
  description: "Set a new password for your Any Discussion dashboard account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
