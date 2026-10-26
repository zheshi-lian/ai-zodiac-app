/**
 * PostHog 会话回放控制器（浏览器端，唯一入口）。
 *
 * 设计约束（隐私优先）：
 * - 只有拿到用户明确同意（consent store 的 granted）才会 init SDK；
 *   缺 token / host 直接 no-op，一次请求都不发。
 * - 新客户端一律 opt_out_capturing_by_default + disable_session_recording；
 *   同意后先 opt_in_capturing()，再不带任何参数的 startSessionRecording()，
 *   项目侧的启用开关 / 采样 / 触发器 / 最短时长 / 授权域名仍然照常生效。
 * - 回放的每个通道（输入框、文本、元素属性、canvas、JSON-LD、请求体/头、console、性能）
 *   都显式关闭或全量打码，不依赖项目侧远端默认值。
 * - 网络请求与回放页面 URL 统一走 maskCapturedNetworkRequestFn：去掉 query 与 hash，
 *   解析失败 / 非 http(s) / 敏感路由一律丢弃。
 *
 * 纯 JS（.mjs）模块，SDK / 路由 / 同意来源全部从外部注入，
 * 因此可以被 node:test 直接 import 并用桩验证（Node 18 不能直接加载 TS/TSX）。
 */

import { CONSENT_GRANTED, normalizeConsent } from './consent.mjs';

export const POSTHOG_SDK_VERSION = '1.438.13';

export const POSTHOG_TOKEN_ENV = 'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN';
export const POSTHOG_HOST_ENV = 'NEXT_PUBLIC_POSTHOG_HOST';

/** 唯一允许录制的安全链路：星座运势首页。 */
export const JOURNEY_ROUTE = '/';

/** auth / 支付 / 账户类路径一律不录（先按路径段匹配）。 */
export const SENSITIVE_ROUTE_SEGMENTS = Object.freeze([
  'login',
  'signin',
  'sign-in',
  'signup',
  'sign-up',
  'auth',
  'oauth',
  'logout',
  'account',
  'profile',
  'settings',
  'password',
  'reset',
  'billing',
  'payment',
  'pay',
  'checkout',
  'recharge',
  'withdraw',
  'wallet',
  'order',
  'orders',
  'invoice',
  'admin',
  'invite',
  'token',
]);

/**
 * 敏感 DOM：整棵子树不录（文本打码覆盖不到属性、图片和 title）。
 * .ph-no-capture 是 PostHog 约定的阻断类名，必须保留。
 */
export const SENSITIVE_DOM_SELECTORS = Object.freeze([
  '.ph-no-capture',
  '[data-ph-no-capture]',
  '[data-private]',
  'input[type="password"]',
  'input[type="email"]',
  'input[type="tel"]',
  'input[autocomplete="cc-number"]',
]);

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);
const ABSOLUTE_URL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const SENSITIVE_PATH_PATTERNS = Object.freeze([
  /[^\s/@]+@[^\s/@]+\.[a-z]{2,}/i,
  /\+?\d[\d\s().-]{7,}\d/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /(?:^|\/)(?:token|key|secret|session|sid|otp|code|passwd)(?:\/|$)/i,
]);

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** 归一化路径：去掉 query / hash / 末尾斜杠，统一小写。 */
export function normalizePath(pathname) {
  if (!hasText(pathname)) return '/';
  let path = String(pathname).split('#')[0].split('?')[0].trim();
  if (!path.startsWith('/')) path = '/' + path;
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';
  return path.toLowerCase();
}

export function isSensitiveRoute(pathname) {
  const segments = normalizePath(pathname).split('/').filter(Boolean);
  return segments.some((segment) => SENSITIVE_ROUTE_SEGMENTS.includes(segment));
}

export function isJourneyRoute(pathname) {
  const path = normalizePath(pathname);
  return path === JOURNEY_ROUTE && !isSensitiveRoute(path);
}

function safeDecode(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return '';
  }
}

/**
 * 回放用的 URL 脱敏：只保留 origin + pathname（query 与 hash 直接去掉）。
 * 解析不了、非 http(s)、命中敏感路由或敏感路径标识（邮箱 / 手机号 / UUID / token）→ null（丢弃）。
 * @param {unknown} raw
 * @returns {string | null}
 */
