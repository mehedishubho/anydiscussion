import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // Route-group isolation (D-13) — literal glob patterns, NOT regex (Pitfall 4).
  // (site) cannot import from (admin) — prevents TailAdmin/editor JS leaking
  // into the public bundle (foundation of Phase 7 PERF-02 bundle-budget check).
  {
    files: ["src/app/(site)/**/*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/(admin)/*", "../(admin)/*", "../../(admin)/*"],
              message:
                "Cross-group import forbidden: (site) cannot import from (admin). Use shared @/lib, @/db, or @/actions instead.",
            },
          ],
        },
      ],
    },
  },
  // (admin) cannot import from (site) — keeps the boundary bidirectional.
  {
    files: ["src/app/(admin)/**/*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/(site)/*", "../(site)/*", "../../(site)/*"],
              message:
                "Cross-group import forbidden: (admin) cannot import from (site). Use shared @/lib, @/db, or @/actions instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
