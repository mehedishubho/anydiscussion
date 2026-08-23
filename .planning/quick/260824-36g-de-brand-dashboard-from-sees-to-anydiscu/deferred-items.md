# Deferred Items — discovered during 260824-36g execution

## 1. Bare `tsc --noEmit` fails repo-wide (12 errors) — pre-existing

Discovered while running the 260824-36g Task 1/2 verify gates. Not caused by (and not fixed in) that task — all errors are in files outside its five-file scope.

**Root cause:** `src/svg.d.ts` declares `declare module "*.svg"` with default export `const src: string`, but `@svgr/webpack` (wired in `next.config.ts`) compiles `.svg` imports into React components at build time. Under bare `tsc --noEmit`, icon components (imported from `src/icons/index.tsx`) resolve to a no-prop signature, so every `className` usage on them errors with TS2322. Additionally, `src/actions/__tests__/storage-settings.test.ts` has four TS18048 "possibly undefined" strictness errors.

**Why `next build` stays green:** the Next 16 Turbopack build pipeline compiles via SWC and does not run the full project type-check that bare `tsc --noEmit` performs.

**Affected files (all pre-existing):**
- `src/icons/index.tsx` consumers: `src/layout/AppSidebar.tsx:205`, `src/components/form/date-picker.tsx:55`, `src/components/auth/SignInForm.tsx:115,117`, `src/components/auth/SignUpForm.tsx:132,134`, `src/components/auth/ResetPasswordForm.tsx:138,140`
- `src/actions/__tests__/storage-settings.test.ts:318,319,321,322`

**Suggested fix (for a future quick task):** change `src/svg.d.ts` default export to `React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>` (matching the SVGR runtime) — or move to SVGR's generated types — and add non-null assertions or guards in the storage-settings test. Verify no file genuinely relies on the string form of a `.svg` import before changing the declaration.
