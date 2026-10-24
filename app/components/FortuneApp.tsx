'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * AI 星盘相位 · 深度运势（漏斗 A · 心理版）
 * 生成概览（免费）→ 激励视频解锁 → 心理相位破局报告。
 * 广告走 AppLink 发布方 SDK（pub_sdk.js）：激励位=星盘相位-激励位，原生位=星盘相位-原生位；
 * 发奖由同源中继 /api/astro/reward 用服务端 api_key 签名（浏览器不持密钥）。
 */
const SIGNS = [
  '白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座',
  '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座',
];
const REWARD_UNIT_FALLBACK = 'au_mvmrfblj8q8s2z';   // 星盘相位-激励位（boot 失败时兜底）
const NATIVE_UNIT = 'au_mvmrfboj8pmbz0';             // 星盘相位-原生位

function track(event: string, props: Record<string, unknown> = {}) {
  try {
    const t = (window as unknown as { alTrack?: (e: string, p?: Record<string, unknown>) => void }).alTrack;
    t && t(event, props);
  } catch { /* 埋点失败不影响主流程 */ }
}

export default function FortuneApp() {
  const [sign, setSign] = useState('天秤座');
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');
  const [nick, setNick] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [err, setErr] = useState('');
  const [deepBusy, setDeepBusy] = useState(false);
  const [rewardUnit, setRewardUnit] = useState(REWARD_UNIT_FALLBACK);
  const outRef = useRef<HTMLDivElement>(null);

  // 平台 SDK：加载 → boot 拉本产品单元 → configure（publishable_key 启用行为事件流；发奖走服务端中继）
  useEffect(() => {
    fetch('/api/publisher/boot?domain=' + encodeURIComponent(location.hostname) + '&unit_name=' + encodeURIComponent('星盘相位'))
      .then((r) => r.json())
      .then((d) => {
        if (!d || !d.ok) return;
        if (d.by_format?.rewarded?.ad_unit_id) setRewardUnit(d.by_format.rewarded.ad_unit_id);
        const t = setInterval(() => {
          const p = (window as unknown as { 平台?: { configure?: (o: Record<string, string>) => void } }).平台;
          if (p && p.configure) {
            clearInterval(t);
            p.configure({ apiKey: d.publishable_key || '', rewardUrl: '/api/astro/reward' });
          }
        }, 300);
        setTimeout(() => clearInterval(t), 10000);
      })
      .catch(() => {});
    return () => { /* SDK 常驻，随页面卸载 */ };
  }, []);

  // 首屏默认选当前日期邻近的星座
  useEffect(() => {
    const now = new Date();
    const m = now.getMonth() + 1, day = now.getDate();
    const edges: Array<[number, number, number, number]> = [
      [3, 21, 4, 19], [4, 20, 5, 20], [5, 21, 6, 21], [6, 22, 7, 22],
      [7, 23, 8, 22], [8, 23, 9, 22], [9, 23, 10, 23], [10, 24, 11, 22],
      [11, 23, 12, 21], [12, 22, 12, 31], [1, 1, 1, 19], [1, 20, 2, 18], [2, 19, 3, 20],
    ];
    for (let i = 0; i < edges.length; i++) {
      const [m1, d1, m2, d2] = edges[i];
      const after = m > m1 || (m === m1 && day >= d1);
      const before = m < m2 || (m === m2 && day <= d2);
      if (after && before) { setSign(SIGNS[Math.min(i, 11)]); break; }
    }
  }, []);

  function sdk(): { showRewarded: (o: { adUnit: string; placement: string }) => Promise<{ granted: boolean; reason?: string; impid?: string }> } | null {
    const p = (window as unknown as { 平台?: { showRewarded?: (o: { adUnit: string; placement: string }) => Promise<{ granted: boolean; reason?: string; impid?: string }> } }).平台;
    return p && p.showRewarded ? (p as never) : null;
  }

  async function callAi(mode: 'overview' | 'deep'): Promise<string> {
    const res = await fetch('/api/ai-tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'astrology', content: sign, sign, mode, type: period, name: nick.trim() }),
    });
    const data = await res.json();
    const text = data.result || data.fortune;
    if (!res.ok || !text) throw new Error(data.message || data.error || '生成失败');
    return text as string;
  }

  async function generate() {
    setErr(''); setResult(''); setUnlocked(false);
    setLoading(true);
    const t0 = Date.now();
    track('generate_start', { sign, period });
    try {
      const text = await callAi('overview');
      setResult(text);
      track('generate_success', { sign, period, ms: Date.now() - t0 });
      setTimeout(() => outRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    } catch (e) {
      track('generate_fail', { sign, period });
      setErr(e instanceof Error ? e.message : '生成失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  }

  function expandDeep() {
    setDeepBusy(true);
    callAi('deep')
      .then((text) => {
        setResult(text);
        setUnlocked(true);
        track('astro_deep_unlocked', { sign, via: unlockedViaRef.current });
      })
      .catch((e) => setErr('深度解析生成失败：' + (e instanceof Error ? e.message : '请重试')))
      .finally(() => setDeepBusy(false));
  }

  const unlockedViaRef = useRef<'rewarded' | 'fallback'>('rewarded');

  function onUnlock() {
    const ad = sdk();
    if (!ad) { unlockedViaRef.current = 'fallback'; track('astro_ad_fallback', { reason: 'sdk_missing' }); expandDeep(); return; }
    setDeepBusy(true);
    track('unlock_click', { sign, period, method: 'rewarded' });
    ad.showRewarded({ adUnit: rewardUnit, placement: 'astro_deep_unlock' })
      .then((r) => {
        if (r && r.granted) {
          track('rewarded_granted', { impid: r.impid || '' });
          expandDeep();
        } else {
          const why = (r && r.reason) || 'UNKNOWN';
          track('rewarded_denied', { reason: why });
          // 空拍/网络/中继异常不挡用户：直接免费展开
          if (['no_fill', 'NO_FILL', 'network_error', 'REWARD_URL_MISSING'].includes(why)) {
            unlockedViaRef.current = 'fallback';
            track('astro_ad_fallback', { reason: why });
            expandDeep();
          } else {
            setDeepBusy(false);
            setErr(why === 'ABANDONED' || why === 'INCOMPLETE_WATCH' ? '要看完整个视频才能解锁哦' : '视频未完成（' + why + '），稍后再试');
          }
        }
      })
      .catch(() => {
        unlockedViaRef.current = 'fallback';
        track('astro_ad_fallback', { reason: 'network_error' });
        expandDeep();
      });
  }

  return (
    <div className="app">
      <style>{`
        .xp-hero h1{margin:0 0 6px;font-size:30px;background:linear-gradient(to right,#fff,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .xp-sub{color:var(--mut,#93a3c4);margin:0 0 22px;font-size:14px}
        .xp-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:12px}
        @media(max-width:620px){.xp-grid{grid-template-columns:1fr}}
        .xp-grid label{display:block;font-size:12px;color:var(--mut,#93a3c4);margin:10px 0 5px;text-align:left}
        .xp-grid input,.xp-grid select{width:100%;padding:11px;border:1px solid #2f4170;background:#0d1730;color:#e8eefc;border-radius:8px;font-size:14px;font-family:inherit}
        .xp-zodiac{display:grid;grid-template-columns:repeat(12,1fr);gap:8px;margin-top:12px}
        @media(max-width:620px){.xp-zodiac{grid-template-columns:repeat(6,1fr)}}
        .xp-z{background:#0d1730;border:1px solid #24345c;border-radius:9px;padding:8px 4px;text-align:center;cursor:pointer;font-size:11.5px;color:#93a3c4}
        .xp-z.on{border-color:#3b82f6;background:rgba(59,130,246,.16);color:#dbeafe}
        .xp-z b{display:block;font-size:17px;margin-bottom:2px;color:#c7d8ff}
        .xp-btn{width:100%;margin-top:16px;padding:12px 20px;border:0;border-radius:9px;background:linear-gradient(92deg,#2563eb,#3b82f6,#22d3ee);color:#fff;font-weight:700;font-size:15px;cursor:pointer;transition:transform .15s}
        .xp-btn:hover{transform:translateY(-1px)}
        .xp-btn:disabled{opacity:.6;cursor:wait}
        .xp-deep{background:linear-gradient(92deg,#6366f1,#a855f7);margin-top:12px}
        .xp-err{margin-top:14px;border:1px solid #7f2b2b;background:rgba(248,113,113,.08);color:#fca5a5;border-radius:9px;padding:11px 13px;font-size:13px}
        .xp-out{border:1px solid #26355c;border-radius:12px;padding:18px;background:#0d1730;margin-top:18px;white-space:pre-wrap;line-height:1.9;font-size:14.5px;color:#dbe6ff;text-align:left}
        .xp-head{display:flex;justify-content:space-between;margin-bottom:10px;font-weight:700}
        .xp-badge{font-size:11px;padding:2px 9px;border-radius:999px;border:1px solid #2563eb;color:#7dd3fc;background:rgba(37,99,235,.12);font-weight:400}
      `}</style>

      <section className="hero xp-hero">
        <div className="eyebrow">AI 占星 · 免费 · 无需注册</div>
        <h1>AI 星盘相位 · 深度运势</h1>
        <p className="sub">解析行星相位，挖掘潜意识规律，提供可执行的破局之策。免费看今日简报 / 本周趋势，看视频解锁心理相位破局报告。</p>
      </section>

      <section className="panel" aria-label="选择星座与周期">
        <div className="xp-grid">
          <div>
            <label htmlFor="nick">我的姓名/昵称</label>
            <input id="nick" value={nick} maxLength={20} placeholder="输入姓名，解析更准"
              onChange={(e) => setNick(e.target.value)} />
          </div>
          <div>
            <label htmlFor="signSel">星座</label>
            <select id="signSel" value={sign} onChange={(e) => setSign(e.target.value)}>
              {SIGNS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="periodSel">周期</label>
            <select id="periodSel" value={period} onChange={(e) => setPeriod(e.target.value as 'daily' | 'weekly')}>
              <option value="daily">今日简报</option>
              <option value="weekly">本周趋势</option>
            </select>
          </div>
        </div>
        <div className="xp-zodiac" role="listbox" aria-label="十二星座">
          {SIGNS.map((s) => (
            <button key={s} type="button" role="option" aria-selected={sign === s}
              className={'xp-z' + (sign === s ? ' on' : '')}
              onClick={() => setSign(s)}>
              <b>{s[0]}</b>{s[1]}
            </button>
          ))}
        </div>
        <button className="xp-btn" onClick={generate} disabled={loading}>
          {loading ? '生成中...' : '✦ 生成我的运势'}
        </button>
      </section>

      <div aria-live="polite">
        {err && <div className="panel xp-err" role="alert">{err}</div>}
        {result && (
          <section className="panel xp-out" ref={outRef}>
            <div className="xp-head">
              <span>{sign} · {unlocked ? '心理相位破局报告' : (period === 'weekly' ? '本周趋势' : '今日简报')}</span>
              <span className="xp-badge">AI 生成</span>
            </div>
            {result}
            {!unlocked && (
              <button className="xp-btn xp-deep" onClick={onUnlock} disabled={deepBusy}>
                {deepBusy ? '正在加载广告...' : '✨ 解锁【心理相位破局报告】（观看视频解锁）'}
              </button>
            )}
          </section>
        )}
        {!result && !loading && !err && (
          <section className="panel empty">
            <p>选择星座后点「生成」，就会得到一段完整的相位解读。</p>
            <p className="muted">看完视频可解锁深度破局报告；广告暂时没有库存时会直接免费展开。</p>
          </section>
        )}
      </div>

      <section className="panel about">
        <h2 className="section-title">为什么免费？</h2>
        <p className="muted">
          概览免费、无需注册；深度破局报告看一段视频即可解锁，看完由服务端裁决发奖。
          觉得准不准都欢迎截图分享，但别用它替你做重大决定——运势是视角，不是答案。
        </p>
      </section>

      {/* AppLink 原生位（第二形态）：曝光/点击归因到 星盘相位-原生位 */}
      <aside className="panel" aria-label="广告" style={{ minHeight: 100 }}>
        <div
          className="ad-slot"
          data-ad-unit={NATIVE_UNIT}
          data-format="native"
          data-cat="astrology"
          data-geo="CN"
          data-floor="0"
        />
        <p className="muted" style={{ fontSize: 11, marginTop: 4, textAlign: 'center' }}>广告 · 由 AppLink 提供</p>
      </aside>
    </div>
  );
}
