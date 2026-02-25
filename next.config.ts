import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Temporarily disable the React Compiler in dev to reduce overhead
  // Re-enable once dev compiles reliably
  reactCompiler: false,
  // Keep youtube-dl-exec out of the webpack bundle so __dirname resolves
  // to its actual node_modules path (needed to locate the yt-dlp binary).
  serverExternalPackages: ['youtube-dl-exec'],
  experimental: {
    // Large file upload support
    largePageDataBytes: 128 * 1024, // 128KB
    // Body size limit for server actions (500MB for audio uploads)
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
    ];
  },
  // Help webpack-based dev ignore massive non-app folders if Turbopack is disabled
  webpack: (config, { dev }) => {
    if (dev) {
      // Ensure watchOptions exists
      const ignored = [
        "**/scripts/nemo_env/**",
        "**/scripts/pyannote_env/**",
        "**/*.mp3",
      ];
      // Merge with any existing ignored patterns
      const existingIgnored = (config.watchOptions && (config.watchOptions as any).ignored) || [];
      (config.watchOptions as any) = {
        ...(config.watchOptions || {}),
        ignored: Array.isArray(existingIgnored)
          ? [...existingIgnored, ...ignored]
          : ignored,
      } as any;
    }
    return config;
  },
  // Turbopack uses .gitignore to decide what to crawl; ensure heavy dirs are ignored there
  turbopack: {
    // Intentionally left minimal; .gitignore updates handle exclusion
  },
};

export default nextConfig;
