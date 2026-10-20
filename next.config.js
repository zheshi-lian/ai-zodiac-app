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
  // 平台首页把「AI 星座运势」指向 /tool/astrology.html。
  // 该路径由 Cloudflare 分流到本 Vercel 项目，因此在这里把它重写到星座首页，
  // 避免用户点进去看到 Vercel 的 404。
  async rewrites() {
    return [
      { source: '/tool/astrology.html', destination: '/' },
      { source: '/tool/astrology', destination: '/' },
      { source: '/astrology.html', destination: '/' },
    ];
  },
};

module.exports = nextConfig;