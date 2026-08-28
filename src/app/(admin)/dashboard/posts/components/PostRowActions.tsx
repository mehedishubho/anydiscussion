"use client";
// src/app/(admin)/dashboard/posts/components/PostRowActions.tsx
// [CITED: 05-06-PLAN.md Task 3C — role/status-aware row actions in the posts list]
// [CITED: CLAUDE.md "Roles & permissions" — this gating is UX-ONLY; publishPost ->
//        assertOwnsPost + transitionPost -> requireCan({post:["publish"]}) + the
//        TRANSITIONS table is the authority (authors are double-blocked server-side)]
// [CITED: 04-CONTEXT.md D-27 — status flips are high-stakes: NOT optimistic; the
//        mutation waits for server confirmation, then invalidates ["posts"]]
// [CITED: 260827-se8-PLAN.md Task 4 step 6 — the Return button]
//
// Renders a Publish link-button (editor/admin; draft or pending_review — on
// pending_review it doubles as "approve and publish"), a Submit-for-review
// link-button (author; draft only), and a Return link-button (editor/admin;
// pending_review only — sends the post back to draft via returnForRevision).
// Rendered in the posts list Actions cell next to Edit. Every outcome fires a
// sonner toast (05-06 gap 2) — including server rejections (FORBIDDEN /
// NOT_FOUND / INVALID_TRANSITION), whose raw message makes the failure
// diagnosable.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { publishPost, returnForRevision, submitForReview } from "@/actions/posts";

interface PostRowActionsProps {
  postId: number;
  status: string;
  role?: "admin" | "editor" | "author";
}

export default function PostRowActions({ postId, status, role }: PostRowActionsProps) {
  const queryClient = useQueryClient();

  const publishMutation = useMutation({
    mutationFn: (id: number) => publishPost(id),
    onSuccess: () => {
      toast.success("Published");
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) => submitForReview(id),
    onSuccess: () => {
      toast.success("Submitted for review");
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // 260827-se8 Task 4 — Return-for-revision. Same non-optimistic D-27 shape:
  // the server confirms (assertOwnsPost + transitionPost), then invalidate.
  const returnMutation = useMutation({
    mutationFn: (id: number) => returnForRevision(id),
    onSuccess: () => {
      toast.success("Returned for revision");
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // UX-only gating — mirrors the PostForm rules. Authors NEVER see Publish
  // (they lack post:publish; the server rejects it anyway).
  const canPublish =
    (role === "admin" || role === "editor") &&
    (status === "draft" || status === "pending_review");
  const canSubmitForReview = role === "author" && status === "draft";
  // Return: editor/admin reviewing a pending_review post send it back to
  // draft. UX-only — returnForRevision re-checks authority server-side.
  const canReturn =
    (role === "admin" || role === "editor") && status === "pending_review";

  if (!canPublish && !canSubmitForReview && !canReturn) return null;

  const pending = publishMutation.isPending || submitMutation.isPending;

  return (
    <div className="inline-flex items-center gap-3">
      {(canPublish || canSubmitForReview) && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (canPublish) publishMutation.mutate(postId);
            else submitMutation.mutate(postId);
          }}
          className="text-sm font-medium text-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? canPublish
              ? "Publishing…"
              : "Submitting…"
            : canPublish
              ? "Publish"
              : "Submit for review"}
        </button>
      )}
      {canReturn && (
        <button
          type="button"
          disabled={returnMutation.isPending}
          onClick={() => returnMutation.mutate(postId)}
          className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-300"
        >
          {returnMutation.isPending ? "Returning…" : "Return"}
        </button>
      )}
    </div>
  );
}
