// src/components/auth/__tests__/SignInForm.test.tsx
// @vitest-environment jsdom
// [CITED: VALIDATION.md AUTH-02 rows — D-18 rememberMe + D-19 callbackURL]
// [CITED: 02-02-PLAN.md Task 2 <behavior> — 4 cases: checked/unchecked + next/fallback]
//
// Mocks @/lib/auth/client so authClient.signIn.email is a vi.fn() spy. The test
// NEVER hits the real Better Auth route. Uses @testing-library/react fireEvent.submit
// to exercise the form onSubmit handler.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// --- Mock authClient BEFORE importing SignInForm (vi.hoisted for hoist-safe spies) ---
const { signInEmailMock, searchParamsMock } = vi.hoisted(() => ({
  signInEmailMock: vi.fn(),
  searchParamsMock: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    signIn: {
      email: signInEmailMock,
    },
  },
}));

// Mock next/navigation — useSearchParams returns null in jsdom without a Next runtime.
// We control it via searchParamsMock which returns a URLSearchParams-like { get } object.
vi.mock("next/navigation", () => ({
  useSearchParams: searchParamsMock,
}));

// Mock @/icons — jsdom's DOMParser rejects SVG data-URI `name` attributes on the icon
// components (InvalidCharacterError). Replace with inert stubs so the component tree
// renders without triggering jsdom's Name production validation.
vi.mock("@/icons", () => ({
  ChevronLeftIcon: () => null,
  EyeCloseIcon: () => null,
  EyeIcon: () => null,
}));

import SignInForm from "../SignInForm";

/** Helper: fill the email + password fields and submit the form. */
async function submitForm() {
  // Query by name attribute — robust against placeholder text ambiguity.
  const form = document.querySelector("form")!;
  const inputs = form.querySelectorAll("input");
  const emailInput = Array.from(inputs).find(
    (el) => el.getAttribute("name") === "email",
  )!;
  const passwordInput = Array.from(inputs).find(
    (el) => el.getAttribute("name") === "password",
  )!;

  fireEvent.change(emailInput, { target: { value: "admin@example.com" } });
  fireEvent.change(passwordInput, { target: { value: "correct-horse" } });

  fireEvent.submit(form);
}

/**
 * Helper: set the mocked useSearchParams return value.
 * Pass `null` for no `next` param; pass a path string for `?next=<path>`.
 */
function setNextParam(next: string | null) {
  const params = new URLSearchParams();
  if (next !== null) {
    params.set("next", next);
  }
  searchParamsMock.mockReturnValue(params);
}

describe("AUTH-02 / D-18: SignInForm wires rememberMe to the 'Keep me logged in' checkbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setNextParam(null); // no next param by default
    // Default: signIn resolves successfully (redirect handled by caller).
    signInEmailMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("rememberMe: when checkbox is CHECKED, authClient.signIn.email receives rememberMe: true", async () => {
    render(<SignInForm />);

    // Tick the "Keep me logged in" checkbox.
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    await submitForm();

    await waitFor(() => {
      expect(signInEmailMock).toHaveBeenCalledTimes(1);
    });
    expect(signInEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ rememberMe: true }),
    );
  });

  it("rememberMe: when checkbox is UNCHECKED (default), authClient.signIn.email receives rememberMe: false", async () => {
    render(<SignInForm />);

    // Do NOT tick the checkbox — default state is unchecked.
    await submitForm();

    await waitFor(() => {
      expect(signInEmailMock).toHaveBeenCalledTimes(1);
    });
    expect(signInEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ rememberMe: false }),
    );
  });
});

describe("AUTH-02 / D-19: SignInForm wires callbackURL from the `next` search param", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInEmailMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("callbackURL: when ?next=/dashboard/posts/42 is present, signIn.email receives that path", async () => {
    setNextParam("/dashboard/posts/42");

    render(<SignInForm />);
    await submitForm();

    await waitFor(() => {
      expect(signInEmailMock).toHaveBeenCalledTimes(1);
    });
    expect(signInEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/dashboard/posts/42" }),
    );
  });

  it("callbackURL: when no `next` param is present, signIn.email receives '/dashboard' fallback (D-19)", async () => {
    setNextParam(null);

    render(<SignInForm />);
    await submitForm();

    await waitFor(() => {
      expect(signInEmailMock).toHaveBeenCalledTimes(1);
    });
    expect(signInEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/dashboard" }),
    );
  });
});
