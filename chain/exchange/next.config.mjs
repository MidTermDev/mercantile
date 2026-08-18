/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  webpack: (config) => {
    config.resolve.fallback = { ...(config.resolve.fallback ?? {}), fs: false, net: false, tls: false, crypto: false };
    return config;
  },
};
export default nextConfig;
