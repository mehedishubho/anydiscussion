"use client";
// src/app/(admin)/dashboard/profile/ProfileForm.tsx
// [CITED: 04-03-PLAN.md Task 2 — self-service profile form for any role (D-09)]
// [CITED: 04-CONTEXT.md D-27 — profile save is NON-optimistic (single-source user record)]
//
// Client component. RHF + Zod + TanStack useMutation. Fields: name, bio, avatar.
// NO role field (D-09 explicit — self-edit cannot change own role). Submit calls
// updateUser(session.user.id, { name, bio, avatar }) — the self-edit path strips
// role server-side anyway (T-04-11 defense in depth).
//
// AVATAR FIELD — MediaPicker (Plan 04-02, merged):
//   The avatar field reuses the <MediaPicker> modal via setValue('avatar', url),
//   mirroring PostForm's feature-image field (useState open-state, watch() preview,
//   Replace/Remove + Select-image buttons, next/image thumbnail).
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { updateUser } from "@/actions/users";
import MediaPicker from "@/components/dashboard/media/MediaPicker";
import type { ProfileUser } from "./page";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  bio: z.string().optional().or(z.literal("")),
  avatar: z.string().optional().or(z.literal("")),
});
type ProfileInput = z.infer<typeof profileSchema>;

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

export default function ProfileForm({ initialUser }: { initialUser: ProfileUser }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: initialUser.name,
      bio: initialUser.bio ?? "",
      avatar: initialUser.avatar ?? "",
    },
  });
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const avatarValue = watch("avatar");

  // D-27 NON-optimistic. Profile is the single-source user record; wait for the
  // server to confirm before flipping UI state. invalidate ['users'] on success
  // so any open dashboard admin tab reflects the new name/bio.
  const mutation = useMutation({
    mutationFn: (values: ProfileInput) =>
      // Self-edit path — updateUser detects userId === session.user.id and allows
      // the update without requireCan({user:['update']}). Role is omitted from the
      // payload entirely; even if a hostile client sent one, the server strips it.
      updateUser(initialUser.id, {
        name: values.name,
        bio: values.bio || undefined,
        avatar: values.avatar || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const onValid = (values: ProfileInput) => {
    mutation.mutate(values);
  };

  const submitError = mutation.error?.message ?? null;
  const isSubmitting = mutation.isPending;
  const succeeded = mutation.isSuccess;

  return (
    <form onSubmit={handleSubmit(onValid)} className="max-w-xl space-y-5">
      <div>
        <label htmlFor="profile-name" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Name
        </label>
        <input
          id="profile-name"
          {...register("name")}
          placeholder="Your name"
          className={`${INPUT_CLASS} ${errors.name ? "border-error-500" : ""}`}
        />
        {errors.name && (
          <p className="mt-1.5 text-xs text-error-500">{errors.name.message as string}</p>
        )}
      </div>

      <div>
        <label htmlFor="profile-email" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Email
        </label>
        <input
          id="profile-email"
          type="email"
          value={initialUser.email}
          disabled
          className={`${INPUT_CLASS} cursor-not-allowed opacity-70`}
        />
        <p className="mt-1 text-xs text-gray-500">Email cannot be changed here. Contact an admin.</p>
      </div>

      <div>
        <label htmlFor="profile-role" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Role
        </label>
        <input
          id="profile-role"
          value={initialUser.role ?? "author"}
          disabled
          className={`${INPUT_CLASS} cursor-not-allowed opacity-70`}
        />
        <p className="mt-1 text-xs text-gray-500">Role changes are managed by an admin (D-09 / T-04-11).</p>
      </div>

      <div>
        <label htmlFor="profile-bio" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Bio
        </label>
        <textarea
          id="profile-bio"
          {...register("bio")}
          placeholder="Short biography (shows in bylines)"
          rows={4}
          className={`${INPUT_CLASS} h-auto py-2.5`}
        />
      </div>

      <div>
        <label htmlFor="profile-avatar" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
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
      {succeeded && (
        <div className="rounded-lg border border-success-300 bg-success-50 p-3 text-sm text-success-700 dark:border-success-700 dark:bg-success-900/20 dark:text-success-300">
          Profile saved.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
