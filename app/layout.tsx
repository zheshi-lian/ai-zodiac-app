import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import ConsentBanner from './components/ConsentBanner';
import PostHogReplay from './components/PostHogReplay';
import './globals.css';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://dellai.xyz';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'AI 星盘相位 · 深度运势解析',
    template: '%s · AI 星盘相位',
  },
  description:
    '现代心理占星，解析行星相位，挖掘潜意识规律，提供可执行的破局之策。免费看今日简报 / 本周趋势，看视频解锁心理相位破局报告。',
  keywords: ['星盘相位', '心理占星', '星座运势', '今日运势', 'AI 算命', '破局报告', '占星'],
  applicationName: 'AI 星盘相位',
  authors: [{ name: 'AppLink' }],
  alternates: { canonical: '/astro/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: `${SITE}/astro/`,
    siteName: 'AI 星盘相位',
    title: 'AI 星盘相位 · 深度运势解析',
    description: '解析行星相位与潜意识规律，免费生成今日简报，看视频解锁心理相位破局报告。',
    images: [{ url: '/astro/og.png', width: 1200, height: 630, alt: 'AI 星盘相位' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI 星盘相位 · 深度运势解析',
    description: '解析行星相位与潜意识规律，免费生成今日简报，看视频解锁心理相位破局报告。',
    images: ['/astro/og.png'],
  },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f0c29',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'AI 星座运势',
  url: SITE,
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web',
  inLanguage: 'zh-CN',
  description: '选择星座与议题，30 秒生成今日相位速览与翻牌破局行动卡，看视频解锁心理相位破局报告。',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
  publisher: { '@type': 'Organization', name: 'AppLink', url: 'https://dellai.xyz' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <footer className="site-footer">
          <div className="footer-inner">
            <div>
              <strong>AI 星盘相位</strong>
              <span className="muted"> · 内容由 AI 生成，仅供娱乐与自我觉察，不构成任何决策建议。</span>
            </div>
            <nav aria-label="相关链接">
              <a href="https://dellai.xyz/free-tools.html">全部免费产品</a>
              <a href="https://dellai.xyz/home.html">AppLink 首页</a>
              <a href="https://dellai.xyz/tool/writing-assistant.html">AI 写作助手</a>
              <a href="https://dellai.xyz/tool/image-tool.html">AI 美图工具</a>
              <a href="https://dellai.xyz/tool/homework.html">家庭作业本</a>
              <a href="https://dellai.xyz/privacy.html">隐私政策</a>
              <a href="https://dellai.xyz/terms.html">服务条款</a>
            </nav>
          </div>
        </footer>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* AppLink 发布方 SDK：自动填充页面上的 .ad-slot（声明式广告位，见 components/FortuneApp.tsx），
            并提供 平台.showRewarded（激励视频解锁）。绝对地址：本应用部署在 dellai.xyz 路径下，
            广告请求/曝光/发奖全部回连源站 dellai.xyz/ssp/* 与 /api/astro/reward。 */}
        <Script src="https://dellai.xyz/pub_sdk.js?v=2.2.0" strategy="afterInteractive" />
        {/* 平台化产品埋点（2026-10-27）：alTrack → /api/apps/telemetry/events（publishable_key 鉴权，
            开发者后台 /pub-apps.html 漏斗×收入报表）；转化归因 /api/track/conversion 不变 */}
        <Script src="https://dellai.xyz/track.js?v=plat1" data-app="astrology" strategy="afterInteractive" />
        {/* PostHog 会话回放：同意前不 init、不录制；隐私选项与 URL 脱敏见 lib/posthog-replay.mjs */}
        <PostHogReplay />
        <ConsentBanner />
      </body>
    </html>
  );
}
