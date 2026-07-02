// src/lib/permissions/__tests__/rbac.test.ts
// [CITED: VALIDATION.md AUTH-01 rows — author blocked from post.publish; editor/admin allowed]
// Pure unit test of the RBAC role statement sets via role.authorize() — the same
// decision logic auth.api.userHasPermission delegates to. No DB needed.
import { describe, it, expect } from "vitest";
import { adminRole, editorRole, authorRole } from "@/lib/auth/permissions";

describe("AUTH-01: RBAC role → publish permission matrix", () => {
  describe("author role LACKS post.publish (D-11 author matrix)", () => {
    it("authorRole.authorize({post:['publish']}) is DENIED", () => {
      const result = authorRole.authorize({ post: ["publish"] });
      expect(result.success).toBe(false);
    });

    it("authorRole statements do NOT include publish in the post array", () => {
      // D-11 — author has create/read/update/unpublish/submit/delete but NOT publish.
      expect(authorRole.statements.post).not.toContain("publish");
    });

    it("authorRole retains the other post actions (no over-restriction)", () => {
      // Ownership is enforced separately via assertOwnsPost; the role grants the action.
      for (const action of [
        "create",
        "read",
        "update",
        "unpublish",
        "submit",
        "delete",
      ]) {
        expect(authorRole.statements.post).toContain(action);
      }
    });
  });

  describe("editor role HAS post.publish (D-11 editor matrix)", () => {
    it("editorRole.authorize({post:['publish']}) is ALLOWED", () => {
      const result = editorRole.authorize({ post: ["publish"] });
      expect(result.success).toBe(true);
    });

    it("editorRole statements include publish in the post array", () => {
      expect(editorRole.statements.post).toContain("publish");
    });
  });

  describe("admin role HAS post.publish (D-11 admin = full)", () => {
    it("adminRole.authorize({post:['publish']}) is ALLOWED", () => {
      const result = adminRole.authorize({ post: ["publish"] });
      expect(result.success).toBe(true);
    });

    it("adminRole statements include publish in the post array", () => {
      expect(adminRole.statements.post).toContain("publish");
    });
  });

  describe("taxonomy + user-resource permissions are scoped per role (D-11)", () => {
    it("editor can manage categories + tags", () => {
      expect(editorRole.authorize({ category: ["create"] }).success).toBe(true);
      expect(editorRole.authorize({ tag: ["delete"] }).success).toBe(true);
    });

    it("admin carries user-resource statements (merged from adminAc)", () => {
      // adminAc provides user[*] + session[*] — admin merges these in.
      expect(adminRole.authorize({ user: ["ban"] }).success).toBe(true);
      expect(adminRole.authorize({ session: ["revoke"] }).success).toBe(true);
    });

    it("author is NOT granted user-resource actions", () => {
      // authorRole has no user/session resource — authorize returns denied.
      expect(authorRole.authorize({ user: ["ban"] }).success).toBe(false);
    });
  });
});
