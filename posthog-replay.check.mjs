#!/usr/bin/env node
/**
 * PostHog 会话回放自检（离线）。
 *
 * 做法：父进程用「只有 OS/路径/临时目录 + 合成配置」的最小环境重跑自己，
 * 子进程里把网络打瘫，然后 import 真正被 app/components/PostHogReplay.tsx 挂载的
 * lib/posthog-replay.mjs，用 SDK / 路由 / 同意的桩验证行为。
 * 不复制录制逻辑、不做正则转译、不引入额外 loader。
 *
 * 运行：node posthog-replay.check.mjs
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.dirname(SELF);

/* ── 父进程：只把 OS/路径/临时目录交给子进程，环境从 {} 开始 ───────────── */
if (process.env.REPLAY_CHECK_CHILD !== '1') {
  const passThrough =
    process.platform === 'win32'
      ? [
          'PATH',
          'PATHEXT',
          'SystemRoot',
          'SystemDrive',
          'windir',
          'ComSpec',
          'TEMP',
          'TMP',
          'HOMEDRIVE',
          'HOMEPATH',
          'USERPROFILE',
          'APPDATA',
          'LOCALAPPDATA',
          'NUMBER_OF_PROCESSORS',
          'PROCESSOR_ARCHITECTURE',
          'OS',
        ]
      : ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'];

  const env = { REPLAY_CHECK_CHILD: '1' };
  for (const key of passThrough) {
    if (process.env[key]) env[key] = process.env[key];
  }

  const result = spawnSync(process.execPath, ['--test', SELF], { cwd: ROOT, env, stdio: 'inherit' });
  process.exit(result.status === null ? 1 : result.status);
}

/* ── 子进程：合成配置 + 断网 + 再 import 真实控制器 ─────────────────────── */
process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'replay_check_synthetic_project_token';
process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';

let networkAttempts = 0;
globalThis.fetch = () => {
  networkAttempts += 1;
  return Promise.reject(new Error('network denied by replay check'));
};

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs');
const { createRequire } = await import('node:module');

const replay = await import('./lib/posthog-replay.mjs');
const consentModule = await import('./lib/consent.mjs');

const {
  POSTHOG_SDK_VERSION,
  buildReplayOptions,
  createReplayController,
  createMaskedRequestFn,
  getMountedReplayController,
  isJourneyRoute,
  isSensitiveRoute,
  mountReplay,
  redactReplayUrl,
} = replay;

const TOKEN = 'replay_check_synthetic_project_token';
const HOST = 'https://eu.i.posthog.com';

/* ── 桩 ──────────────────────────────────────────────────────────────── */
function createSdkStub(overrides = {}) {
  const calls = {
    init: [],
    opt_in_capturing: 0,
    opt_out_capturing: 0,
    startSessionRecording: [],
    stopSessionRecording: 0,
  };

  const sdk = {
    init(token, options) {
      calls.init.push({ token, options });
      sdk.__loaded = true;
    },
    opt_in_capturing() {
      calls.opt_in_capturing += 1;
    },
    opt_out_capturing() {
      calls.opt_out_capturing += 1;
    },
    startSessionRecording(...args) {
      calls.startSessionRecording.push(args);
    },
    stopSessionRecording() {
      calls.stopSessionRecording += 1;
    },
    ...overrides,
  };

  return { sdk, calls };
}

function createRouterStub(initial = '/') {
  let current = initial;
  const listeners = new Set();
  return {
    getPathname: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    goTo(next) {
      current = next;
      for (const listener of Array.from(listeners)) listener(next);
    },
    listenerCount: () => listeners.size,
  };
}

function createConsentStub(initial = 'unknown') {
  let current = initial;
  const listeners = new Set();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      current = next;
      for (const listener of Array.from(listeners)) listener(next);
      return current;
    },
    grant() {
      return this.set(consentModule.CONSENT_GRANTED);
    },
    deny() {
      return this.set(consentModule.CONSENT_DENIED);
    },
    listenerCount: () => listeners.size,
  };
}

