/**
 * The browser talks to the API through same-origin `/api/*` rewrites, so the refresh-token cookie
 * stays first-party and no API URL is hard-coded in client code.
 * API_INTERNAL_URL is read when the server starts (standalone output embeds it at build time; the
 * Docker build passes it as a build arg).
 * @type {import('next').NextConfig}
 */
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Type safety is enforced by `tsc` (pnpm typecheck); ESLint is not part of the build.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` },
      { source: '/api-docs/:path*', destination: `${apiUrl}/docs/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
