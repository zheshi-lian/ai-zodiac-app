'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { mountReplay } from '@/lib/posthog-replay.mjs';
import { getConsentStore } from '@/lib/consent.mjs';

type RouteListener = (pathname: string) => void;

/**
 * 把 App Router 的路径变化包成控制器认识的 router 注入项。
 * 控制器只订阅一次；重复挂载不会重复订阅（见 lib/posthog-replay.mjs 的 mountReplay）。
 */
function createRouteAdapter(initial: string) {
  let pathname = initial;
  const listeners = new Set<RouteListener>();

  return {
    getPathname: () => pathname,
    subscribe(listener: RouteListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: string) {
      if (next === pathname) return;
      pathname = next;
      listeners.forEach((listener) => {
        try {
          listener(next);
        } catch {
          /* 路由订阅方异常不影响页面 */
        }
      });
    },
  };
}

/**
 * PostHog 会话回放的真实挂载点（App Router 根布局）：
 * SDK / 路由 / 同意来源全部注入，录制逻辑只在 lib/posthog-replay.mjs 里。
 * 没有 token 或 host 时控制器直接 no-op。
 */
export default function PostHogReplay() {
  const pathname = usePathname() || '/';
  // 适配器只建一次；后续路径变化通过 router.set() 推送，避免每次导航都换对象
  const [router] = useState(() => createRouteAdapter(pathname));

  useEffect(() => {
    router.set(pathname);
  }, [router, pathname]);

  useEffect(() => {
    return mountReplay({
      sdk: posthog,
      consent: getConsentStore(),
      router,
      token: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    });
  }, [router]);

  return null;
}
