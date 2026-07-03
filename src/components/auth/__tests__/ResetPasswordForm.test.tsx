// src/components/auth/__tests__/ResetPasswordForm.test.tsx
// @vitest-environment jsdom
// [CITED: 02-04-PLAN.md Task 2 <behavior> — AUTH-06 reset-password UI; 4 cases]
// [CITED: T-02-10 — token validated server-side by Better Auth (consumeVerificationValue)]
//
// Mocks @/lib/auth/client so authClient.resetPassword is a vi.fn() spy, and
// next/navigation so useSearchParams/useRouter are controllable. The test NEVER
// hits the real Better Auth route.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// --- Mock authClient + next/navigation BEFORE importing ResetPasswordForm (vi.hoisted) ---
const { resetPasswordMock, searchParamsMock, pushMock } = vi.hoisted(() => ({
  resetPasswordMock: vi.fn(),
  searchParamsMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    resetPassword: resetPasswordMock,
  },
}));

// useSearchParams returns a URLSearchParams-like object we control per-test.
// useRouter returns an object whose `push` is the spy.
vi.mock("next/navigation", () => ({
  useSearchParams: searchParamsMock,
  useRouter: () => ({ push: pushMock }),
}));

// Mock @/icons — jsdom rejects SVG name attributes; replace with inert stubs.
vi.mock("@/icons", () => ({
  ChevronLeftIcon: () => null,
  EyeCloseIcon: () => null,
  EyeIcon: () => null,
}));

import ResetPasswordForm from "../ResetPasswordForm";

/** Helper: set the token query param value (null = no token in URL). */
function setToken(token: string | null) {
  const params = new URLSearchParams();
  if (token !== null) {
    params.set("token", token);
  }
  searchParamsMock.mockReturnValue(params);
}

/** Helper: fill the password field and submit the form. */
async function submitForm() {
  const form = document.querySelector("form")!;
  const inputs = form.querySelectorAll("input");
  const passwordInput = Array.from(inputs).find(
    (el) => el.getAttribute("name") === "newPassword",
  )!;

  fireEvent.change(passwordInput, { target: { value: "new-pass-123" } });
  fireEvent.submit(form);
}

describe("AUTH-06: ResetPasswordForm calls authClient.resetPassword with the verified signature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: token present, reset resolves successfully.
    setToken("abc123");
    resetPasswordMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("on submit, calls resetPassword once with { newPassword, token } and redirects to /signin", async () => {
    render(<ResetPasswordForm />);
    await submitForm();

    await waitFor(() => {
      expect(resetPasswordMock).toHaveBeenCalledTimes(1);
    });
    expect(resetPasswordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        newPassword: "new-pass-123",
        token: "abc123",
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/signin");
  });

  it("on success, router.push('/signin') is called so the user can authenticate with the new password", async () => {
    render(<ResetPasswordForm />);
    await submitForm();

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/signin");
    });
  });

  it("T-02-10: on error response, displays an error message and does NOT redirect", async () => {
    resetPasswordMock.mockResolvedValue({
      error: { message: "Invalid or expired token" },
    });

    render(<ResetPasswordForm />);
    await submitForm();

    // Error text must be visible.
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    // Must NOT have redirected.
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("T-02-10: when no token is in the URL, shows an error immediately and does NOT call resetPassword", async () => {
    // No token in the query string — the reset link is invalid.
    setToken(null);

    render(<ResetPasswordForm />);

    // Error state should be visible immediately (no form to submit).
    expect(screen.getByRole("alert")).toBeTruthy();
    // resetPassword must never be called — there is no token to send.
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });
});
