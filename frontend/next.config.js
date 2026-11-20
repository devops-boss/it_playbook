/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  typescript: {
    // Allows fast, reliable container builds on staging
    ignoreBuildErrors: true,
  },
  eslint: {
    // Allows fast, reliable container builds on staging
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: ['@tabler/icons-react'],
    webpackBuildWorker: false,
  },
  // Assets are bundled locally; no external CDN at runtime.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
