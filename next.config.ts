import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (PPR) — replaces deprecated experimental.ppr (Next.js 16)
  cacheComponents: true,

  // Standalone output for Coolify Docker builds
  output: "standalone",

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
