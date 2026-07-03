// src/components/auth/__tests__/ForgotPasswordForm.test.tsx
// @vitest-environment jsdom
// [CITED: 02-04-PLAN.md Task 1 <behavior> — AUTH-06 forgot-password UI; 4 cases]
// [CITED: T-02-04 — email-enumeration protection: never reveal whether email exists]
//
// Mocks @/lib/auth/client so authClient.requestPasswordReset is a vi.fn() spy.
// The test NEVER hits the real Better Auth route. Uses fireEvent.submit to
// exercise the form onSubmit handler.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// --- Mock authClient BEFORE importing ForgotPasswordForm (vi.hoisted for hoist-safe spies) ---
const { requestPasswordResetMock } = vi.hoisted(() => ({
  requestPasswordResetMock: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    requestPasswordReset: requestPasswordResetMock,
  },
}));

// Mock @/icons — jsdom's DOMParser rejects SVG data-URI `name` attributes on the icon
// components (InvalidCharacterError). Replace with inert stubs.
vi.mock("@/icons", () => ({
  ChevronLeftIcon: () => null,
}));

import ForgotPasswordForm from "../ForgotPasswordForm";

/** Helper: fill the email field and submit the form. */
async function submitForm() {
  const form = document.querySelector("form")!;
  const inputs = form.querySelectorAll("input");
  const emailInput = Array.from(inputs).find(
    (el) => el.getAttribute("name") === "email",
  )!;

  fireEvent.change(emailInput, { target: { value: "admin@example.com" } });
  fireEvent.submit(form);
}

describe("AUTH-06: ForgotPasswordForm calls authClient.requestPasswordReset with the verified signature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: request resolves successfully.
    requestPasswordResetMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("on submit, calls requestPasswordReset once with { email, redirectTo: '/reset-password' }", async () => {
    render(<ForgotPasswordForm />);
    await submitForm();

    await waitFor(() => {
      expect(requestPasswordResetMock).toHaveBeenCalledTimes(1);
    });
    expect(requestPasswordResetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "admin@example.com",
        redirectTo: "/reset-password",
      }),
    );
  });

  it("on success, displays the 'check your email' confirmation message", async () => {
    render(<ForgotPasswordForm />);
    await submitForm();

    // getByText throws if not found; waitFor retries until it appears.
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeTruthy();
    });
  });

  it("T-02-04: on error response, STILL shows the same 'check your email' message (never reveals whether email exists)", async () => {
    // Simulate an error response from the server.
    requestPasswordResetMock.mockResolvedValue({
      error: { message: "User not found" },
    });

    render(<ForgotPasswordForm />);
    await submitForm();

    // The SAME generic confirmation must appear regardless of error.
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeTruthy();
    });
    // No error text should leak that reveals email existence.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("loading: the submit button is disabled and shows a loading label while the request is in flight", async () => {
    // Controllable promise so we can inspect the in-flight state before it resolves.
    let resolveRequest!: (value: unknown) => void;
    requestPasswordResetMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(<ForgotPasswordForm />);
    await submitForm();

    // While in flight, the button should be disabled with a loading label.
    await waitFor(() => {
      const button = screen.getByRole("button", {
        name: /sending/i,
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    // Release the pending request so the component can settle.
    resolveRequest({ error: null });
    await waitFor(() => {
      expect(requestPasswordResetMock).toHaveBeenCalledTimes(1);
    });
  });
});
