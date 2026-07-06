"use client";
// src/app/(admin)/dashboard/users/UserDrawer.tsx
// [CITED: 04-03-PLAN.md Task 2 — side drawer for create/edit + revoke sessions]
// [CITED: 04-CONTEXT.md D-07 (drawer UX), D-09 (admin can edit anyone), D-11 (role dropdown)]
// [CITED: 04-CONTEXT.md D-27 — create/edit = NON-optimistic (server confirms credentials)]
//
// Side drawer (reuses Modal shell). RHF + Zod form. Two modes:
//   - create: name, email, password, role, bio, avatar → createUser
//   - edit:   name, role, bio, avatar (password hidden) → updateUser
//
// AVATAR FIELD — MediaPicker (Plan 04-02, merged):
//   The avatar field reuses the <MediaPicker> modal via setValue('avatar', url),
//   mirroring PostForm's feature-image field (useState open-state, watch() preview,
//   Replace/Remove + Select-image buttons, next/image thumbnail).
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import Image from "next/image";
import { Modal } from "@/components/ui/modal";
import { createUser, updateUser } from "@/actions/users";
import MediaPicker from "@/components/dashboard/media/MediaPicker";
import type { UserRow } from "./page";

// Zod schema — shared client-side validation. Mirrors the server action's input
// shape. Password is required on create; on edit the field is hidden and the
// resolver's .optional() keeps validation green when it's empty.
const userDrawerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional()
    .or(z.literal("")),
  role: z.enum(["admin", "editor", "author"]),
  bio: z.string().optional().or(z.literal("")),
  avatar: z.string().optional().or(z.literal("")),
});
type UserDrawerInput = z.infer<typeof userDrawerSchema>;

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

interface UserDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (refreshedList?: UserRow[]) => void;
  editingUser: UserRow | null;
}

export default function UserDrawer({
  isOpen,
  onClose,
  onSuccess,
  editingUser,
}: UserDrawerProps) {
  const isEdit = !!editingUser;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserDrawerInput>({
    resolver: zodResolver(userDrawerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "author",
      bio: "",
      avatar: "",
    },
  });
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const avatarValue = watch("avatar");

  // Reset form values whenever the drawer opens or the target user changes.
  useEffect(() => {
    if (isOpen) {
      reset({
        name: editingUser?.name ?? "",
        email: editingUser?.email ?? "",
        password: "", // never pre-fill password
        role: (editingUser?.role as "admin" | "editor" | "author") ?? "author",
        bio: editingUser?.bio ?? "",
        avatar: editingUser?.avatar ?? "",
      });
    }
  }, [isOpen, editingUser, reset]);

  // NON-optimistic create/edit per D-27 (server confirms credentials before close).
  // On success, notify parent so it can refresh the table list.
  const createMutation = useMutation({
    mutationFn: (values: UserDrawerInput) =>
      createUser({
        name: values.name,
        email: values.email,
        password: values.password ?? "",
        role: values.role,
      }),
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const editMutation = useMutation({
    mutationFn: (values: UserDrawerInput) => {
      if (!editingUser) throw new Error("No user selected for edit");
      return updateUser(editingUser.id, {
        name: values.name,
        role: values.role,
        bio: values.bio || undefined,
        avatar: values.avatar || undefined,
      });
    },
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const isPending = createMutation.isPending || editMutation.isPending;
  const submitError = createMutation.error?.message || editMutation.error?.message || null;

  const onValid = (values: UserDrawerInput) => {
    if (isEdit) {
      editMutation.mutate(values);
    } else {
      // Create-mode password gate — schema allows empty (for edit), enforce here.
      if (!values.password || values.password.length < 8) {
        return;
      }
      createMutation.mutate(values);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-xl">
      <div className="max-h-[90vh] overflow-y-auto p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          {isEdit ? `Edit ${editingUser?.name}` : "New team member"}
        </h3>

        <form onSubmit={handleSubmit(onValid)} className="space-y-4">
          <div>
            <label htmlFor="user-name" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Name
            </label>
            <input
              id="user-name"
              {...register("name")}
              placeholder="Full name"
              className={`${INPUT_CLASS} ${errors.name ? "border-error-500" : ""}`}
            />
            {errors.name && (
              <p className="mt-1.5 text-xs text-error-500">{errors.name.message as string}</p>
            )}
          </div>

          <div>
            <label htmlFor="user-email" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Email
            </label>
            <input
              id="user-email"
              type="email"
              {...register("email")}
              placeholder="name@example.com"
              className={`${INPUT_CLASS} ${errors.email ? "border-error-500" : ""}`}
              disabled={isEdit}
            />
            {errors.email && (
              <p className="mt-1.5 text-xs text-error-500">{errors.email.message as string}</p>
            )}
            {isEdit && (
              <p className="mt-1 text-xs text-gray-500">Email cannot be changed after creation.</p>
            )}
          </div>

          {!isEdit && (
            <div>
              <label htmlFor="user-password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Password
              </label>
              <input
                id="user-password"
                type="password"
                {...register("password")}
                placeholder="Min 8 characters"
                className={`${INPUT_CLASS} ${errors.password ? "border-error-500" : ""}`}
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-error-500">{errors.password.message as string}</p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="user-role" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Role
            </label>
            <select
              id="user-role"
              {...register("role")}
              className={`${INPUT_CLASS} ${errors.role ? "border-error-500" : ""}`}
            >
              <option value="author">Author (create/edit own posts; submit for review)</option>
              <option value="editor">Editor (edit/publish any post; manage taxonomy)</option>
              <option value="admin">Admin (full access — users, settings, everything)</option>
            </select>
            {errors.role && (
              <p className="mt-1.5 text-xs text-error-500">{errors.role.message as string}</p>
            )}
          </div>

          <div>
            <label htmlFor="user-bio" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Bio
            </label>
            <textarea
              id="user-bio"
              {...register("bio")}
              placeholder="Short biography (shows in bylines)"
              rows={3}
              className={`${INPUT_CLASS} h-auto py-2.5`}
            />
          </div>

          <div>
            <label htmlFor="user-avatar" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Avatar
            </label>
            {/* Hidden RHF registration — keeps avatar in the form schema so Zod
                validation still runs. The visible UI is the Select-image button +
                thumbnail preview. The picker calls setValue('avatar', url). */}
            <input
              type="hidden"
              {...register("avatar")}
              aria-hidden
            />
            {avatarValue ? (
              <div className="flex items-start gap-4 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                  <Image
                    src={avatarValue}
                    alt="Avatar preview"
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="break-all text-xs text-gray-500">{avatarValue}</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setAvatarPickerOpen(true)}
                      className="text-xs font-medium text-brand-500 hover:text-brand-600"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue("avatar", "", { shouldValidate: true })}
                      className="text-xs font-medium text-error-500 hover:text-error-600"
                    >
                      Remove image
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAvatarPickerOpen(true)}
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
              >
                Select image
              </button>
            )}
            <MediaPicker
              isOpen={avatarPickerOpen}
              onClose={() => setAvatarPickerOpen(false)}
              onSelect={(url) => {
                setValue("avatar", url, { shouldValidate: true });
                setAvatarPickerOpen(false);
              }}
            />
          </div>

          {submitError && (
            <div className="rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
              {submitError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
