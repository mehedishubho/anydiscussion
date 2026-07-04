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
