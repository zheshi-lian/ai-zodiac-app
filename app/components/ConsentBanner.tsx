'use client';

import { useSyncExternalStore } from 'react';
import { CONSENT_DENIED, CONSENT_GRANTED, CONSENT_UNKNOWN, getConsentStore } from '@/lib/consent.mjs';

const store = getConsentStore();

const bar: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 12,
  zIndex: 60,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 10,
  maxWidth: 720,
  margin: '0 auto',
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(12,12,24,0.92)',
  color: '#e9e6ff',
  fontSize: 12.5,
  lineHeight: 1.6,
  boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
};

const text: React.CSSProperties = { flex: '1 1 320px', margin: 0, color: 'var(--al-muted, #a9a3c9)' };

function button(kind: 'primary' | 'ghost'): React.CSSProperties {
  return {
    flex: '0 0 auto',
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 12.5,
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: kind === 'primary' ? '1px solid transparent' : '1px solid rgba(255,255,255,0.22)',
    background: kind === 'primary' ? 'linear-gradient(92deg,#6a11cb,#2575fc)' : 'transparent',
    color: '#fff',
  };
}

/**
 * 分析 / 会话回放的同意入口（唯一的 grant 来源）。
 * - 未表态（unknown）不录制：只有点「允许」才写入 granted；
 * - 「关闭」= 撤回：写 denied，控制器随即 opt_out + 停止回放；
 * - 拒绝后仍可手动重新允许，但不会自动恢复录制。
 */
export default function ConsentBanner() {
  const consent = useSyncExternalStore(store.subscribe, store.get, () => CONSENT_UNKNOWN);

  if (consent === CONSENT_GRANTED) {
    return (
      <aside style={bar} role="region" aria-label="分析设置">
        <p style={text}>会话回放已开启：输入框与文本已打码，广告与账户信息不采集。</p>
        <button type="button" style={button('ghost')} onClick={() => store.withdraw()}>
          关闭并撤回
        </button>
      </aside>
    );
  }

  if (consent === CONSENT_DENIED) {
    return (
      <aside style={bar} role="region" aria-label="分析设置">
        <p style={text}>分析已关闭，我们不会记录你的浏览过程。</p>
        <button type="button" style={button('ghost')} onClick={() => store.grant()}>
          允许分析
        </button>
      </aside>
    );
  }

  return (
    <aside style={bar} role="region" aria-label="分析授权">
      <p style={text}>
        愿意让我们用一次脱敏的会话回放（输入框与文本全部打码）了解哪里不好用吗？不会记录姓名、广告或账户信息。
      </p>
      <button type="button" style={button('primary')} onClick={() => store.grant()}>
        允许分析
      </button>
      <button type="button" style={button('ghost')} onClick={() => store.deny()}>
        仅保留必要功能
      </button>
    </aside>
  );
}
