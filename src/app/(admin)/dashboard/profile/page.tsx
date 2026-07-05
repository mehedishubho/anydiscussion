// src/app/(admin)/dashboard/profile/page.tsx
// [CITED: 04-03-PLAN.md Task 2 — wire profile to real user data per D-09]
// [CITED: 04-CONTEXT.md D-09 (self-service profile — any role edits own name/bio/avatar)]
// [CITED: 04-01-SUMMARY.md — page was moved here from (others-pages)/profile by Plan 04-01]
//
// Server Component. Reads the current session (getSession) and passes the user's
// real fields to ProfileForm. The previous content was the TailAdmin demo
// (UserMetaCard / UserInfoCard / UserAddressCard) — fully replaced here.
//
// D-09 self-service: any signed-in role may edit their own name/bio/avatar. The
// role field is intentionally absent from ProfileForm — self-edit cannot change
// role (T-04-11 — defense in depth; the server strips role on the self-edit path
// regardless of what the client sends).
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { getSession } from "@/lib/auth";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";

export const metadata: Metadata = {
  title: "Profile | Any Discussion",
  description: "Edit your profile",
};

// The shape ProfileForm consumes. Better Auth additionalFields (bio, avatar per
// AUTH-08) are present on session.user but typed loosely; cast through unknown
// to the local shape so the client form gets typed props.
export type ProfileUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  bio: string | null;
  avatar: string | null;
};

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) {
    // The (admin) AuthGate should already redirect before we get here, but fail
    // closed defensively (Phase 2 Pitfall #1 — never trust the upstream gate).
    redirect("/signin");
  }

  const user: ProfileUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role ?? null,
    // AUTH-08 extended fields — present on the row, optional in the schema.
    bio: (session.user as { bio?: string | null }).bio ?? null,
    avatar: (session.user as { avatar?: string | null }).avatar ?? null,
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Profile" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            My profile
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Edit your name, bio, and avatar. Role changes are managed by an admin.
          </p>
        </div>
        <ProfileForm initialUser={user} />
      </div>
    </div>
  );
}
