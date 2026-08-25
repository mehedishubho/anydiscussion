"use client";
// src/app/(admin)/dashboard/posts/components/PostRowActions.tsx
// [CITED: 05-06-PLAN.md Task 3C — role/status-aware row actions in the posts list]
// [CITED: CLAUDE.md "Roles & permissions" — this gating is UX-ONLY; publishPost ->
//        assertOwnsPost + transitionPost -> requireCan({post:["publish"]}) + the
//        TRANSITIONS table is the authority (authors are double-blocked server-side)]
// [CITED: 04-CONTEXT.md D-27 — status flips are high-stakes: NOT optimistic; the
//        mutation waits for server confirmation, then invalidates ["posts"]]
//
// Renders a Publish link-button (editor/admin; draft or pending_review — on
// pending_review it doubles as "approve and publish") or a Submit-for-review
// link-button (author; draft only). Rendered in the posts list Actions cell
// next to Edit. Every outcome fires a sonner toast (05-06 gap 2) — including
// server rejections (FORBIDDEN / NOT_FOUND / INVALID_TRANSITION), whose raw
// message makes the failure diagnosable.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { publishPost, submitForReview } from "@/actions/posts";

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

  // UX-only gating — mirrors the PostForm rules. Authors NEVER see Publish
  // (they lack post:publish; the server rejects it anyway).
  const canPublish =
    (role === "admin" || role === "editor") &&
    (status === "draft" || status === "pending_review");
  const canSubmitForReview = role === "author" && status === "draft";

  if (!canPublish && !canSubmitForReview) return null;

  const pending = publishMutation.isPending || submitMutation.isPending;

  return (
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
  );
}