export function redactReplayUrl(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;

  const relative = !ABSOLUTE_URL.test(value);
  let url;
  try {
    url = relative ? new URL(value, 'https://redaction.invalid') : new URL(value);
  } catch {
    return null;
  }

  if (!relative && !SAFE_PROTOCOLS.has(url.protocol.toLowerCase())) return null;
  if (!relative && !url.host) return null;

  const pathname = url.pathname || '/';
  if (isSensitiveRoute(pathname)) return null;

  const decoded = safeDecode(pathname);
  if (!decoded) return null;
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(pathname) || pattern.test(decoded)) return null;
  }

  return relative ? pathname : `${url.origin}${pathname}`;
}

/**
 * session_recording.maskCapturedNetworkRequestFn 的实现：
 * 同时覆盖网络请求和回放页面 URL；不安全就返回 null（PostHog 会丢弃该条）。
 */
export function createMaskedRequestFn() {
  return function maskCapturedNetworkRequest(request) {
    if (!request || typeof request !== 'object') return null;
    const target = typeof request.name === 'string' ? request.name : request.url;
    const safe = redactReplayUrl(target);
    if (!safe) return null;

    const masked = { ...request, name: safe };
    if (typeof request.url === 'string') masked.url = safe;
    for (const field of ['requestBody', 'responseBody', 'requestHeaders', 'responseHeaders']) {
      delete masked[field];
    }
    return masked;
  };
}

/**
 * 生成传给 posthog.init() 的配置。缺 token / host 返回 null（调用方不得 init）。
 * @param {{ token?: string, host?: string }} [config]
 */
export function buildReplayOptions(config = {}) {
  const { token, host } = config;
  if (!hasText(token) || !hasText(host)) return null;

  return {
    api_host: host.trim(),

    // 新客户端：默认不采集、不录制，等用户明确同意
    opt_out_capturing_by_default: true,
    disable_session_recording: true,

    // 非回放通道全部关掉（不依赖项目侧远端默认值）
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_performance: false,
    enable_recording_console_log: false,
    mask_all_text: true,
    mask_all_element_attributes: true,

    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
      recordBody: false,
      recordHeaders: false,
      captureCanvas: { recordCanvas: false },
      captureJsonLd: false,
      blockClass: 'ph-no-capture',
      blockSelector: SENSITIVE_DOM_SELECTORS.join(', '),
      maskCapturedNetworkRequestFn: createMaskedRequestFn(),
    },
  };
}

/**
 * 回放控制器。返回的每个方法都不会抛异常：SDK 挂了页面照常工作。
 * @param {{
 *   sdk?: any,
 *   consent?: { get?: () => string, subscribe?: (fn: (state: string) => void) => (() => void) | void },
 *   router?: { getPathname?: () => string, subscribe?: (fn: (pathname: string) => void) => (() => void) | void },
 *   token?: string,
 *   host?: string,
 *   journeyRoute?: string,
 * }} [deps]
 */
