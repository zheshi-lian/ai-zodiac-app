# PostHog 会话回放（受同意控制，已脱敏）

一条真实浏览器链路 = 星座运势首页 `/` 的「选星座 → 生成运势 → 看视频解锁深度报告」。
录制只在用户**明确同意**后开启，所有隐私通道都已显式关掉，不依赖 PostHog 项目侧的远端默认值。

## 1. 基线记录（改动前）

| 项 | 值 |
| --- | --- |
| framework | Next.js `14.2.4`（App Router；**低于 15.3**，所以用「挂载式客户端 bootstrap + 控制器」，没有 `instrumentation-client.ts`） |
| packageManager | npm `10.9.2`（`package.json` 无 `packageManager` 字段），single-package 仓库，无 `workspaces` |
| locks | 只有根 `package-lock.json`（`lockfileVersion` 3，已存在，被 `.gitignore` 忽略但保留在磁盘）；**无 `yarn.lock`**，无 pnpm/bun 锁 |
| SDK-importing package | 根包 `ai-zodiac-app`（`D:\训练数据`），SDK 从根 `node_modules` 解析 |
| 基线 typecheck | `npx tsc --noEmit` → **通过**（exit 0） |
| 基线 lint | `npm run lint`（`next lint`）→ **无法非交互运行**：仓库没有任何 ESLint 配置，`next lint` 会弹出配置向导，并且每次都会改写 `tsconfig.json` 的 `include` |
| 基线 build | `npm run build` → **通过**（改后重跑仍通过） |
| 既有改动 | `app/globals.css` 在我开始前就有未提交改动，未触碰 |

> 注：`next lint` / `next build` / `next dev` 会自行往 `tsconfig.json` 的 `include` 里加 `.next/types/**/*.ts`。这不是本任务需要的改动，`tsconfig.json` 保持原样。
>
> 为了让 lint 能跑通且不再改动 `tsconfig.json`：新增了根 `.eslintrc.json`（`{"extends":["next/core-web-vitals"]}`，沿用仓库已有的 `eslint-config-next`；按仓库 .gitignore 白名单策略，它和根目录其它点文件一样不进入版本库），并把 `npm run lint` 从 `next lint` 改为直接调用 ESLint：`eslint app lib --ext .js,.cjs,.mjs,.jsx,.ts,.tsx`。规则与目录覆盖和 Next 默认一致（app / lib），结果 `0 errors, 0 warnings`，且不再触发 `next lint` 里的 TypeScript 配置写入。

## 2. 安装（一次性，已执行）

```bash
npm install posthog-js@1.438.13
```

- 精确锁在 `1.438.13`（`package.json` 无 `^`），`package-lock.json` 的根 importer 解析到 `node_modules/posthog-js@1.438.13`。
- 没有第二个 PostHog 客户端、没有第二份 SDK、没有切换包管理器。

## 3. 改了什么

| 文件 | 作用 |
| --- | --- |
| `lib/posthog-replay.mjs` | **唯一的录制控制器**：隐私选项、URL/网络脱敏、同意门控、路由门控、单例挂载。纯 JS（`.mjs`），SDK / 路由 / 同意来源全部注入，可被 `node:test` 直接 import |
| `lib/consent.mjs` | 同意来源（三态 `granted` / `denied` / `unknown`），只有用户点过「允许」才是 granted；缺失/异常一律 unknown；撤回写 `denied` |
| `app/components/PostHogReplay.tsx` | 真实挂载点：注入 `posthog` 单例 + App Router 路径适配器 + 同意存储，调用 `mountReplay()` |
| `app/components/ConsentBanner.tsx` | 同意入口：允许 / 仅必要 / 关闭并撤回（撤回 = 立即停止 + opt_out） |
| `app/layout.tsx` | 根布局里渲染 `<PostHogReplay />` 与 `<ConsentBanner />`（App Router 没有 `_app`，这是本项目的等价位置） |
| `app/components/FortuneApp.tsx` | 姓名/昵称输入框的子树加 `ph-no-capture` + `data-ph-no-capture`（自由文本整棵子树阻断） |
| `posthog-replay.check.mjs` | 离线自检（node:test，mock SDK / 路由 / 同意） |
| `.env.example` | 两个示例变量，**值为空** |
| `.gitignore` | 放行上面三个交付文件（其余白名单规则不变） |

## 4. 挂载与生命周期

```
app/layout.tsx
  └─ <PostHogReplay />                 client component
       └─ mountReplay({ sdk: posthog, consent: getConsentStore(), router, token, host })
            └─ lib/posthog-replay.mjs   ← 全站唯一控制器（模块级单例 + 引用计数）
```

- **SDK 一律从根 `node_modules` 解析**（`import posthog from 'posthog-js'`），走 Next 的打包，不引 CDN。
- `mountReplay()` 是幂等的：重复挂载（React StrictMode 双调用、路由重挂）只加引用计数，**不会重复 init / start / 订阅**；最后一次卸载只摘监听，SDK 单例与已开录制保留，避免抖动。
- 路由门控：只有 `/` 是安全链路。离开 `/` 或进入敏感页立即 `stopSessionRecording()`；回到 `/` 且同意仍在才重新开录。

## 5. 同意 → 录制的确切顺序