function makeController(overrides = {}) {
  const { sdk, calls } = overrides.sdk ? { sdk: overrides.sdk, calls: overrides.calls } : createSdkStub();
  const router = overrides.router || createRouterStub('/');
  const consent = overrides.consent || createConsentStub('unknown');
  const controller = createReplayController({
    sdk,
    router,
    consent,
    token: 'token' in overrides ? overrides.token : TOKEN,
    host: 'host' in overrides ? overrides.host : HOST,
  });
  return { controller, sdk, calls, router, consent };
}

/* ── 1. 依赖与锁：根 importer 精确锁定 1.438.13 ───────────────────────── */
test('manifest 与 package-lock 只允许根 importer 把 posthog-js 锁在 1.438.13', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const lockfilePath = path.join(ROOT, 'package-lock.json');

  assert.equal(manifest.workspaces, undefined, '仓库是单包：不应出现 workspaces');
  assert.equal(manifest.dependencies['posthog-js'], POSTHOG_SDK_VERSION, 'package.json 必须是精确版本');
  assert.ok(fs.existsSync(lockfilePath), 'package-lock.json 必须存在（缺失即失败）');

  const lock = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
  const importers = Object.entries(lock.packages || {}).filter(
    ([key, entry]) => entry && entry.dependencies && entry.dependencies['posthog-js'],
  );

  assert.deepEqual(
    importers.map(([key]) => key),
    [''],
    'lock 里只有根 importer 可以依赖 posthog-js（次级 / 陈旧 importer 即失败）',
  );
  assert.equal(lock.packages[''].dependencies['posthog-js'], POSTHOG_SDK_VERSION);
  assert.equal(lock.packages['node_modules/posthog-js'].version, POSTHOG_SDK_VERSION, 'lock 解析到的版本必须精确');
  assert.ok(Number(lock.lockfileVersion) >= 2, 'lockfile 必须带 packages 解析信息');

  const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));
  const resolvedPkg = requireFromRoot.resolve('posthog-js/package.json');
  const real = path.resolve(ROOT, resolvedPkg);
  assert.ok(real.startsWith(path.join(path.resolve(ROOT), 'node_modules')), '必须从根工作区解析到 node_modules');
  assert.equal(JSON.parse(fs.readFileSync(real, 'utf8')).version, POSTHOG_SDK_VERSION);

  for (const name of ['yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb']) {
    assert.equal(fs.existsSync(path.join(ROOT, name)), false, `不允许存在第二个锁文件：${name}`);
  }
});

/* ── 2. 配置缺一项就 no-op ────────────────────────────────────────────── */
test('缺 token 或 host 时既不 init 也不录制', () => {
  assert.equal(buildReplayOptions({ token: '', host: HOST }), null);
  assert.equal(buildReplayOptions({ token: TOKEN, host: '   ' }), null);
  assert.equal(buildReplayOptions({}), null);

  for (const gap of [{ token: undefined }, { token: '' }, { host: undefined }, { host: '' }]) {
    const { controller, calls } = makeController({ ...gap, consent: createConsentStub('granted') });
    controller.attach();
    controller.handleRoute('/');
    controller.start();

    assert.equal(calls.init.length, 0, '缺配置不得 init');
    assert.equal(calls.opt_in_capturing, 0);
    assert.equal(calls.startSessionRecording.length, 0);
    assert.deepEqual(controller.getState(), {
      initialized: false,
      recording: false,
      consent: 'granted',
      attached: true,
    });
  }
});

