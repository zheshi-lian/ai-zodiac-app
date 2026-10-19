/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['images.unsplash.com', 'picsum.photos'],
  },
  reactStrictMode: true,
  swcMinify: true,
  // Expose env vars to client side (prefix with NEXT_PUBLIC_)
  env: {
    NEXT_PUBLIC_AD_PLATFORM_URL: process.env.NEXT_PUBLIC_AD_PLATFORM_URL,
    NEXT_PUBLIC_AU_REWARDED: process.env.NEXT_PUBLIC_AU_REWARDED,
    NEXT_PUBLIC_AU_INTERSTITIAL: process.env.NEXT_PUBLIC_AU_INTERSTITIAL,
    NEXT_PUBLIC_AU_BANNER: process.env.NEXT_PUBLIC_AU_BANNER,
    NEXT_PUBLIC_AU_NATIVE: process.env.NEXT_PUBLIC_AU_NATIVE,
    NEXT_PUBLIC_TEST_MODE: process.env.NEXT_PUBLIC_TEST_MODE,
  },
  // Allow cross-origin for embedding in WebView/App
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;