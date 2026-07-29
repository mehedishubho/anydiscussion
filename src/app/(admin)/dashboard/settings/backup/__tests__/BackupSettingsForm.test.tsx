// src/app/(admin)/dashboard/settings/backup/__tests__/BackupSettingsForm.test.tsx
// @vitest-environment jsdom
// [CITED: 08-04-PLAN.md Task 2 <behavior> + <acceptance_criteria>]
// [CITED: 08-VALIDATION.md Wave 0 row 08-04-2 — multi-select + restore confirmation]
// [CITED: 08-CONTEXT.md D-01 (multi-select), D-05 (Restore confirmation), D-09 (defaults)]
// [CITED: src/components/auth/__tests__/SignInForm.test.tsx — jsdom + testing-library + vi.hoisted pattern]
// [CITED: src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx — the verbatim analog]
// [CITED: BACKUP-05, T-08-04 (admin gate), Pitfall 7 (secret fields never pre-filled)]
//
// Wave-0 BackupSettingsForm component tests proving the D-01 multi-select delta + D-05 Restore gate:
//   - THREE destination checkboxes render + can ALL be checked simultaneously (multi-select — the
//     key delta vs Storage Settings' single active-provider select).
//   - Secret credential fields render EMPTY (never pre-filled — Pitfall 7).
//   - The Restore button is DISABLED until the typed confirmation matches the expected DB name
//     (D-05 destructive-overwrite gate); typing the correct phrase enables it.
//   - "Backup now" invokes triggerBackupNow (mock assertion).
//
// Mock strategy: the 8 Server Actions in @/actions/backup-settings are replaced with vi.fn spies so
// the form never crosses the client/server boundary. The real Zod schema (schema-client bridge) is
// used so client+server contract stays provably the same. A QueryClientProvider wraps the form
// because the save path uses TanStack useMutation (NOT optimistic — high-stakes credentials, D-27).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- Hoisted action spies (mock factory needs them at hoist time) ---
const {
  saveBackupSettingsMock,
  getBackupSettingsMock,
  testBackupConnectionMock,
  triggerBackupNowMock,
  restoreBackupMock,
  listBackupsMock,
  getGoogleConsentUrlMock,
  disconnectGoogleDriveMock,
} = vi.hoisted(() => ({
  saveBackupSettingsMock: vi.fn(),
  getBackupSettingsMock: vi.fn(),
  testBackupConnectionMock: vi.fn(),
  triggerBackupNowMock: vi.fn(),
  restoreBackupMock: vi.fn(),
  listBackupsMock: vi.fn(),
  getGoogleConsentUrlMock: vi.fn(),
  disconnectGoogleDriveMock: vi.fn(),
}));

vi.mock("@/actions/backup-settings", () => ({
  saveBackupSettings: (...a: unknown[]) => saveBackupSettingsMock(...a),
  getBackupSettings: (...a: unknown[]) => getBackupSettingsMock(...a),
  testBackupConnection: (...a: unknown[]) => testBackupConnectionMock(...a),
  triggerBackupNow: (...a: unknown[]) => triggerBackupNowMock(...a),
  restoreBackup: (...a: unknown[]) => restoreBackupMock(...a),
  listBackups: (...a: unknown[]) => listBackupsMock(...a),
  getGoogleConsentUrl: (...a: unknown[]) => getGoogleConsentUrlMock(...a),
  disconnectGoogleDrive: (...a: unknown[]) => disconnectGoogleDriveMock(...a),
}));

import BackupSettingsForm from "../BackupSettingsForm";
import type { BackupSettingsFormProps } from "../BackupSettingsForm";

/** Redacted initial settings (mirrors getBackupSettings output — secrets empty, Pitfall 7). */
const initialRedacted: BackupSettingsFormProps["initial"] = {
  destinations: { local: true, r2: false, gdrive: false },
  scheduleCron: "0 3 * * *",
  retentionDays: 30,
  drillEnabled: true,
  drillCron: "0 4 * * 0",
  alertEmail: "ops@example.com",
  r2: {
    endpoint: "https://r2.example.com",
    region: "auto",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "", // Pitfall 7 — never pre-filled
    bucket: "backups",
    forcePathStyle: true,
  },
  gdriveConnected: false,
};