/* ── 3. 未表态 / 拒绝永不开录 ─────────────────────────────────────────── */
test('unknown 与 denied 同意都不 init、不录制', () => {
  const unknown = makeController({ consent: createConsentStub('unknown') });
  unknown.controller.attach();
  unknown.router.goTo('/');
  assert.equal(unknown.calls.init.length, 0);
  assert.equal(unknown.calls.startSessionRecording.length, 0);
  assert.equal(unknown.consent.listenerCount(), 1);

  const denied = makeController({ consent: createConsentStub('denied') });
  denied.controller.attach();
  denied.router.goTo('/');
  assert.equal(denied.calls.init.length, 0);
  assert.equal(denied.calls.startSessionRecording.length, 0);
  assert.equal(denied.calls.opt_in_capturing, 0);
  assert.equal(denied.calls.opt_out_capturing, 0, '还没 init 过，不需要 opt_out');
});

/* ── 4. 明确同意：init 一次 + opt_in + 无参 start ─────────────────────── */
test('明确同意后才 init 一次，并 opt_in + startSessionRecording()', () => {
  const { controller, calls, consent } = makeController();
  controller.attach();

  assert.equal(calls.init.length, 0, '同意前不得 init');

  consent.grant();

  assert.equal(calls.init.length, 1, '同意后 init 一次');
  assert.equal(calls.init[0].token, TOKEN);
  assert.equal(calls.init[0].options.api_host, HOST);
  assert.equal(calls.opt_in_capturing, 1);
  assert.equal(calls.startSessionRecording.length, 1);
  assert.deepEqual(calls.startSessionRecording[0], [], 'startSessionRecording 不得带覆盖参数');
  assert.equal(controller.getState().recording, true);

  consent.grant();
  assert.equal(calls.init.length, 1, '重复同意不重复 init');
  assert.equal(calls.startSessionRecording.length, 1, '重复同意不重复 start');
});

/* ── 5. 隐私选项覆盖每个通道 ─────────────────────────────────────────── */
test('buildReplayOptions 关掉所有非回放通道并全量打码', () => {
  const options = buildReplayOptions({ token: TOKEN, host: HOST });
  assert.ok(options, '配置齐全时必须给出配置');

  assert.equal(options.api_host, HOST);
  assert.equal(options.opt_out_capturing_by_default, true, '新客户端默认不采集');
  assert.equal(options.disable_session_recording, true, '新客户端默认不录制');

  for (const flag of [
    'autocapture',
    'capture_pageview',
    'capture_pageleave',
    'capture_dead_clicks',
    'rageclick',
    'capture_exceptions',
    'capture_heatmaps',
    'enable_recording_console_log',
    'capture_performance',
  ]) {
    assert.equal(options[flag], false, `${flag} 必须为 false`);
  }

  const recording = options.session_recording;
  assert.ok(recording, '必须有 session_recording 配置');
  assert.equal(recording.maskAllInputs, true);
  assert.equal(recording.maskTextSelector, '*');
  assert.equal(recording.recordBody, false);
  assert.equal(recording.recordHeaders, false);
  assert.equal(recording.captureCanvas.recordCanvas, false, 'canvas 通道必须显式关闭');
  assert.equal(recording.captureJsonLd, false);
  assert.equal(recording.blockClass, 'ph-no-capture', 'ph-no-capture 阻断必须保留');
  assert.match(recording.blockSelector, /\.ph-no-capture/);
  assert.match(recording.blockSelector, /\[data-ph-no-capture\]/);
  assert.equal(typeof recording.maskCapturedNetworkRequestFn, 'function');
});

