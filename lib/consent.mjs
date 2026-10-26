/**
 * 分析 / 会话回放的同意的唯一来源（浏览器端）。
 *
 * 三态：granted / denied / unknown。
 * - 只在用户点过「允许」之后才是 granted；
 * - 存储缺失、读写异常、值不合法一律是 unknown（绝不默认允许）；
 * - 撤回 = 明确写成 denied，订阅方据此 opt_out + 停止回放。
 *
 * 纯 JS 模块 + 可注入存储，便于在 node:test 里直接 import 校验。
 */

export const ANALYTICS_CONSENT_KEY = 'al_analytics_consent_v1';
export const CONSENT_GRANTED = 'granted';
export const CONSENT_DENIED = 'denied';
export const CONSENT_UNKNOWN = 'unknown';

/** 把任意输入收敛成三种状态，未知值一律 unknown。 */
export function normalizeConsent(state) {
  if (state === CONSENT_GRANTED) return CONSENT_GRANTED;
  if (state === CONSENT_DENIED) return CONSENT_DENIED;
  return CONSENT_UNKNOWN;
}

function browserStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    /* Safari 隐私模式等场景：拿不到存储就退化成内存态 */
    return null;
  }
}

/**
 * 创建同意存储。
 * @param {{ storage?: { getItem(k: string): string | null, setItem(k: string, v: string): void } | null, key?: string }} [options]
 */
export function createConsentStore(options = {}) {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const key = options.key || ANALYTICS_CONSENT_KEY;
  const listeners = new Set();
  let current = null;

  function get() {
    if (current) return current;
    let stored = null;
    try {
      stored = storage ? storage.getItem(key) : null;
    } catch {
      stored = null;
    }
    current = normalizeConsent(stored);
    return current;
  }

  function emit(state) {
    for (const listener of Array.from(listeners)) {
      try {
        listener(state);
      } catch {
        /* 单个订阅方异常不影响其它订阅 */
      }
    }
  }

  function set(next) {
    const state = normalizeConsent(next);
    current = state;
    try {
      if (storage) storage.setItem(key, state);
    } catch {
      /* 写不进去就只在本次页面生命周期内生效 */
    }
    emit(state);
    return state;
  }

  return {
    key,
    get,
    grant() {
      return set(CONSENT_GRANTED);
    },
    deny() {
      return set(CONSENT_DENIED);
    },
    /** 撤回分析：等同明确拒绝，回放控制器会 opt_out 并停止录制。 */
    withdraw() {
      return set(CONSENT_DENIED);
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let sharedStore = null;

/** 全站共用一份同意存储（同源同 localStorage key）。 */
export function getConsentStore() {
  if (!sharedStore) sharedStore = createConsentStore();
  return sharedStore;
}
