/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.ebayimg.com" },
      { protocol: "https", hostname: "**.ebay.com" },
    ],
  },
};

export default nextConfig;
