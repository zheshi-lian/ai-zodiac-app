'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * AI 星盘相位 · 深度运势（漏斗 A · 心理版 · v2 三幕体验）
 * 第一幕「问」：星座宫格 + 议题 chips，两次点击出结果；
 * 第二幕「签」：结构化结果头（日期/打卡）+ 破局报告 teaser 解锁；
 * 第三幕「行」：3D 翻牌行动卡 → 全勾点亮 → canvas 星签分享卡。
 * 广告走 AppLink 发布方 SDK（pub_sdk.js），埋点全部由平台数据引擎驱动：
 * 页面只报 placement 名（astro_deep_unlock / astro_native），单元由 /api/publisher/boot 下发，
 * 页面零硬编码单元 ID；发奖由同源中继 /api/astro/reward 用服务端 api_key 签名（浏览器不持密钥）。
 */
const SIGNS = [
  { n: '白羊座', g: '♈' }, { n: '金牛座', g: '♉' }, { n: '双子座', g: '♊' },
  { n: '巨蟹座', g: '♋' }, { n: '狮子座', g: '♌' }, { n: '处女座', g: '♍' },
  { n: '天秤座', g: '♎' }, { n: '天蝎座', g: '♏' }, { n: '射手座', g: '♐' },
  { n: '摩羯座', g: '♑' }, { n: '水瓶座', g: '♒' }, { n: '双鱼座', g: '♓' },
];

