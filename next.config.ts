import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (PPR) — replaces deprecated experimental.ppr (Next.js 16)
  cacheComponents: true,

  // Standalone output for Coolify Docker builds
  output: "standalone",

  // D-08 / Pitfall #3 (Phase 3): the default serverActions.bodySizeLimit is 1MB
  // per installed Next.js 16.2.9 docs (01-app/03-api-reference/05-config/
  // 01-next-config-js/serverActions.md). The 10MB media-upload cap (Slice C)
  // silently fails without this raise. RESEARCH correction: CONTEXT.md's
  // "~4.5MB" speculation was wrong; the verified default is 1MB.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  images: {
    qualities: [75, 90],
    remotePatterns: [
      { protocol: "https", hostname: "cdn.anydiscussion.com" },
      { protocol: "http", hostname: "localhost", port: "9000" },
      // Plan 04-05 Pitfall 4 — allowlist the Cloudinary delivery hostname.
      // Cloudinary URLs look like https://res.cloudinary.com/<cloud_name>/image/upload/...
      // Without this entry, next/image would 400 on every Cloudinary-served media item.
      { protocol: "https", hostname: "res.cloudinary.com" },
      // NOTE: the push-CDN hostname is operator-supplied (Bunny / KeyCDN / etc.). When
      // the admin configures push-CDN in /dashboard/settings/storage, they MUST also
      // add their CDN hostname here. Documented in the Storage Settings UI help text.
      // (Intentionally NOT a wildcard — next/image + remotePatterns explicit allowlist
      // is a security boundary; adding a wildcard would let any hostname render.)
    ],
    loader: "custom",
    loaderFile: "src/lib/image-loader.ts",
  },

  /* config options here */
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
    
    turbopack: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  
};

export default nextConfig;