/* ── 6. URL 脱敏钩子（网络请求 + 回放页面 URL）────────────────────────── */
test('maskCapturedNetworkRequestFn 去掉 query/hash、丢弃不安全 URL 与请求体', () => {
  const mask = createMaskedRequestFn();

  assert.equal(redactReplayUrl('https://us.i.posthog.com/e/?ip=1&ver=2#frag'), 'https://us.i.posthog.com/e/');
  assert.equal(redactReplayUrl('https://dellai.xyz/#access_token=leak'), 'https://dellai.xyz/');
  assert.equal(
    redactReplayUrl('https://dellai.xyz/api/ai-tool?email=a%40b.com&session=secret'),
    'https://dellai.xyz/api/ai-tool',
  );
  assert.equal(redactReplayUrl('/api/ai-tool?token=abc#x'), '/api/ai-tool');

  for (const blocked of [
    'https://dellai.xyz/login?next=/x',
    'https://dellai.xyz/account/settings',
    'https://dellai.xyz/api/order/20261025',
    'https://dellai.xyz/user/a@b.com',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'http://[::1',
    'https://exa mple.com/x',
    '',
  ]) {
    assert.equal(redactReplayUrl(blocked), null, `必须丢弃：${blocked}`);
  }

  const masked = mask({
    name: 'https://dellai.xyz/api/astro/reward?uid=123#frag',
    method: 'POST',
    requestBody: '{"email":"a@b.com"}',
    responseBody: '{"phone":"13800000000"}',
    requestHeaders: { cookie: 'sid=1' },
    responseHeaders: { 'set-cookie': 'sid=2' },
  });
  assert.equal(masked.name, 'https://dellai.xyz/api/astro/reward');
  assert.equal(masked.method, 'POST');
  for (const field of ['requestBody', 'responseBody', 'requestHeaders', 'responseHeaders']) {
    assert.equal(field in masked, false, `${field} 不得进入回放`);
  }

  assert.equal(mask({ name: 'https://dellai.xyz/account' }), null);
  assert.equal(mask(null), null);
  assert.equal(mask({ method: 'GET' }), null);
});

/* ── 7. 路由 / 退出 / 撤回 ───────────────────────────────────────────── */
test('离开安全链路、进敏感页、撤回同意都会停止录制', () => {
  const { controller, calls, consent, router } = makeController({ consent: createConsentStub('granted') });
  controller.attach();
  assert.equal(controller.getState().recording, true);
  assert.equal(calls.startSessionRecording.length, 1);

  assert.equal(isJourneyRoute('/'), true);
  assert.equal(isJourneyRoute('/?utm=x'), true);
  assert.equal(isSensitiveRoute('/login'), true);
  assert.equal(isSensitiveRoute('/account/settings'), true);
  assert.equal(isJourneyRoute('/login'), false);

  router.goTo('/login');
  assert.equal(controller.getState().recording, false);
  assert.equal(calls.stopSessionRecording, 1, '敏感路由立即停');

  router.goTo('/account/orders?x=1');
  assert.equal(calls.stopSessionRecording, 1, '已停就不再重复 stop');

  router.goTo('/');
  assert.equal(controller.getState().recording, true, '回到安全链路、同意仍在 → 重新开录');
  assert.equal(calls.startSessionRecording.length, 2);

  consent.deny();
  assert.equal(controller.getState().recording, false, '撤回后停止');
  assert.equal(calls.stopSessionRecording, 2);
  assert.equal(calls.opt_out_capturing, 1, '撤回同时 opt_out');
  assert.equal(controller.getState().consent, 'denied');

  router.goTo('/');
  controller.start();
  assert.equal(calls.startSessionRecording.length, 2, '拒绝后再进入也不得开录');
  assert.equal(controller.getState().recording, false);
});

/* ── 8. SDK 失败不阻断页面动作 ───────────────────────────────────────── */
test('SDK 抛异常时控制器不抛，也不假装在录制', () => {
  const { sdk, calls } = createSdkStub({
    init() {
      throw new Error('sdk init failed');
    },
  });
  const { controller } = makeController({ sdk, calls, consent: createConsentStub('granted') });

  assert.doesNotThrow(() => controller.attach());
  assert.equal(controller.getState().initialized, false);
  assert.equal(controller.getState().recording, false);
  assert.doesNotThrow(() => controller.start());
  assert.equal(controller.getState().recording, false);

  const broken = createSdkStub({
    startSessionRecording() {
      throw new Error('start failed');
    },
  });
  const second = makeController({ sdk: broken.sdk, calls: broken.calls, consent: createConsentStub('granted') });
  assert.doesNotThrow(() => second.controller.attach());
  assert.equal(second.controller.getState().recording, false);
  assert.equal(broken.calls.stopSessionRecording, 0);
});

