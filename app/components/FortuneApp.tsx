'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SIGNS, todayCN, todayKey } from '@/lib/signs';
import type { SignInfo } from '@/lib/signs';
import { track } from '@/lib/track';

type Period = 'daily' | 'weekly' | 'monthly';

const PERIOD_LABEL: Record<Period, string> = { daily: '今日', weekly: '本周', monthly: '本月' };
const PERIOD_TITLE: Record<Period, string> = { daily: '今日运势', weekly: '本周运势', monthly: '本月运势' };

type HistoryItem = { sign: string; period: Period; date: string; text: string; ts: number };

function cacheKey(sign: string, period: Period) {
  return `al_f_${todayKey()}_${sign}_${period}`;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function FortuneApp({ initialSign }: { initialSign?: SignInfo }) {
  const [sign, setSign] = useState<SignInfo>(initialSign || SIGNS[6]);
  const [period, setPeriod] = useState<Period>('daily');
  const [result, setResult] = useState('');
  const [deep, setDeep] = useState('');
  const [loading, setLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [error, setError] = useState('');
  const [shared, setShared] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [cached, setCached] = useState(false);

  useEffect(() => {
    track('page_view', { sign: sign.slug, page: initialSign ? 'sign' : 'home' });
    setHistory(readJSON<HistoryItem[]>('al_history', []));
    const fromQuery = new URLSearchParams(location.search).get('p');
    if (fromQuery === 'weekly' || fromQuery === 'monthly' || fromQuery === 'daily') setPeriod(fromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换星座 / 周期时，优先显示当天已经生成过的结果（省 token，也避免重复等待）
  useEffect(() => {
    const hit = readJSON<{ text?: string } | null>(cacheKey(sign.slug, period), null);
    if (hit && hit.text) {
      setResult(hit.text);
      setCached(true);
      setError('');
    } else {
      setResult('');
      setCached(false);
    }
    setDeep('');
    setShared(false);
    setShareMsg('');
  }, [sign.slug, period]);

  const saveHistory = useCallback((item: HistoryItem) => {
    const next = [item, ...readJSON<HistoryItem[]>('al_history', []).filter(
      (h) => !(h.sign === item.sign && h.period === item.period && h.date === item.date)
    )].slice(0, 8);
    setHistory(next);
    try { localStorage.setItem('al_history', JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    setCached(false);
    const t0 = Date.now();
    track('generate_start', { sign: sign.slug, period });
    try {
      const res = await fetch('/api/ai-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'astrology', content: sign.name, sign: sign.name, type: period }),
      });
      const data = await res.json().catch(() => ({}));
      const text = data.result || data.fortune;
      if (!res.ok || !text) throw new Error(data.message || data.error || '生成失败，请稍后再试');
      setResult(text);
      try { localStorage.setItem(cacheKey(sign.slug, period), JSON.stringify({ text, ts: Date.now() })); } catch { /* ignore */ }
      saveHistory({ sign: sign.slug, period, date: todayKey(), text, ts: Date.now() });
      track('generate_success', { sign: sign.slug, period, ms: Date.now() - t0, source: data.source || 'unknown' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '网络异常，请稍后再试';
      setError(msg);
      track('generate_fail', { sign: sign.slug, period, ms: Date.now() - t0 });
    } finally {
      setLoading(false);
    }
  }, [period, saveHistory, sign.name, sign.slug]);

  const unlockDeep = useCallback(async () => {
    if (deep || deepLoading) return;
    setDeepLoading(true);
    setError('');
    track('unlock_click', { sign: sign.slug, from: period });
    try {
      const res = await fetch('/api/ai-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'astrology', content: sign.name, sign: sign.name, type: 'monthly' }),
      });
      const data = await res.json().catch(() => ({}));
      const text = data.result || data.fortune;
      if (!res.ok || !text) throw new Error(data.message || data.error || '深度解析生成失败');
      setDeep(text);
      track('unlock_success', { sign: sign.slug });
    } catch (e) {
      setError(e instanceof Error ? e.message : '深度解析生成失败');
    } finally {
      setDeepLoading(false);
    }
  }, [deep, deepLoading, period, sign.name, sign.slug]);

  const share = useCallback(async () => {
    const url = `https://dellai.xyz/astro/${sign.slug}.html`;
    const title = `${sign.name}${PERIOD_TITLE[period]}`;
    const text = result ? `${title}：${result.replace(/\s+/g, ' ').slice(0, 90)}…` : title;
    const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    const canClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard;
    track('share_click', { sign: sign.slug, period });
    try {
      let method: 'native' | 'copy' | 'manual' = 'manual';
      if (canNative) {
        try {
          await navigator.share({ title, text, url });
          method = 'native';
        } catch {
          method = 'manual';
        }
      } else if (canClipboard) {
        try {
          await navigator.clipboard.writeText(`${title}\n${url}`);
          method = 'copy';
        } catch {
          method = 'manual';
        }
      }
      setShared(true);
      setShareMsg(
        method === 'native'
          ? '已分享，深度解析已解锁'
          : method === 'copy'
            ? '链接已复制，深度解析已解锁'
            : `手动复制链接分享：${url}`,
      );
      track('share_success', { sign: sign.slug, period, method });
      unlockDeep();
    } catch {
      setShareMsg('分享失败，请手动复制地址栏链接。');
    }
  }, [period, result, sign.slug, unlockDeep]);

  const historyItems = useMemo(() => history.slice(0, 5), [history]);

  const restore = (h: HistoryItem) => {
    const s = SIGNS.find((x) => x.slug === h.sign);
    if (!s) return;
    setSign(s);
    setPeriod(h.period);
    setResult(h.text);
    setCached(h.date === todayKey());
    setDeep('');
    setShared(false);
    track('cta_click', { action: 'history_restore', sign: h.sign, period: h.period });
  };

  return (
    <div className="app">
      <section className="hero">
        <div className="eyebrow">AI 占星 · 免费 · 无需注册</div>
        <h1>{initialSign ? `${sign.name}${PERIOD_TITLE[period]}` : 'AI 星座运势'}</h1>
        <p className="sub">
          {initialSign
            ? `查看${sign.name}今天、本周、本月的整体状态，以及事业、感情、财运与健康建议。`
            : '选一个星座，生成今天、本周或本月的专属运势。可分享、可回看，每天更新。'}
        </p>
      </section>

      <section className="panel" aria-label="选择星座与周期">
        <div className="chips" role="listbox" aria-label="十二星座">
          {SIGNS.map((s) => (
            <button
              key={s.slug}
              type="button"
              role="option"
              aria-selected={s.slug === sign.slug}
              className={`chip ${s.slug === sign.slug ? 'on' : ''}`}
              onClick={() => { setSign(s); track('cta_click', { action: 'select_sign', sign: s.slug }); }}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="controls">
          <div className="tabs" role="tablist" aria-label="运势周期">
            {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={period === p}
                className={period === p ? 'on' : ''}
                onClick={() => { setPeriod(p); track('cta_click', { action: 'period', period: p }); }}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          <button className="primary" onClick={generate} disabled={loading}>
            {loading ? '正在生成…' : cached ? '重新生成' : `生成${sign.name}${PERIOD_LABEL[period]}运势`}
          </button>
        </div>
        <div className="hint">{todayCN()} · 内容由 AI 生成，仅供娱乐</div>
      </section>

      <div aria-live="polite">
        {error && <div className="error">{error}</div>}

        {loading && !result && (
          <section className="panel result">
            <div className="skeleton" />
            <div className="skeleton short" />
            <div className="skeleton" />
            <div className="skeleton short" />
          </section>
        )}

        {result && (
          <section className="panel result">
            <div className="result-head">
              <div>
                <div className="kicker">{sign.element} · 守护星 {sign.ruler}</div>
                <h2>{sign.name} · {PERIOD_TITLE[period]}</h2>
              </div>
              {cached && <span className="badge">今日已生成</span>}
            </div>
            <p className="fortune">{result}</p>
            <div className="actions">
              <button className="ghost" onClick={share}>
                {shared ? '已分享' : '分享给朋友'}
              </button>
              {!deep && (
                <button className="ghost" onClick={unlockDeep} disabled={deepLoading}>
                  {deepLoading ? '正在解锁…' : '解锁本月深度解析'}
                </button>
              )}
              <a className="ghost" href={`https://dellai.xyz/astro/${sign.slug}.html`}>星座主页</a>
            </div>
            {shareMsg && <div className="ok">{shareMsg}</div>}
            {deep && (
              <div className="deep">
                <h3>{sign.name} · 本月深度解析</h3>
                <p>{deep}</p>
              </div>
            )}
          </section>
        )}

        {!result && !loading && (
          <section className="panel empty">
            <p>选择星座后点「生成」，就会得到一段完整的运势解读。</p>
            <p className="muted">同一星座同一天只生成一次，之后直接从本地读取，秒开。</p>
          </section>
        )}
      </div>

      {historyItems.length > 0 && (
        <section className="panel">
          <h2 className="section-title">最近看过</h2>
          <ul className="history">
            {historyItems.map((h) => {
              const s = SIGNS.find((x) => x.slug === h.sign);
              return (
                <li key={`${h.sign}-${h.period}-${h.ts}`}>
                  <button onClick={() => restore(h)}>
                    <b>{s?.name || h.sign}</b>
                    <span>{PERIOD_LABEL[h.period]}</span>
                    <span className="muted">{h.date}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="panel about">
        <h2 className="section-title">关于星座运势</h2>
        <p>
          运势内容由 AI 根据星座性格、元素与当日日期生成，不是对未来的确定预测。把它当作一次自我观察的提示：
          哪些状态值得保留，哪些反应可以换一种方式。
        </p>
        <div className="links">
          {SIGNS.filter((s) => s.slug !== sign.slug).slice(0, 8).map((s) => (
            <a key={s.slug} href={`https://dellai.xyz/astro/${s.slug}.html`}>{s.name}运势</a>
          ))}
        </div>
      </section>

      <aside className="house-ad" aria-label="赞助">
        <span className="ad-label">赞助</span>
        <div>
          <strong>你在做出海 App？</strong>
          <p>免费查任意 App 的广告 SDK 与变现平台，或给落地页做一次 SEO / GEO 体检。</p>
          <a href="https://dellai.xyz/app-report.html" target="_blank" rel="noopener"
             onClick={() => track('outbound_click', { to: 'app-report' })}>App 情报查询 →</a>
          <a href="https://dellai.xyz/tool/seo-check.html" target="_blank" rel="noopener"
             onClick={() => track('outbound_click', { to: 'seo-check' })}>落地页体检 →</a>
        </div>
      </aside>
    </div>
  );
}
