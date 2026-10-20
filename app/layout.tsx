import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://dellai.xyz';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'AI 星座运势 · 今日运势、本周运势与深度解析',
    template: '%s · AI 星座运势',
  },
  description:
    '选择星座，生成今日 / 本周 / 本月运势。包含整体、事业、感情、财运、健康与幸运元素，可分享、可回看。免费使用，无需注册。',
  keywords: ['星座运势', '今日运势', 'AI 算命', '十二星座', '本周运势', '本月运势', '占星'],
  applicationName: 'AI 星座运势',
  authors: [{ name: 'AppLink' }],
  alternates: { canonical: '/astro/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: `${SITE}/astro/`,
    siteName: 'AI 星座运势',
    title: 'AI 星座运势 · 今日运势与深度解析',
    description: '12 星座每日 / 每周 / 每月运势，AI 生成，免费使用。',
  },
  twitter: {
    card: 'summary',
    title: 'AI 星座运势 · 今日运势与深度解析',
    description: '12 星座每日 / 每周 / 每月运势，AI 生成，免费使用。',
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
              <strong>AI 星座运势</strong>
              <span className="muted"> · 内容由 AI 生成，仅供娱乐与自我觉察，不构成任何决策建议。</span>
            </div>
            <nav aria-label="相关链接">
              <a href="https://dellai.xyz/home.html">AppLink 首页</a>
              <a href="https://dellai.xyz/tool/writing-assistant.html">AI 写作助手</a>
              <a href="https://dellai.xyz/tool/image-tool.html">AI 美图工具</a>
              <a href="https://dellai.xyz/privacy.html">隐私政策</a>
              <a href="https://dellai.xyz/terms.html">服务条款</a>
            </nav>
          </div>
        </footer>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