const defaultProps: BackupSettingsFormProps = {
  initial: initialRedacted,
  backups: [{ destination: "local", key: "anydiscussion-20260729-0300.sqlc" }],
  confirmationPhrase: "testdb",
};

/** Wrap the form in a QueryClientProvider (save path uses TanStack useMutation). */
function renderForm(props: Partial<BackupSettingsFormProps> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <BackupSettingsForm {...defaultProps} {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

describe("D-01: destination multi-select — three checkboxes all toggleable simultaneously", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveBackupSettingsMock.mockResolvedValue({ ok: true });
  });
  afterEach(() => cleanup());

  it("renders all three destination checkboxes (Local / R2 / Google Drive)", () => {
    renderForm();
    // getByLabelText throws if absent — explicit null check documents the expectation.
    expect(screen.getByLabelText("Local filesystem")).not.toBeNull();
    expect(screen.getByLabelText("Cloudflare R2")).not.toBeNull();
    expect(screen.getByLabelText("Google Drive")).not.toBeNull();
  });

  it("all three destination checkboxes can be CHECKED at the same time (multi-select delta)", () => {
    renderForm();
    const local = screen.getByLabelText("Local filesystem") as HTMLInputElement;
    const r2 = screen.getByLabelText("Cloudflare R2") as HTMLInputElement;
    const gdrive = screen.getByLabelText("Google Drive") as HTMLInputElement;

    // local is default-on; tick r2 + gdrive so all three are checked.
    fireEvent.click(r2);
    fireEvent.click(gdrive);

    expect(local.checked).toBe(true);
    expect(r2.checked).toBe(true);
    expect(gdrive.checked).toBe(true);
  });
});

describe("Pitfall 7: secret credential fields render EMPTY (never pre-filled)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveBackupSettingsMock.mockResolvedValue({ ok: true });
  });
  afterEach(() => cleanup());

  it("r2.secretAccessKey renders with an empty value even though non-secret fields pre-fill", () => {
    renderForm();
    // Enable r2 so its credential section is visible.
    fireEvent.click(screen.getByLabelText("Cloudflare R2"));

    const secret = screen.getByLabelText("R2 secret access key") as HTMLInputElement;
    expect(secret.value).toBe("");
    // Non-secret fields ARE pre-filled (the redacted initial carries them).
    const bucket = screen.getByLabelText("R2 bucket") as HTMLInputElement;
    expect(bucket.value).toBe("backups");
  });
});

describe("D-05: Restore is gated behind type-the-DB-name confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreBackupMock.mockResolvedValue({ ok: true });
  });
  afterEach(() => cleanup());

  it("Restore button is DISABLED until the typed confirmation matches the DB name", () => {
    renderForm();
    const confirmInput = screen.getByLabelText("Type the database name to confirm restore");
    const restoreBtn = screen.getByRole("button", { name: /restore latest/i }) as HTMLButtonElement;

    // Initially disabled — the destructive gate is not yet satisfied.
    expect(restoreBtn.disabled).toBe(true);

    // Wrong text → still disabled.
    fireEvent.change(confirmInput, { target: { value: "wrong-name" } });
    expect(restoreBtn.disabled).toBe(true);

    // Correct phrase → enabled.
    fireEvent.change(confirmInput, { target: { value: "testdb" } });
    expect(restoreBtn.disabled).toBe(false);
  });

  it("clicking an enabled Restore calls restoreBackup (latest, no key)", async () => {
    renderForm();
    const confirmInput = screen.getByLabelText("Type the database name to confirm restore");
    fireEvent.change(confirmInput, { target: { value: "testdb" } });

    const restoreBtn = screen.getByRole("button", { name: /restore latest/i }) as HTMLButtonElement;
    expect(restoreBtn.disabled).toBe(false);
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(restoreBackupMock).toHaveBeenCalled();
    });
  });
});

describe("'Backup now' invokes triggerBackupNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    triggerBackupNowMock.mockResolvedValue({ ok: true });
  });
  afterEach(() => cleanup());

  it("clicking 'Backup now' calls the triggerBackupNow Server Action", async () => {
    renderForm();
    const btn = screen.getByRole("button", { name: /backup now/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(triggerBackupNowMock).toHaveBeenCalledTimes(1);
    });
  });
});
