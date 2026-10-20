'use client';

import { useState, useEffect } from 'react';
import { ArrowRightIcon, SparklesIcon, MoonStarIcon, GiftIcon } from 'lucide-react';
import { ZODIAC_CONFIG } from '@/lib/zodiac-data';
import { AdSDK } from '@/lib/adSdk';

// Initialize AdSDK (in real operation, the baseUrl would be 'https://dellai.xyz')
const adSdk = new AdSDK({
  baseUrl: process.env.NEXT_PUBLIC_AD_PLATFORM_URL || 'https://dellai.xyz',
  adUnitId: process.env.NEXT_PUBLIC_AU_REWARDED || 'au_test_rewarded_001',
});

export default function Home() {
  const [zodiac, setZodiac] = useState('');
  const [fortune, setFortune] = useState<string | null>(null);
  const [deepFortune, setDeepFortune] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adStatus, setAdStatus] = useState<string | null>(null);

  useEffect(() => {
    // Page Load -> Track basic impression
    adSdk.trackImpression('page_load_imp');
  }, []);

  const generateDailyFortune = async () => {
    if (!zodiac) return;
    setLoading(true);
    setAdStatus(null);
    try {
      // Trigger ad request for daily fortune
      const ad = await adSdk.requestAd('daily_fortune_banner');
      if (ad) {
        setAdStatus('已连接 AppLink 广告引擎');
      }

      const signName = ZODIAC_CONFIG[zodiac as keyof typeof ZODIAC_CONFIG]?.name || zodiac;
      const res = await fetch('/api/ai-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'astrology', content: signName, sign: signName, type: 'daily' }),
      });
      const data = await res.json();
      const text = data.result || data.fortune;
      if (text) {
        setFortune(text);
      } else {
        throw new Error(data.message || data.error || 'empty fortune');
      }
    } catch (err) {
      console.error('Failed to fetch fortune:', err);
      alert('获取运势失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleRewardedAd = () => {
    setAdStatus('正在播放激励视频...');
    adSdk.showRewardedAd(() => {
      setAdStatus('广告奖励已达成');
      generateDeepAnalysis();
    });
  };

  const generateDeepAnalysis = async () => {
    setLoading(true);
    try {
      const signName = ZODIAC_CONFIG[zodiac as keyof typeof ZODIAC_CONFIG]?.name || zodiac;
      const res = await fetch('/api/ai-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'astrology', content: signName, sign: signName, type: 'monthly' }),
      });
      const data = await res.json();
      const text = data.result || data.fortune;
      if (text) {
        setDeepFortune(text);
      } else {
        throw new Error(data.message || data.error || 'empty deep fortune');
      }
    } catch (err) {
      console.error('Failed to fetch deep analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  const zodiacOptions = Object.keys(ZODIAC_CONFIG).map(key => ({
    value: key,
    label: ZODIAC_CONFIG[key as keyof typeof ZODIAC_CONFIG].name,
  }));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <h1 className="text-4xl font-bold gold-text mb-2">
          AI 星座运势
        </h1>
        <p className="text-xl text-gray-300">
          输入您的星座，解锁专属于您的宇宙密语
        </p>

        <div className="flex flex-col md:flex-row gap-3 w-full max-w-md">
          <select
            value={zodiac}
            onChange={(e) => setZodiac(e.target.value)}
            className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/30 backdrop-blur-sm"
          >
            <option value="">选择您的星座</option>
            {zodiacOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={generateDailyFortune}
            disabled={!zodiac || loading}
            className="flex-1 btn-primary py-3 rounded-lg text-white font-medium hover:opacity-90 transition-all disabled:opacity-50"
          >
            {loading ? '算命中...' : '查看今日运势'}
          </button>
        </div>

        {fortune && (
          <div className="glass-card rounded-2xl p-6 md:p-8 max-w-xl w-full space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-white">
                {ZODIAC_CONFIG[zodiac as keyof typeof ZODIAC_CONFIG]?.name || ''} 今日运势
              </h2>
              <button
                onClick={handleRewardedAd}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-all flex items-center gap-2"
                disabled={!!deepFortune || loading}
              >
                <GiftIcon size={16} />
                {deepFortune ? '深度分析已解锁' : '解锁深度解析'}
              </button>
            </div>

            <p className="text-lg leading-relaxed text-gray-200 whitespace-pre-line">
              {fortune}
            </p>

            {adStatus && (
              <div className="text-xs text-gray-400 mt-4 italic border-t border-white/10 pt-4">
                [广告系统状态] {adStatus}
              </div>
            )}

            {deepFortune && (
              <div className="mt-6 p-4 bg-white/5 rounded-lg border border-blue-500/30">
                <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <SparklesIcon size={18} className="text-yellow-400" />
                  深度解析：AI 占星师专属洞察
                </h3>
                <div className="text-base leading-relaxed text-gray-300 whitespace-pre-line">
                  {deepFortune}
                </div>
              </div>
            )}
          </div>
        )}

        {!fortune && zodiac && !loading && (
          <div className="text-center py-8">
            <MoonStarIcon className="mx-auto h-12 w-12 text-white/50 mb-4" />
            <p className="text-gray-400">
              宇宙正在为您计算运势... 请选择星座并点击查询
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
