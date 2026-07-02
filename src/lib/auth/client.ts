// src/lib/auth/client.ts
// [CITED: better-auth/docs/integrations/next.mdx — Create a client; admin.mdx — client plugin]
// [CITED: RESEARCH.md Code Examples lines 914-930 — authClient factory]
// [CITED: PATTERNS.md src/lib/auth/client.ts section lines 99-121]
//
// Browser-only Better Auth client. Consumed by client components (SignInForm, SignUpForm).
// NO "use client" directive at module top — this is a factory export, not a component
// (PATTERNS.md line 117). The importing component carries "use client".
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac, adminRole, editorRole, authorRole } from "./permissions";

export const authClient = createAuthClient({
  plugins: [
    adminClient({
      ac,
      roles: { admin: adminRole, editor: editorRole, author: authorRole },
    }),
  ],
});

// Usage in SignInForm:
//   await authClient.signIn.email({ email, password, rememberMe, callbackURL });
//   const { data: session } = authClient.useSession();
