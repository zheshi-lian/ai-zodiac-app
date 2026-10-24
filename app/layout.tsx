import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
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
  description: '选择星座生成今日、本周、本月运势，包含事业、感情、财运与健康建议。',
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
        <Script src="https://dellai.xyz/pub_sdk.js?v=2.1.2" strategy="afterInteractive" />
        {/* 第一方产品事件（page_view / generate_* / unlock_*），同源回连 /api/track/event */}
        <Script src="https://dellai.xyz/track.js" data-app="astrology" strategy="afterInteractive" />
      </body>
    </html>
  );
}
