import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Any Discussion",
  description:
    "A fast, SEO-optimized blog from Any Discussion — clean, professional content.",
};

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20">
      <h1 className="mb-4 text-3xl font-bold text-gray-800 dark:text-white/90 sm:text-4xl">
        Any Discussion
      </h1>
      <p className="max-w-xl text-center text-base text-gray-600 dark:text-gray-400">
        Public blog content coming soon.
      </p>
    </div>
  );
}
