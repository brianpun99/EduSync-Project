/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fixes the HMR warning by explicitly authorizing your local network IP
  allowedDevOrigins: ['192.168.1.108'],

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
}

export default nextConfig