1. 未表态（`unknown`）或拒绝（`denied`）：**不 init**、不 `opt_in_capturing`、不 `startSessionRecording`，一条请求都不发。
2. 用户点「允许分析」→ `granted`：
   - `posthog.init(token, options)`（`opt_out_capturing_by_default: true` + `disable_session_recording: true`，所以新客户端天然是关闭态）；
   - `opt_in_capturing()`；
   - `startSessionRecording()` —— **不带任何参数**，因此项目侧的「启用开关 / 采样率 / 触发器 / 最短时长 / 授权域名（authorized domains）」仍然全部生效，代码无法强行录制。
3. 点「关闭并撤回」→ `stopSessionRecording()` + `opt_out_capturing()`，之后再回到 `/` 也不会自动开录。
4. 已存在的客户端（`posthog.__loaded === true`，别处已经 init 过）：只复用它的设置，**不第二次 init**。
5. token 或 host 缺失：整个模块 no-op。

## 6. 隐私边界（每条都是显式写死的）

顶层：

- `opt_out_capturing_by_default: true`、`disable_session_recording: true`
- `autocapture` / `capture_pageview` / `capture_pageleave` / `capture_dead_clicks` / `rageclick` / `capture_exceptions` / `capture_heatmaps` 全 `false`
- `enable_recording_console_log: false`、`capture_performance: false`
- `mask_all_text: true`、`mask_all_element_attributes: true`

`session_recording`：

- `maskAllInputs: true`、`maskTextSelector: '*'` → 输入框与文本全打码
- `recordBody: false`、`recordHeaders: false` → 本地 false 覆盖远端开关，请求/响应体与头不入库
- `captureCanvas: { recordCanvas: false }` → canvas 通道显式关闭（canvas 不受 DOM 打码保护）
- `captureJsonLd: false` → 页面里的 JSON-LD（本项目 layout 有一份）不录
- `blockClass: 'ph-no-capture'`（保留约定阻断）＋ `blockSelector`：`.ph-no-capture`、`[data-ph-no-capture]`、`[data-private]`、密码/邮箱/电话输入框、信用卡号输入框 → 整棵子树不录（覆盖文本打码漏掉的属性、图片、title）
- `maskCapturedNetworkRequestFn`：**同时作用于网络请求和回放页面 URL**
  - 只保留 `origin + pathname`，`query` 与 `fragment` 一律删除；
  - 解析失败、非 `http(s)`、无 host → 丢弃（返回 `null`）
  - 命中敏感路径段（login/auth/account/profile/billing/payment/pay/checkout/recharge/withdraw/wallet/order/invoice/admin/token…）→ 丢弃
  - 路径里出现邮箱、手机号、UUID、token/key/secret/session/otp 类标识 → 丢弃
  - 顺带删掉 `requestBody` / `responseBody` / `requestHeaders` / `responseHeaders`（双保险）

事件属性：控制器不调用 `posthog.capture()`，不发送任何姓名、邮箱、表单值或自由文本。

## 7. 自检（离线，无需账号）

```bash
node posthog-replay.check.mjs
```

- 父进程用「只有 OS/路径/临时目录」的最小环境重跑自己，子进程里 `fetch` 被打瘫（断言 0 次网络请求），合成 token 在 import 控制器之前注入。
- import 的是真实控制器 `lib/posthog-replay.mjs`（也就是 `app/components/PostHogReplay.tsx` 挂载的那份），SDK / 路由 / 同意都是桩。
- 覆盖：manifest + `package-lock.json` 精确锁定 1.438.13（且只允许根 importer，出现第二个锁文件/次级 importer/版本漂移即失败）、缺 token/host 不 init、unknown/denied 不录、同意后只 init/start 一次、重复挂载不重复 init/start/订阅、离开安全链路与敏感路由停止、撤回 opt_out、拒绝后再进入不录、SDK 抛异常不影响页面、URL 脱敏（secret query/hash、畸形 URL、敏感路径）、新客户端默认关闭 / 已有客户端不重复 init、真实入口挂载的是这份代码、源码里没有真实项目 token。

## 8. 私有配置 + 亲自验证回放（需要你自己做）

1. 打开 PostHog 注册/登录页（下面 `Still needed` 里有链接），创建/进入项目。
2. 在本机 `.env.local` 里填**你自己的公开项目 token**（不是个人 API key）：

   ```bash
   NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=<你的 project token>
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # 或 https://eu.i.posthog.com，按你选的区域
   ```

   token 由你私有配置，不要贴到对话里；`.env.example` 里这两项保持空字符串。
3. 在 PostHog 项目设置里确认：Session replay 已开启、采样率、触发器、最短时长、authorized domains（本地调试要允许 `localhost`）。
4. 重启 dev server（`npm run dev`），打开 `http://localhost:3000/`。
5. 点右下角「允许分析」→ 选星座 →「生成我的运势」→ 在姓名框里随便输一个名字 →（可选）点解锁。
6. 点「关闭并撤回」，再刷新页面确认录制不再开始。
7. 回 PostHog → Session replay 打开这条录像，逐项确认：
   - 有 F12 一样的页面结构、点击与滚动上下文；
   - 姓名输入框、所有文本都被打码/遮挡；
   - 地址栏/事件里看不到 `?query`、`#hash`、邮箱、手机号；
   - 撤回之后没有新录像。

   如仍有敏感内容或没有录像，把现象（不含 token）描述出来即可，这一步按「未确认」处理。
