// src/lib/sanitize/__tests__/sanitize.test.ts
// [CITED: VALIDATION.md Wave 0 row "CONT-04 — double sanitization"]
// [CITED: 03-02-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
// [CITED: RESEARCH.md Pattern 2 (L428-487) + Pitfall 2 (L749-754 — iframe domain bypass)]
// [CITED: 03-CONTEXT.md D-02 (per-provider iframe allowlist), D-05 (target/rel preserved),
//  D-07 (allow video/audio/source for non-image media types)]
//
// Wave-0 sanitize test — closes Pitfall #2 (double-sanitization) by proving:
//   1. Malicious payloads are stripped (onerror, script, javascript: protocol)
//   2. Iframe src domain allowlist is enforced (YouTube OK, evil.com blanked)
//   3. target=_blank preserves rel="noopener noreferrer" (D-05 anti-tabnabbing)
//   4. video/audio/source tags survive (D-07 non-image media types)
//   5. sanitizeBeforeStore + sanitizeBeforeRender use the SAME config (anti-drift gate)
//
// Assumptions validated here: A1 (uponSanitizeAttribute hook API), A2 (target=_blank
// auto-rel), A7 (config completeness). If A2 fails (DOMPurify doesn't auto-add rel),
// the hook in index.ts is extended to add it (RESEARCH.md L487 documented fallback).
import { describe, it, expect } from "vitest";
import {
  sanitizeBeforeStore,
  sanitizeBeforeRender,
  EMBED_DOMAIN_ALLOWLIST,
} from "../index";

describe("CONT-04 / Pitfall #2: malicious payload stripping", () => {
  it("strips onerror attribute from <img> but keeps the img tag", () => {
    const dirty = '<p>hi</p><img src=x onerror=alert(1)>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).not.toContain("onerror");
    expect(out).toContain("<img");
  });

  it("strips <script> entirely", () => {
    const dirty = '<p>safe</p><script>alert("xss")</script>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("strips javascript: protocol from href", () => {
    const dirty = '<a href="javascript:alert(1)">click</a>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).not.toContain("javascript:");
  });

  it("produces identical output from sanitizeBeforeStore AND sanitizeBeforeRender", () => {
    // The same malicious payload must be handled identically at both call sites —
    // this is the Pitfall #2 anti-drift gate (ONE shared config object).
    const dirty = '<p>hi</p><img src=x onerror=alert(1)>';
    expect(sanitizeBeforeStore(dirty)).toBe(sanitizeBeforeRender(dirty));
  });
});

describe("T-03-08 / Pitfall #2 sub: iframe src domain allowlist (D-02)", () => {
  it("EMBED_DOMAIN_ALLOWLIST contains exactly the 8 providers", () => {
    expect(EMBED_DOMAIN_ALLOWLIST).toEqual([
      "youtube.com",
      "youtube-nocookie.com",
      "youtu.be",
      "twitter.com",
      "x.com",
      "instagram.com",
      "vimeo.com",
      "soundcloud.com",
    ]);
  });

  it("preserves YouTube iframe embed src", () => {
    const dirty =
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).toContain("<iframe");
    expect(out).toContain("youtube.com/embed/dQw4w9WgXcQ");
  });

  it("preserves youtube-nocookie embed src", () => {
    const dirty =
      '<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).toContain("youtube-nocookie.com");
  });

  it("blanks iframe src from disallowed domain (evil.com)", () => {
    const dirty = '<iframe src="https://evil.com"></iframe>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).not.toContain("evil.com");
    // The iframe tag itself survives (it's in ADD_TAGS) but src is blanked.
    expect(out).toContain("<iframe");
  });

  it("blanks iframe src from malicious subdomain of a non-allowlisted host", () => {
    const dirty = '<iframe src="https://youtube.com.evil.com/embed/x"></iframe>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).not.toContain("evil.com");
  });

  it("blanks iframe src with invalid URL (throws inside hook → caught → blanked)", () => {
    const dirty = '<iframe src="not-a-url"></iframe>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).not.toContain("not-a-url");
  });
});

describe("T-03-09 / D-05: target=_blank preserves rel=noopener noreferrer (anti-tabnabbing)", () => {
  it("preserves target=_blank and adds rel=noopener noreferrer for external links", () => {
    const dirty = '<a href="https://example.com" target="_blank">link</a>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).toContain('target="_blank"');
    // DOMPurify auto-adds rel when target=_blank and rel/target are in ADD_ATTR.
    // The noopener keyword is the load-bearing anti-tabnabbing property.
    expect(out).toContain("noopener");
    expect(out).toContain("noreferrer");
  });
});

describe("D-07: video/audio/source tags survive sanitization (non-image media)", () => {
  it("preserves <video> with controls and src", () => {
    const dirty = '<video controls src="x.mp4"></video>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).toContain("<video");
    expect(out).toContain("controls");
  });

  it("preserves <audio> with controls and src", () => {
    const dirty = '<audio controls src="x.mp3"></audio>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).toContain("<audio");
  });

  it("preserves <source> with src and type", () => {
    const dirty =
      '<video controls><source src="x.mp4" type="video/mp4"></video>';
    const out = sanitizeBeforeStore(dirty);
    expect(out).toContain("<source");
    expect(out).toContain("video/mp4");
  });
});

describe("Pitfall #2 anti-drift: sanitizeBeforeStore === sanitizeBeforeRender (ONE shared config)", () => {
  // Run both functions on 5 varied inputs and assert IDENTICAL output.
  // Proves they share ONE config object reference — the core Pitfall #2 guarantee.
  const variedInputs = [
    '<p>plain text</p>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="https://www.youtube.com/embed/abc"></iframe>',
    '<iframe src="https://evil.com"></iframe>',
    '<a href="https://example.com" target="_blank">link</a><video controls src="x.mp4"></video>',
  ];

  variedInputs.forEach((input, i) => {
    it(`produces identical output for both call sites — input #${i + 1}`, () => {
      const fromStore = sanitizeBeforeStore(input);
      const fromRender = sanitizeBeforeRender(input);
      expect(fromStore).toBe(fromRender);
    });
  });
});