type PlacementInfo = { ad_unit_id: string; format: string; name: string };
type Placements = Record<string, PlacementInfo>;
type ActionCard = { text: string; done: boolean; flipped: boolean };

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
  const [topic, setTopic] = useState('综合');
  const [streak, setStreak] = useState(0);
  const [actions, setActions] = useState<ActionCard[]>([]);
  const actionsCelebrated = useRef(false);
  const placementsRef = useRef<Placements>({});
  const nativeSlotRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const unlockedViaRef = useRef<'rewarded' | 'fallback'>('rewarded');

  // ── 破局行动卡：从议题行动池按「日期×星座×议题」确定性抽 3 条（可玩性 + 明日回访钩子）──
  // 勾满 3 件 → 庆祝态 + 带任务深度信号（ai_signals）刷新原生位，让平台在"完成度最高"
  // 的时刻出价值最高的广告 —— 这是 AppLink 交互特征钩子的直接用法。
  const TOPICS = [
    { k: '综合', e: '✦' }, { k: '人际社交', e: '💬' }, { k: '决策纠结', e: '⚖️' },
    { k: '情绪能量', e: '🌊' }, { k: '自我成长', e: '🌱' },
  ] as const;
  const ACTION_POOL: Record<string, string[]> = {
    '综合': ['把最拖的一件事做完 10%', '给想感谢的人发条消息', '睡前写三行今天的高光', '散步 20 分钟不想工作', '整理一张桌面/一个相册', '只喝白开水过完下午'],
    '人际社交': ['主动约一个很久没见的人', '当面（而非微信）夸一个人', '拒绝一个不想去的局', '认真听完一段抱怨不给建议', '给家人打个电话', '在群里认真回一条消息'],
    '决策纠结': ['为纠结的事设一个 48 小时期限', '写下两个选项各自的最好结果', '问一个已经做成的人', '先做可逆的那个决定', '把"要不要"换成"怎么做"', '抛硬币，接住第一反应'],
    '情绪能量': ['睡前一小时不碰手机', '把情绪写成 3 句话不给它讲道理', '晒 15 分钟太阳', '做 20 个深蹲再决定要不要生气', '听一首初中听的歌', '早睡一次，明天再评'],
    '自我成长': ['学一个能立刻用上的小技巧', '读完收藏夹里最旧的一篇', '公开输出一段 200 字的思考', '向高手提一个具体问题', '把一个坏习惯延迟 10 分钟', '给自己定一个 7 天小赌约'],
  };
  const signGlyph = (SIGNS.find((s) => s.n === sign) || SIGNS[6]).g;

  // 本地时区的「今天」：星签的日界跟着用户走，而不是 UTC
  function todayKey(offsetDays = 0) {
    const d = new Date(Date.now() + offsetDays * 86400000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dateLabel() {
    const d = new Date();
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function buildActions() {
    const pool = ACTION_POOL[topic] || ACTION_POOL['综合'];
    const s = todayKey() + '|' + sign + '|' + topic;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const picked: string[] = [];
    const used = new Set<number>();
    let k = h;
    while (picked.length < 3 && used.size < pool.length) {
      k = (k * 1103515245 + 12345) >>> 0;
      const idx = k % pool.length;
      if (!used.has(idx)) { used.add(idx); picked.push(pool[idx]); }
    }
    const key = 'xp_actions_' + todayKey();
    let saved: Array<{ text: string; done?: boolean; flipped?: boolean }> = [];
    try { saved = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* ignore */ }
    setActions(picked.map((text) => {
      const old = saved.find((x) => x.text === text);
      // 历史已勾选的卡自动呈翻开态，回来不重演仪式
      return { text, done: !!old?.done, flipped: !!(old && (old.flipped || old.done)) };
    }));
  }
  function persistActions(next: ActionCard[]) {
    try { localStorage.setItem('xp_actions_' + todayKey(), JSON.stringify(next)); } catch { /* ignore */ }
  }
  function flipCard(i: number) {
    const card = actions[i];
    if (!card) return;
    if (!card.flipped) {
      const next = actions.map((a, j) => (j === i ? { ...a, flipped: true } : a));
      setActions(next); persistActions(next);
      track('card_flip', { sign, topic, index: i });
      return;
    }
    const next = actions.map((a, j) => (j === i ? { ...a, done: !a.done } : a));
    setActions(next); persistActions(next);
    const all = next.every((a) => a.done);
    if (all && !actionsCelebrated.current) {
      actionsCelebrated.current = true;
      track('actions_done', { sign, topic, count: 3 });
      celebrateAndBoostAds();
    }
  }
  function celebrateAndBoostAds() {
    // 平台钩子：任务完成深度 → 原生位带 ai_signals 重新出价（此刻用户价值最高）
    try {
      const w = window as unknown as { 平台?: { defineSlot?: (el: HTMLElement, spec: Record<string, unknown>) => { id: string } | null; refresh?: (ids?: string[]) => void } };
      const el = nativeSlotRef.current;
      const np = placementsRef.current.astro_native;
      if (w.平台?.defineSlot && el && np && np.ad_unit_id) {
        el.removeAttribute('data-defined');
        w.平台.defineSlot(el, { format: 'native', adUnit: np.ad_unit_id, cat: 'astrology', geo: 'CN', floor: 0,
          aiSignals: { task_completion_depth: 1, content_generation_engagement: 0.9 } });
        w.平台.refresh && w.平台.refresh();
      }
    } catch { /* 钩子失败不影响主流程 */ }
  }

  // ── 连续打卡：按本地日界累计「生成星签」的连续天数，回访理由的量化基建 ──
  function bumpStreak(): number {
    try {
      const today = todayKey();
      const raw = localStorage.getItem('xp_streak_v1');
      const s = raw ? JSON.parse(raw) : { last: '', count: 0 };
      if (s.last === today) return s.count || 1;
      const count = s.last === todayKey(-1) ? (s.count || 0) + 1 : 1;
      localStorage.setItem('xp_streak_v1', JSON.stringify({ last: today, count }));
      return count;
    } catch { return 1; }
  }

  // ── 星签分享卡：canvas 现画现分享（Web Share 优先，否则下载 PNG）──
  function shareCard() {
    track('share_card', { sign, topic });
    try {
      const S = 2, W = 600, H = 840;
      const c = document.createElement('canvas');
      c.width = W * S; c.height = H * S;
      const x = c.getContext('2d');
      if (!x) return;
      x.scale(S, S);
      const bg = x.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#0f0c29'); bg.addColorStop(0.55, '#1b1740'); bg.addColorStop(1, '#0d1730');
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      // 确定性星点：同一张星签每天长得一样
      let h = 0; const seed = todayKey() + sign;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
      const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };
      x.fillStyle = 'rgba(255,255,255,.5)';
      for (let i = 0; i < 46; i++) {
        const r = rnd() * 1.6 + 0.4;
        x.globalAlpha = rnd() * 0.5 + 0.15;
        x.beginPath(); x.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
      x.textAlign = 'center'; x.fillStyle = '#f3d98b';
      x.font = '110px serif'; x.fillText(signGlyph, W / 2, 200);
      x.fillStyle = '#fff'; x.font = 'bold 40px "PingFang SC","Microsoft YaHei",sans-serif';
      x.fillText(sign + ' · 今日星签', W / 2, 278);
      x.fillStyle = '#a9a3c9'; x.font = '22px "PingFang SC","Microsoft YaHei",sans-serif';
      x.fillText(dateLabel() + ' · ' + topic + (nick.trim() ? ' · ' + nick.trim() : ''), W / 2, 318);
      // 三件行动
      x.textAlign = 'left';
      let y = 420;
      actions.forEach((a, i) => {
        x.strokeStyle = a.done ? '#4ade80' : '#3b5a8f'; x.lineWidth = 2;
        x.beginPath(); x.roundRect(70, y - 26, 30, 30, 7); x.stroke();
        if (a.done) { x.fillStyle = '#4ade80'; x.font = 'bold 24px sans-serif'; x.fillText('✓', 77, y - 3); }
        x.fillStyle = a.done ? '#9fb4dd' : '#e8eefc';
        x.font = '24px "PingFang SC","Microsoft YaHei",sans-serif';
        x.fillText((i + 1) + '. ' + a.text, 116, y - 3);
        y += 76;
      });
      x.textAlign = 'center'; x.fillStyle = '#7dd3fc'; x.font = '20px "PingFang SC","Microsoft YaHei",sans-serif';
      x.fillText('AI 星盘相位 · dellai.xyz', W / 2, H - 60);
      const finish = (blob: Blob | null) => {
        const file = blob ? new File([blob], 'star-card.png', { type: 'image/png' }) : null;
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files?: File[] }) => Promise<void> };
        if (file && nav.canShare?.({ files: [file] }) && nav.share) {
          // 平台口径：share_card=点击（漏斗 share_click），share_success=真实分享完成（漏斗 share_ok）
          nav.share({ files: [file], title: sign + ' · 今日星签' })
            .then(() => track('share_success', { sign, topic, via: 'webshare' }))
            .catch(() => {});
        } else {
          const a = document.createElement('a');
          a.href = blob ? URL.createObjectURL(blob) : c.toDataURL('image/png');
          a.download = '星签-' + todayKey() + '.png';
          a.click();
          track('share_success', { sign, topic, via: 'download' });
        }
      };
      if (c.toBlob) c.toBlob((b) => finish(b), 'image/png');
      else finish(null);
    } catch { /* 分享失败不影响主流程 */ }
  }

  // 平台 SDK：boot 按 placement 拉本产品单元（引擎驱动）→ configure（publishable_key 启用行为事件流；
  // 发奖走服务端中继）→ 原生位容器建位
  useEffect(() => {
    fetch('/api/publisher/boot?domain=' + encodeURIComponent(location.hostname) + '&placements=astro_deep_unlock,astro_native')
      .then((r) => r.json())
      .then((d) => {
        if (!d || !d.ok) return;
        placementsRef.current = d.placements || {};
        const t = setInterval(() => {
          const p = (window as unknown as { 平台?: { configure?: (o: Record<string, string>) => void; defineSlot?: (el: HTMLElement, spec: Record<string, unknown>) => { id: string } | null; refresh?: (ids?: string[]) => void } }).平台;
          if (p && p.configure && p.defineSlot) {
            clearInterval(t);
            p.configure({ apiKey: d.publishable_key || '', rewardUrl: '/api/astro/reward' });
            const el = nativeSlotRef.current;
            const np = placementsRef.current.astro_native;
            if (el && np && np.ad_unit_id && !el.getAttribute('data-defined')) {
              el.setAttribute('data-defined', '1');
              p.defineSlot(el, { format: 'native', adUnit: np.ad_unit_id, cat: 'astrology', geo: 'CN', floor: 0 });
              p.refresh && p.refresh();
            }
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
      if (after && before) { setSign(SIGNS[Math.min(i, 11)].n); break; }
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
      body: JSON.stringify({ tool: 'astrology', content: sign, sign, mode, type: period, name: nick.trim(),
        focus: topic === '综合' ? '' : topic }),
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
      const n = bumpStreak();
      setStreak(n);
      if (n >= 2) track('streak_day', { sign, count: n });
      actionsCelebrated.current = false;
      buildActions();
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

  function onUnlock() {
    const ad = sdk();
    const rewardUnit = placementsRef.current.astro_deep_unlock?.ad_unit_id;
    if (!ad || !rewardUnit) {
      unlockedViaRef.current = 'fallback';
      track('astro_ad_fallback', { reason: ad ? 'placement_missing' : 'sdk_missing' });
      expandDeep();
      return;
    }
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

  const allDone = actions.length > 0 && actions.every((a) => a.done);

  return (
    <div className="app">
      <style>{`
        .xp-hero h1{margin:0 0 6px;font-size:30px;background:linear-gradient(to right,#fff,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .xp-sub{color:var(--mut,#93a3c4);margin:0 0 22px;font-size:14px}
        .xp-date{color:#7dd3fc;font-size:13px;margin-bottom:18px;font-variant-numeric:tabular-nums}
        .xp-zodiac{display:grid;grid-template-columns:repeat(6,1fr);gap:9px}
        @media(max-width:620px){.xp-zodiac{grid-template-columns:repeat(4,1fr)}}
        .xp-z{background:#0d1730;border:1px solid #24345c;border-radius:11px;padding:11px 4px;text-align:center;cursor:pointer;font-size:12px;color:#93a3c4;transition:.15s}
        .xp-z:hover{border-color:#60a5fa}
        .xp-z.on{border-color:#22d3ee;background:rgba(34,211,238,.13);color:#dbeafe;transform:translateY(-1px)}
        .xp-z b{display:block;font-size:24px;margin-bottom:3px;color:#c7d8ff}
        .xp-topics{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
        .xp-t{padding:9px 16px;border-radius:14px;border:1px solid #2f4170;background:#0d1730;color:#93a3c4;font-size:13.5px;cursor:pointer;transition:.15s}
        .xp-t:hover{border-color:#60a5fa;color:#bfdbfe}
        .xp-t.on{border-color:#22d3ee;background:rgba(34,211,238,.12);color:#a5f3fc;font-weight:600;transform:translateY(-1px)}
        .xp-row{display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:14px}
        .xp-seg{display:inline-flex;border:1px solid #2f4170;border-radius:9px;overflow:hidden}
        .xp-seg button{padding:8px 15px;border:0;background:transparent;color:#93a3c4;font-size:13px;cursor:pointer;font-family:inherit}
        .xp-seg button.on{background:rgba(59,130,246,.2);color:#dbeafe;font-weight:600}
        .xp-nick{display:flex;align-items:center;gap:8px;font-size:13px;color:#93a3c4}
        .xp-nick input{width:130px;padding:8px 10px;border:1px solid #2f4170;background:#0d1730;color:#e8eefc;border-radius:8px;font-size:13px;font-family:inherit}
        .xp-btn{width:100%;margin-top:16px;padding:12px 20px;border:0;border-radius:9px;background:linear-gradient(92deg,#2563eb,#3b82f6,#22d3ee);color:#fff;font-weight:700;font-size:15px;cursor:pointer;transition:transform .15s;font-family:inherit}
        .xp-btn:hover{transform:translateY(-1px)}
        .xp-btn:disabled{opacity:.6;cursor:wait}
        .xp-deep{background:linear-gradient(92deg,#6366f1,#a855f7)}
        .xp-err{margin-top:14px;border:1px solid #7f2b2b;background:rgba(248,113,113,.08);color:#fca5a5;border-radius:9px;padding:11px 13px;font-size:13px}
        .xp-out{border:1px solid #26355c;border-radius:12px;padding:18px;background:#0d1730;margin-top:18px;white-space:pre-wrap;line-height:1.9;font-size:14.5px;color:#dbe6ff;text-align:left}
        .xp-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:10px;font-weight:700}
        .xp-head .xp-when{color:#7dd3fc;font-weight:400;font-size:13px;font-variant-numeric:tabular-nums}
        .xp-badge{font-size:11px;padding:2px 9px;border-radius:999px;border:1px solid #2563eb;color:#7dd3fc;background:rgba(37,99,235,.12);font-weight:400}
        /* 破局报告 teaser：先看见锁住的是什么，再谈解锁 */
        .xp-teaser{margin-top:16px;border:1px solid #3d2f6e;border-radius:12px;padding:15px;background:linear-gradient(135deg,rgba(99,102,241,.09),rgba(168,85,247,.07))}
        .xp-teaser h3{margin:0 0 8px;font-size:14.5px;color:#c4b5fd}
        .xp-teaser ul{margin:0 0 4px;padding-left:18px;color:#b7a8ee;font-size:13.5px;line-height:2}
        .xp-teaser-tip{margin:8px 0 0;font-size:12px;color:#93a3c4;text-align:center}
        /* 3D 翻牌行动卡 */
        .xp-cardwrap{perspective:900px;height:88px;margin-bottom:9px}
        .xp-cardin{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .45s cubic-bezier(.2,.7,.3,1.15);cursor:pointer}
        .xp-cardwrap.flipped .xp-cardin{transform:rotateY(180deg)}
        .xp-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;align-items:center;gap:11px;padding:12px 15px;
          border-radius:11px;border:1px solid #26355c;background:#0d1730;color:#dbe6ff;font-size:13.5px;text-align:left;width:100%}
        .xp-face.back{justify-content:center;color:#7dd3fc;background:linear-gradient(135deg,#13224a,#0d1730);letter-spacing:1px}
        .xp-face.front{transform:rotateY(180deg);font-family:inherit}
        .xp-cardwrap.done .xp-face.front{opacity:.75;border-color:rgba(74,222,128,.5)}
        .xp-cardwrap.done .xp-face.front .txt{text-decoration:line-through;text-decoration-color:rgba(219,230,255,.4)}
        .xp-box{width:21px;height:21px;flex:none;border:1.5px solid #3b5a8f;border-radius:6px;display:grid;place-items:center;font-size:12px;color:#052e16}
        .xp-cardwrap.done .xp-box{background:#4ade80;border-color:#4ade80}
        .xp-acts{margin-top:16px;border:1px dashed #33507f;border-radius:12px;padding:14px;background:rgba(34,211,238,.04)}
        .xp-acts-h{display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-bottom:10px}
        .xp-acts-h span{color:#7dd3fc;font-variant-numeric:tabular-nums}
        .xp-acts-bar{height:5px;border-radius:5px;background:#1a2a4d;overflow:hidden;margin-bottom:12px}
        .xp-acts-bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#22d3ee,#4ade80);transition:width .35s ease}
        .xp-acts-tip{margin:8px 0 0;font-size:12px;color:#93a3c4;text-align:center}
        .xp-share{margin-top:12px;padding:10px 18px;border:1px solid #f3d98b55;border-radius:9px;background:rgba(243,217,139,.08);color:#f3d98b;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit}
        .xp-share:hover{background:rgba(243,217,139,.15)}
      `}</style>

      <section className="hero xp-hero">
        <div className="eyebrow">AI 占星 · 心理版 · 免费</div>
        <h1>AI 星盘相位 · 深度运势</h1>
        <p className="sub">选一个议题，30 秒拿到今天的相位速览。</p>
        <p className="xp-date">{dateLabel()} · 每天一张新星签</p>
      </section>

      <section className="panel" aria-label="选择星座与议题">
        <div className="xp-zodiac" role="listbox" aria-label="十二星座">
          {SIGNS.map((s) => (
            <button key={s.n} type="button" role="option" aria-selected={sign === s.n}
              className={'xp-z' + (sign === s.n ? ' on' : '')}
              onClick={() => setSign(s.n)}>
              <b>{s.g}</b>{s.n}
            </button>
          ))}
        </div>
        <div className="xp-topics" aria-label="今日议题">
          {TOPICS.map((t) => (
            <button key={t.k} type="button" className={'xp-t' + (topic === t.k ? ' on' : '')}
              onClick={() => setTopic(t.k)}>{t.e} {t.k}</button>
          ))}
        </div>
        <div className="xp-row">
          <div className="xp-seg" role="group" aria-label="周期">
            <button type="button" className={period === 'daily' ? 'on' : ''} onClick={() => setPeriod('daily')}>今日简报</button>
            <button type="button" className={period === 'weekly' ? 'on' : ''} onClick={() => setPeriod('weekly')}>本周趋势</button>
          </div>
          {/* 称呼仅用于星签署名（可选）：低承诺、不挡主流程；整棵子树对会话回放阻断，见 lib/posthog-replay.mjs 的敏感选择器 */}
          <div className="xp-nick ph-no-capture" data-ph-no-capture>
            <label htmlFor="nick">署名</label>
            <input id="nick" value={nick} maxLength={12} placeholder="可选，印在星签上"
              onChange={(e) => setNick(e.target.value)} />
          </div>
        </div>
        <button className="xp-btn" onClick={generate} disabled={loading}>
          {loading ? '星盘解析中…' : (topic === '综合' ? '✦ 解析我的相位' : '✦ 围绕「' + topic + '」解析我的相位')}
        </button>
      </section>

      <div aria-live="polite">
        {err && <div className="panel xp-err" role="alert">{err}</div>}
        {result && (
          <section className="panel xp-out" ref={outRef}>
            <div className="xp-head">
              <span>{signGlyph} {sign} · {unlocked ? '心理相位破局报告' : (period === 'weekly' ? '本周趋势' : '今日简报')}
                <span className="xp-when">　{dateLabel()}{streak >= 2 ? ' · 🔥 连续 ' + streak + ' 天' : ''}</span>
              </span>
              <span className="xp-badge">AI 生成</span>
            </div>
            {result}
            {actions.length > 0 && (
              <div className="xp-acts">
                <div className="xp-acts-h">
                  <b>🧩 破局行动卡 · 翻开今天的三件事</b>
                  <span>{actions.filter((a) => a.done).length}/3</span>
                </div>
                <div className="xp-acts-bar"><i style={{ width: (actions.filter((a) => a.done).length / 3) * 100 + '%' }} /></div>
                {actions.map((a, i) => (
                  <div key={a.text} className={'xp-cardwrap' + (a.flipped ? ' flipped' : '') + (a.done ? ' done' : '')}>
                    <div className="xp-cardin" role="button" tabIndex={0}
                      aria-label={a.flipped ? a.text : '第' + (i + 1) + '件事，点击翻开'}
                      onClick={() => flipCard(i)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCard(i); } }}>
                      <div className="xp-face back">✦ 第 {i + 1} 件 · 轻触翻开</div>
                      <button type="button" className="xp-face front" tabIndex={-1}>
                        <span className="xp-box">{a.done ? '✓' : ''}</span>
                        <span className="txt">{a.text}</span>
                      </button>
                    </div>
                  </div>
                ))}
                <p className="xp-acts-tip">
                  {allDone
                    ? '🎉 三件全做完——今天的你已经赢过昨天的自己。明天来抽新的行动卡。'
                    : '翻开 → 做到 → 打勾。三件全做完，生成你的今日星签。'}
                </p>
                {allDone && (
                  <div style={{ textAlign: 'center' }}>
                    <button type="button" className="xp-share" onClick={shareCard}>🖼 生成今日星签 · 分享给朋友</button>
                  </div>
                )}
              </div>
            )}
            {!unlocked && (
              <div className="xp-teaser">
                <h3>🔒 心理相位破局报告</h3>
                <ul>
                  <li>你的潜意识正在重复什么模式</li>
                  <li>这段时间的关系动力学与雷区</li>
                  <li>一条今天就能执行的破局路径</li>
                </ul>
                <button className="xp-btn xp-deep" onClick={onUnlock} disabled={deepBusy}>
                  {deepBusy ? '正在准备…' : '▶ 看一段视频，免费解锁完整报告'}
                </button>
                <p className="xp-teaser-tip">全程约 30 秒 · 看完即解锁</p>
              </div>
            )}
          </section>
        )}
        {!result && !loading && !err && (
          <section className="panel empty">
            <p>点星座 → 选议题 → 生成今天的星签。</p>
          </section>
        )}
      </div>

      <section className="panel about">
        <h2 className="section-title">为什么免费？</h2>
        <p className="muted">
          概览免费、无需注册；深度破局报告看一段视频即可解锁。做完行动卡还能生成专属星签图，分享给朋友。
          但别用它替你做重大决定——运势是视角，不是答案。
        </p>
      </section>

      {/* 有机交叉导流（2026-10-28）：流量王的站内接力位，付费侧由交叉导流计划覆盖 */}
      <section className="panel" aria-label="接下来玩什么">
        <h2 className="section-title">接下来玩什么？</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <a href="https://dellai.xyz/tool/tarot.html" style={{ textDecoration: 'none' }}>
            <div style={{ border: '1px solid #26355c', borderRadius: 12, padding: '14px 12px', background: '#0d1730', transition: '.15s' }}>
              <div style={{ fontSize: 24 }}>🔮</div>
              <div style={{ fontWeight: 700, color: '#dbe6ff', fontSize: 14, marginTop: 6 }}>AI 塔罗</div>
              <div style={{ color: '#93a3c4', fontSize: 12, marginTop: 3 }}>抽今天的牌，翻面即解读</div>
            </div>
          </a>
          <a href="https://dellai.xyz/tool/writing-assistant.html" style={{ textDecoration: 'none' }}>
            <div style={{ border: '1px solid #26355c', borderRadius: 12, padding: '14px 12px', background: '#0d1730', transition: '.15s' }}>
              <div style={{ fontSize: 24 }}>✍️</div>
              <div style={{ fontWeight: 700, color: '#dbe6ff', fontSize: 14, marginTop: 6 }}>AI 写作助手</div>
              <div style={{ color: '#93a3c4', fontSize: 12, marginTop: 3 }}>给需求，直接拿成稿</div>
            </div>
          </a>
        </div>
      </section>

      {/* AppLink 原生位（第二形态）：引擎驱动——容器只报 placement，单元由 boot 下发后 defineSlot */}
      <aside className="panel" aria-label="广告" style={{ minHeight: 100 }}>
        <div ref={nativeSlotRef} data-placement="astro_native" style={{ minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
        <p className="muted" style={{ fontSize: 11, marginTop: 4, textAlign: 'center' }}>广告 · 由 AppLink 提供</p>
      </aside>
    </div>
  );
}
