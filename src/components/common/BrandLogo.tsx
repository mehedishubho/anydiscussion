//
// BrandLogo — shared anydiscussion brand block (speech-bubble icon + lowercase
// wordmark) for dashboard/auth chrome. Duplicates the SiteHeader.tsx brand
// block on purpose: the public site header is frozen for the 260824-36g brand
// swap, so these two copies must be kept in sync.
//
// Pure presentational — no "use client", no hooks; safe in server AND client
// component trees.
//

const DEFAULT_ICON_CLASSES = "h-8 w-8 text-brand-500 dark:text-brand-400";
const DEFAULT_WORDMARK_CLASSES =
  "text-xl font-bold tracking-tight text-gray-900 dark:text-white";

export default function BrandLogo({
  wordmark = true,
  iconClassName,
  wordmarkClassName,
  className,
}: {
  /** false renders the icon alone (e.g. collapsed sidebar rail). */
  wordmark?: boolean;
  /** Replaces the icon wrapper's default classes entirely. */
  iconClassName?: string;
  /** Replaces the wordmark span's default classes entirely. */
  wordmarkClassName?: string;
  /** Appended to the outer span's default classes. */
  className?: string;
}) {
  return (
    <span
      className={["flex items-center gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={iconClassName ?? DEFAULT_ICON_CLASSES}>
        <svg
          className="h-full w-full"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M6 4H18A3 3 0 0 1 21 7V14A3 3 0 0 1 18 17H11.5L8 20.3V17H6A3 3 0 0 1 3 14V7A3 3 0 0 1 6 4ZM7.5 9.1A1.4 1.4 0 1 0 7.5 11.9A1.4 1.4 0 1 0 7.5 9.1ZM12 9.1A1.4 1.4 0 1 0 12 11.9A1.4 1.4 0 1 0 12 9.1ZM16.5 9.1A1.4 1.4 0 1 0 16.5 11.9A1.4 1.4 0 1 0 16.5 9.1Z"
          />
        </svg>
      </span>
      {wordmark && (
        <span className={wordmarkClassName ?? DEFAULT_WORDMARK_CLASSES}>
          anydiscussion
        </span>
      )}
    </span>
  );
}
