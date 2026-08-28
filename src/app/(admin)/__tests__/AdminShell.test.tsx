// src/app/(admin)/__tests__/AdminShell.test.tsx
// @vitest-environment jsdom
// [CITED: 260828-g2h-PLAN.md Task 1 <behavior> — regression pin: AdminShell
//  supplies the QueryClient to its own header, no outer provider needed]
// [CITED: 260827-se8-PLAN.md Task 8 — the header islands (GlobalSearch,
//  NotificationDropdown) whose useQuery/useQueryClient calls threw during
//  SSR when AppHeader rendered OUTSIDE the shell's QueryProvider]
// [CITED: src/app/(admin)/dashboard/settings/backup/__tests__/BackupSettingsForm.test.tsx
//  — jsdom + testing-library + vi.hoisted action-mock pattern]
//
// The regression: since 260827-se8 put live TanStack Query islands into the
// header, AdminShell mounted AppHeader as a SIBLING ABOVE the QueryProvider
// that wrapped only {children}. The islands' useQuery/useQueryClient calls
// threw "No QueryClient set" during server rendering, so every dashboard page
// fell back to client rendering with a recoverable-error banner. 260828-g2h
// hoists the provider over AppHeader + the page-content div.
//
// Mock strategy: both "use server" action modules (@/actions/search,
// @/actions/notifications) are replaced with vi.fn spies so no drizzle /
// better-auth module ever loads in jsdom. The bell's unread-count query fires
// AT MOUNT (enabled by default), so countUnreadNotifications must resolve 0
// even though the test never opens the dropdown; the other action spies are
// safety nets for paths the test never triggers. next/navigation's
// usePathname is stubbed because jsdom has no App Router: outside Next the
// hook returns null (PathnameContext default) and AppSidebar's prefix-match
// `pathname.startsWith(path + "/")` would throw a TypeError that would mask
// the "No QueryClient set" error this suite pins.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";

// --- Hoisted action spies (mock factory needs them at hoist time) ---
const {
  globalSearchMock,
  countUnreadNotificationsMock,
  listNotificationsMock,
  markNotificationsReadMock,
} = vi.hoisted(() => ({
  globalSearchMock: vi.fn(),
  countUnreadNotificationsMock: vi.fn(),
  listNotificationsMock: vi.fn(),
  markNotificationsReadMock: vi.fn(),
}));

vi.mock("@/actions/search", () => ({
  globalSearch: (...a: unknown[]) => globalSearchMock(...a),
}));

vi.mock("@/actions/notifications", () => ({
  countUnreadNotifications: (...a: unknown[]) => countUnreadNotificationsMock(...a),
  listNotifications: (...a: unknown[]) => listNotificationsMock(...a),
  markNotificationsRead: (...a: unknown[]) => markNotificationsReadMock(...a),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

// src/icons/index re-exports ~54 .svg assets as default imports. Under
// webpack/SVGR they are components; under vitest (no SVGR plugin) Vite
// inlines them as data:image/svg+xml strings, and React then uses the string
// as an element type — jsdom rejects it ("did not match the Name
// production"). Stub the ten icons AppSidebar imports so the sidebar renders
// without loading any SVG asset. Icons are purely presentational here.
vi.mock("@/icons/index", () => {
  const stub = () => null;
  return {
    __esModule: true,
    BoxCubeIcon: stub,
    BoxIcon: stub,
    ChevronDownIcon: stub,
    GridIcon: stub,
    HorizontaLDots: stub,
    ListIcon: stub,
    PageIcon: stub,
    PlugInIcon: stub,
    UserCircleIcon: stub,
    UserIcon: stub,
  };
});

import AdminShell from "../AdminShell";
import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";

/** Mirrors the AuthGate prop shape ((admin)/layout.tsx). avatar:null → UserDropdown initials fallback, no next/image. */
const testUser = {
  name: "Shell Test User",
  email: "shell.test@example.com",
  avatar: null,
};

/** Probe child: renders its marker only if a QueryClient is available where {children} render. */
function QueryClientProbe() {
  useQueryClient();
  return <span data-testid="query-client-probe" />;
}

/**
 * Render the FULL shell with NO QueryClientProvider anywhere in the wrapper —
 * that absence IS the regression. Only the two providers the real tree gives
 * the shell outside (admin): SidebarProvider + ThemeProvider (root layout).
 * Providers/mocks stay local to this file — no shared exports.
 */
function renderShell(children: React.ReactNode = "shell page content") {
  return render(
    <ThemeProvider>
      <SidebarProvider>
        <AdminShell role="admin" user={testUser}>
          {children}
        </AdminShell>
      </SidebarProvider>
    </ThemeProvider>,
  );
}

describe("AdminShell supplies the QueryClient to its own header (260828-g2h)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalSearchMock.mockResolvedValue({ posts: [], users: [], categories: [], tags: [] });
    countUnreadNotificationsMock.mockResolvedValue(0);
    listNotificationsMock.mockResolvedValue([]);
    markNotificationsReadMock.mockResolvedValue({ ok: true });
  });
  afterEach(() => cleanup());

  it("renders both header islands + page content with NO outer QueryClientProvider", () => {
    renderShell();
    // Search island input (GlobalSearch)
    expect(screen.getByPlaceholderText("Search or type command...")).not.toBeNull();
    // Bell island button (aria-label "Notifications" / "Notifications (N unread)")
    expect(screen.getByRole("button", { name: /^Notifications/i })).not.toBeNull();
    // Page content still rendered inside the shell
    expect(screen.getByText("shell page content")).not.toBeNull();
  });

  it("keeps {children} inside the provider — useQueryClient probe renders instead of throwing", () => {
    renderShell(<QueryClientProbe />);
    expect(screen.getByTestId("query-client-probe")).not.toBeNull();
  });

  it("the bell's mount-time unread query rides the shell's provider (countUnreadNotifications called)", async () => {
    renderShell();
    await waitFor(() => {
      expect(countUnreadNotificationsMock).toHaveBeenCalled();
    });
  });
});
