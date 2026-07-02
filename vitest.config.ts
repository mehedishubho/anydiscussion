// vitest.config.ts (repo root)
// [CITED: vitest 4.x defineConfig API — mirrors tsconfig.json `@/*` → `src/*` path alias]
// Wave-0 test scaffold (Plan 02-01 Task 1a). Node environment for integration tests;
// per-file jsdom opt-in via `// @vitest-environment jsdom` pragma for component tests.
// No watch flag — `pnpm test` runs `vitest run` (VALIDATION.md Sign-Off forbids watch).
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