export function createReplayController(deps = {}) {
  const state = {
    sdk: deps.sdk || null,
    consent: deps.consent || null,
    router: deps.router || null,
    token: deps.token,
    host: deps.host,
    journeyRoute: normalizePath(deps.journeyRoute || JOURNEY_ROUTE),
    consentState: 'unknown',
    initialized: false,
    recording: false,
    attached: false,
    offConsent: null,
    offRoute: null,
  };

  function call(method, ...args) {
    const sdk = state.sdk;
    if (!sdk || typeof sdk[method] !== 'function') return false;
    try {
      sdk[method](...args);
      return true;
    } catch {
      return false; // SDK 异常不影响页面动作
    }
  }

  function ensureInitialized() {
    if (state.initialized) return true;
    const options = buildReplayOptions({ token: state.token, host: state.host });
    if (!options) return false; // 缺 token / host：彻底 no-op
    const sdk = state.sdk;
    if (!sdk || typeof sdk.init !== 'function') return false;

    try {
      // 已有单例（别处已 init）就复用，不改它的设置，也不重复 init
      if (sdk.__loaded === true) {
        state.initialized = true;
        return true;
      }
      sdk.init(state.token.trim(), options);
      state.initialized = true;
      return true;
    } catch {
      return false;
    }
  }

  function routePath() {
    if (state.router && typeof state.router.getPathname === 'function') {
      try {
        const path = state.router.getPathname();
        if (hasText(path)) return path;
      } catch {
        /* 路由取不到就退回浏览器地址 */
      }
    }
    if (typeof window !== 'undefined' && window.location) return window.location.pathname;
    return state.journeyRoute;
  }

  function recordingAllowedHere() {
    const path = routePath();
    return normalizePath(path) === state.journeyRoute && !isSensitiveRoute(path);
  }

  function startRecording() {
    if (!state.initialized) return false;
    if (state.consentState !== CONSENT_GRANTED) return false;
    if (state.recording) return true; // 不重复 start
    if (!recordingAllowedHere()) return false;
    // 不带任何参数：项目侧采样 / 触发器 / 最短时长等限制继续生效
    if (!call('startSessionRecording')) return false;
    state.recording = true;
    return true;
  }

  function stopRecording() {
    const was = state.recording;
    state.recording = false;
    if (!was) return false;
    return call('stopSessionRecording');
  }

  function applyConsent(next) {
    state.consentState = normalizeConsent(next);

    if (state.consentState !== CONSENT_GRANTED) {
      stopRecording();
      if (state.consentState === 'denied' && state.initialized) call('opt_out_capturing');
      return false;
    }

    if (!ensureInitialized()) return false;
    call('opt_in_capturing');
    return startRecording();
  }

  function handleRoute(pathname) {
    const path = hasText(pathname) ? pathname : routePath();
    if (normalizePath(path) !== state.journeyRoute || isSensitiveRoute(path)) {
      stopRecording(); // 离开安全链路 / 进敏感页：立即停
      return false;
    }
    if (state.consentState === CONSENT_GRANTED && !state.recording) return startRecording();
    return state.recording;
  }

  function attach() {
    if (state.attached) return api;

    if (state.consent && typeof state.consent.subscribe === 'function') {
      const off = state.consent.subscribe((next) => applyConsent(next));
      if (typeof off === 'function') state.offConsent = off;
    }
    if (state.router && typeof state.router.subscribe === 'function') {
      const off = state.router.subscribe((path) => handleRoute(path));
      if (typeof off === 'function') state.offRoute = off;
    }

    state.attached = true;
    const initial = state.consent && typeof state.consent.get === 'function' ? state.consent.get() : 'unknown';
    applyConsent(initial);
    return api;
  }

  function detach() {
    if (typeof state.offConsent === 'function') state.offConsent();
    if (typeof state.offRoute === 'function') state.offRoute();
    state.offConsent = null;
    state.offRoute = null;
    state.attached = false;
    return api;
  }

  const api = {
    attach,
    detach,
    /** 路由变化时调用（也支持订阅式 router）。 */
    handleRoute,
    /** 同意变化时调用（也支持订阅式 consent）。 */
    setConsent: applyConsent,
    start: startRecording,
    stop: stopRecording,
    redactUrl: redactReplayUrl,
    getState() {
      return {
        initialized: state.initialized,
        recording: state.recording,
        consent: state.consentState,
        attached: state.attached,
      };
    },
  };

  return api;
}

let mounted = null;

/**
 * React 入口（app/components/PostHogReplay.tsx）挂载用：
 * 全站只有一个控制器 + 一个 SDK 实例，重复挂载只加引用计数，不重复 init / start / 订阅。
 * @param {Parameters<typeof createReplayController>[0]} deps
 * @returns {() => void} 卸载函数（只摘监听；SDK 单例与已开录制保留，StrictMode 反复挂载不抖动）
 */
export function mountReplay(deps = {}) {
  if (!mounted) mounted = { controller: createReplayController(deps), refs: 0 };
  mounted.refs += 1;
  mounted.controller.attach();

  return function unmount() {
    if (!mounted) return;
    mounted.refs = Math.max(0, mounted.refs - 1);
    if (mounted.refs === 0) mounted.controller.detach();
  };
}

/** 当前已挂载的控制器（调试 / 自检用；没有挂载返回 null）。 */
export function getMountedReplayController() {
  return mounted ? mounted.controller : null;
}
