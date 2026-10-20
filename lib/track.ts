'use client';

// 第一方匿名埋点：只发事件名 + 少量扁平属性，不收集手机号/生日等个人身份信息。
// 服务端见 openrtb-bidder/routes_ops.js（JSONL 按天分片，90 天保留）。

type Props = Record<string, string | number | boolean>;

const ENDPOINT = (process.env.NEXT_PUBLIC_TRACK_URL || '/api/track/event').replace(/\/$/, '');
const APP = process.env.NEXT_PUBLIC_TRACK_APP || 'astrology';

function sid(): string {
  if (typeof window === 'undefined') return '';
  try {
    let v = localStorage.getItem('al_sid');
    if (!v) {
      v = 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('al_sid', v);
    }
    return v;
  } catch {
    return '';
  }
}

export function track(event: string, props: Props = {}) {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({
    app: APP,
    event,
    path: location.pathname,
    ref: document.referrer ? document.referrer.slice(0, 180) : '',
    sid: sid(),
    props,
  });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  } catch {
    /* fall through */
  }
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}
