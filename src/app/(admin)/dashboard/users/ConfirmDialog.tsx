"use client";
// src/app/(admin)/dashboard/users/ConfirmDialog.tsx
// [CITED: 260824-u1b-PLAN.md Task 1 — row-action confirms moved from the native
//  browser confirm popup into this TailAdmin Modal wrapper per owner UAT
//  feedback; sibling of UserDrawer on the same Modal shell]
//
// Small confirmation dialog for the users table's four row actions (unban /
// ban / revoke sessions / delete). The parent (UsersTable) owns the pending
// target — kind + user — and derives title/description/confirmLabel/danger
// from its CONFIRM_CONTENT map, so this component stays presentational:
// it renders the copy it is given, disables both buttons while the mutation
// is pending, and reports onClose (Cancel / Escape / backdrop click — all
// inherited from the shared Modal shell) and onConfirm back to the parent.
import { Modal } from "@/components/ui/modal";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  danger?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  danger = false,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-6">
        <h3 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
          {title}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium shadow-theme-xs disabled:cursor-not-allowed disabled:opacity-50 ${
              danger
                ? "bg-error-500 text-white hover:bg-error-600"
                : "bg-gray-800 text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
            }`}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
