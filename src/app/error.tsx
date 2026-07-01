"use client";

import React from "react";

/**
 * Global error boundary (D-17).
 * Must be a Client Component — Next.js mandate for error boundaries.
 * Does NOT leak stack traces to the user (ASVS V7).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  React.useEffect(() => {
    // Log full error server-side only (structured JSON via console.error).
    // Never expose error.stack or internal paths to the client.
    console.error(
      JSON.stringify({
        level: "error",
        msg: error.message || "Unhandled application error",
        name: error.name,
      })
    );
  }, [error]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mx-auto w-full max-w-[472px] text-center">
        <h1 className="mb-4 font-bold text-gray-800 text-title-md dark:text-white/90 xl:text-title-2xl">
          Something went wrong
        </h1>
        <p className="mt-6 mb-8 text-base text-gray-700 dark:text-gray-400 sm:text-lg">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3.5 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
