'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * AI 星盘相位 · 深度运势（漏斗 A · 心理版）
 * 生成概览（免费）→ 激励视频解锁 → 心理相位破局报告。
 * 广告走 AppLink 发布方 SDK（pub_sdk.js），埋点全部由平台数据引擎驱动：
 * 页面只报 placement 名（astro_deep_unlock / astro_native），单元由 /api/publisher/boot 下发，
 * 页面零硬编码单元 ID；发奖由同源中继 /api/astro/reward 用服务端 api_key 签名（浏览器不持密钥）。
 */
const SIGNS = [
  '白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座',
  '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座',
];

type PlacementInfo = { ad_unit_id: string; format: string; name: string };
type Placements = Record<string, PlacementInfo>;

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
  const [actions, setActions] = useState<Array<{ text: string; done: boolean }>>([]);
  const actionsCelebrated = useRef(false);
  const placementsRef = useRef<Placements>({});
  const nativeSlotRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLDivElement>(null);

  // ── 破局行动卡：从议题行动池按「日期×星座×议题」确定性抽 3 条（可玩性 + 明日回访钩子）──
  // 勾满 3 件 → 庆祝态 + 带任务深度信号（ai_signals）刷新原生位，让平台在"完成度最高"
  // 的时刻出价值最高的广告 —— 这是 AppLink 交互特征钩子的直接用法。
  const TOPICS = ['综合', '人际社交', '决策纠结', '情绪能量', '自我成长'] as const;
  const ACTION_POOL: Record<string, string[]> = {
    '综合': ['把最拖的一件事做完 10%', '给想感谢的人发条消息', '睡前写三行今天的高光', '散步 20 分钟不想工作', '整理一张桌面/一个相册', '只喝白开水过完下午'],
    '人际社交': ['主动约一个很久没见的人', '当面（而非微信）夸一个人', '拒绝一个不想去的局', '认真听完一段抱怨不给建议', '给家人打个电话', '在群里认真回一条消息'],
    '决策纠结': ['为纠结的事设一个 48 小时期限', '写下两个选项各自的最好结果', '问一个已经做成的人', '先做可逆的那个决定', '把"要不要"换成"怎么做"', '抛硬币，接住第一反应'],
    '情绪能量': ['睡前一小时不碰手机', '把情绪写成 3 句话不给它讲道理', '晒 15 分钟太阳', '做 20 个深蹲再决定要不要生气', '听一首初中听的歌', '早睡一次，明天再评'],
    '自我成长': ['学一个能立刻用上的小技巧', '读完收藏夹里最旧的一篇', '公开输出一段 200 字的思考', '向高手提一个具体问题', '把一个坏习惯延迟 10 分钟', '给自己定一个 7 天小赌约'],
  };
  function todayKey() { return new Date().toISOString().slice(0, 10); }
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
    let saved: Array<{ text: string; done: boolean }> = [];
    try { saved = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* ignore */ }
    setActions(picked.map((text) => ({ text, done: saved.some((x) => x.text === text && x.done) })));
  }
  function toggleAction(i: number) {
    setActions((prev) => {
      const next = prev.map((a, j) => (j === i ? { ...a, done: !a.done } : a));
      try { localStorage.setItem('xp_actions_' + todayKey(), JSON.stringify(next)); } catch { /* ignore */ }
      const all = next.every((a) => a.done);
      if (all && !actionsCelebrated.current) {
        actionsCelebrated.current = true;
        track('actions_done', { sign, topic, count: 3 });
        celebrateAndBoostAds();
      }
      return next;
    });
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

  const unlockedViaRef = useRef<'rewarded' | 'fallback'>('rewarded');

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
        .xp-topics{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
        .xp-t{padding:7px 15px;border-radius:999px;border:1px solid #2f4170;background:#0d1730;color:#93a3c4;font-size:13px;cursor:pointer;transition:.15s}
        .xp-t:hover{border-color:#60a5fa;color:#bfdbfe}
        .xp-t.on{border-color:#22d3ee;background:rgba(34,211,238,.12);color:#a5f3fc;font-weight:600}
        .xp-acts{margin-top:16px;border:1px dashed #33507f;border-radius:12px;padding:14px;background:rgba(34,211,238,.04)}
        .xp-acts-h{display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-bottom:8px}
        .xp-acts-h span{color:#7dd3fc;font-variant-numeric:tabular-nums}
        .xp-acts-bar{height:5px;border-radius:5px;background:#1a2a4d;overflow:hidden;margin-bottom:10px}
        .xp-acts-bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#22d3ee,#4ade80);transition:width .35s ease}
        .xp-act{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;margin-bottom:7px;
          border:1px solid #26355c;background:#0d1730;border-radius:10px;color:#dbe6ff;font-size:13.5px;cursor:pointer;transition:.15s}
        .xp-act:hover{border-color:#60a5fa}
        .xp-act .box{width:20px;height:20px;flex:none;border:1.5px solid #3b5a8f;border-radius:6px;display:grid;place-items:center;font-size:12px;color:#052e16}
        .xp-act.done{opacity:.75;border-color:rgba(74,222,128,.5)}
        .xp-act.done .box{background:#4ade80;border-color:#4ade80}
        .xp-act.done{text-decoration:line-through;text-decoration-color:rgba(219,230,255,.4)}
        .xp-acts-tip{margin:6px 0 0;font-size:12px;color:#93a3c4}
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
          {/* 自由文本（姓名/昵称）：整棵子树对会话回放阻断，见 lib/posthog-replay.mjs 的敏感选择器 */}
          <div className="ph-no-capture" data-ph-no-capture>
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
        <div className="xp-topics" aria-label="今日议题">
          {TOPICS.map((t) => (
            <button key={t} type="button" className={'xp-t' + (topic === t ? ' on' : '')}
              onClick={() => setTopic(t)}>{t}</button>
          ))}
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
          {loading ? '星盘解析中…' : (topic === '综合' ? '✦ 解析我的相位' : '✦ 围绕「' + topic + '」解析我的相位')}
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
            {actions.length > 0 && (
              <div className="xp-acts">
                <div className="xp-acts-h">
                  <b>🧩 破局行动卡 · 今天做这三件</b>
                  <span>{actions.filter((a) => a.done).length}/3</span>
                </div>
                <div className="xp-acts-bar"><i style={{ width: (actions.filter((a) => a.done).length / 3) * 100 + '%' }} /></div>
                {actions.map((a, i) => (
                  <button key={a.text} type="button" className={'xp-act' + (a.done ? ' done' : '')}
                    onClick={() => toggleAction(i)}>
                    <span className="box">{a.done ? '✓' : ''}</span>{a.text}
                  </button>
                ))}
                <p className="xp-acts-tip">
                  {actions.every((a) => a.done)
                    ? '🎉 三件全做完——今天的你已经赢过昨天的自己。明天来看新的行动卡。'
                    : '全部勾完，会为你点亮今日成就（广告也会换得更懂你）。'}
                </p>
              </div>
            )}
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

      {/* AppLink 原生位（第二形态）：引擎驱动——容器只报 placement，单元由 boot 下发后 defineSlot */}
      <aside className="panel" aria-label="广告" style={{ minHeight: 100 }}>
        <div ref={nativeSlotRef} data-placement="astro_native" style={{ minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
        <p className="muted" style={{ fontSize: 11, marginTop: 4, textAlign: 'center' }}>广告 · 由 AppLink 提供</p>
      </aside>
    </div>
  );
}