/* ── 9. 已存在的单例：只复用，不第二次 init ──────────────────────────── */
test('已有客户端只复用设置，不再 init', () => {
  const { sdk, calls } = createSdkStub();
  sdk.__loaded = true;

  const { controller } = makeController({ sdk, calls, consent: createConsentStub('granted') });
  controller.attach();

  assert.equal(calls.init.length, 0, '已加载的客户端不得再 init');
  assert.equal(controller.getState().initialized, true);
  assert.equal(calls.opt_in_capturing, 1);
  assert.equal(calls.startSessionRecording.length, 1);
});

/* ── 10. 重复挂载：不重复 init / start / 订阅 ────────────────────────── */
test('mountReplay 重复挂载只保留一份 init、start 与监听', () => {
  const { sdk, calls } = createSdkStub();
  const router = createRouterStub('/');
  const consent = createConsentStub('granted');

  const unmountA = mountReplay({ sdk, router, consent, token: TOKEN, host: HOST });
  const unmountB = mountReplay({ sdk, router, consent, token: TOKEN, host: HOST });

  assert.equal(calls.init.length, 1);
  assert.equal(calls.startSessionRecording.length, 1);
  assert.equal(consent.listenerCount(), 1, '同意只订阅一次');
  assert.equal(router.listenerCount(), 1, '路由只订阅一次');

  router.goTo('/login');
  assert.equal(calls.stopSessionRecording, 1);

  unmountA();
  unmountB();
  assert.equal(consent.listenerCount(), 0);
  assert.equal(router.listenerCount(), 0);
  assert.ok(getMountedReplayController(), 'SDK 单例保留，StrictMode 反复挂载不抖动');
});

/* ── 11. 真实入口挂的就是这份控制器 ──────────────────────────────────── */
test('App Router 入口挂载的是被测控制器，且没有写死凭证', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
  assert.ok(layout.includes("from './components/PostHogReplay'"), 'layout 必须引入回放入口');
  assert.ok(layout.includes('<PostHogReplay />'), 'layout 必须渲染回放入口');

  const entry = fs.readFileSync(path.join(ROOT, 'app/components/PostHogReplay.tsx'), 'utf8');
  assert.ok(entry.includes("from '@/lib/posthog-replay.mjs'"), '入口必须 import 真实控制器');
  assert.ok(entry.includes('mountReplay('), '入口必须挂载真实控制器');
  assert.ok(entry.includes('sdk: posthog'), '入口必须注入 posthog 单例');

  const bannerEntry = path.join(ROOT, 'app/components/ConsentBanner.tsx');
  assert.ok(layout.includes('<ConsentBanner />'));
  assert.ok(fs.readFileSync(bannerEntry, 'utf8').includes("from '@/lib/consent.mjs'"));

  const sources = [
    'app/layout.tsx',
    'app/components/PostHogReplay.tsx',
    'app/components/ConsentBanner.tsx',
    'app/components/FortuneApp.tsx',
    'lib/posthog-replay.mjs',
    'lib/consent.mjs',
  ];
  for (const rel of sources) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(/ph[cx]_[A-Za-z0-9]{6,}/.test(text), false, `${rel} 不得包含真实项目 token`);
  }

  const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.match(envExample, /^NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=\s*$/m, '示例 token 必须留空');
  assert.match(envExample, /^NEXT_PUBLIC_POSTHOG_HOST=\s*$/m, '示例 host 必须留空');
});

/* ── 12. 全程零网络 ──────────────────────────────────────────────────── */
test('整个自检过程中没有任何网络请求', () => {
  assert.equal(networkAttempts, 0);
});
