# Channel 错误回复被当作数据 resolve（附带插件图标 tfile 403）

## Goal

渲染层的 channel 层对「错误回复」与「成功回复」不做区分：`code` 非成功时仍 `resolve(res.data)`，于是每个 typed SDK 都可能把错误负载当成数据用。本次已修掉一个崩溃点，本任务负责治根，并保留已修的同源缺陷（macOS `/private` 路径别名错配）作为证据。

## Requirements

### R1（已修，本任务主体）错误回复必须 reject，而不是 resolve 成数据

- 位置（改前行号）：`apps/core-app/src/renderer/src/modules/channel/channel-core.ts:318-339`
  - `:318` 已经识别 `DATA_CODE_ERROR`(100) / `DATA_CODE_NETWORK_ERROR`(500) 并打日志 `[Channel][send][errorReply]`；
  - `:339` 紧接着仍执行 `resolve(res.data as TResponse)`。
- 主进程侧错误回复的构造是明确的「错误」语义，从不携带业务数据：`apps/core-app/src/main/core/channel-core.ts:641`（handler 抛错 → `reply(DataCode.ERROR, { message, reason: 'handler_throw', eventName })`）、`:660`（promise reject）、`:841/880/911`（序列化失败 / 插件名非法 / 超时 / 发送失败）。
- 主进程代码里已有旁证注释承认这个行为：`apps/core-app/src/main/core/channel-core.ts:372-376` —— 「the renderer channel resolves it as `undefined` (its `errorReply` branch only warns), so a first-paint consumer commits an undefined snapshot and never retries」。
- 现有后果（实测）：`network:read-text` 读取被拒的本地文件时，主进程回复错误负载 `{ name, message: 'NETWORK_FILE_FORBIDDEN', stack }`，渲染层把它当字符串返回，`useSvgContent` 的 `text.trim()` 抛 `TypeError: text.trim is not a function`（真实机日志 2026-09-26 08:31:12，`apps/core-app/src/renderer/src/modules/hooks/useSvgContent.ts:506-516`），真实原因被 TypeError 掩盖。
- 约束：`packages/utils/transport/sdk/**` 的签名（如 `NetworkSdk.readText(): Promise<string>`）当前是谎报的，治根方案需要同时决定「SDK 层是否校验返回形状」，改动面覆盖全部 domain。

### R2（已修，仅作证据保留）macOS `/private` 路径别名导致白名单判定失败

- 现象：已安装插件的 `assets/logo.svg` 被判为「不在允许根内」→ tfile 403 + `NETWORK_FILE_FORBIDDEN`。
- 根因：macOS `/tmp -> private/tmp`。允许根来自 `resolveRuntimeRootPath(app)`（`local-file-policy.ts:79-91`），形态是 `/tmp/<profile>/userdata/tuff-dev/...`；而插件图标由 `TuffIconImpl.resolveLocalFilePath` 经 `fse.realpath` 规范化（`apps/core-app/src/main/core/tuff-icon.ts:72-87`）后交给渲染层，形态是 `/private/tmp/<profile>/...`，前缀比对必然不匹配。
- 已修：`apps/core-app/src/main/utils/local-file-policy.ts` 新增 `foldDarwinPrivateAlias`，在 `isAllowedLocalFilePath` 的两侧比较前折叠 `/private` 前缀（仅比较用，非 darwin 恒等）。

## Acceptance Criteria

- [x] R1：channel 错误回复在渲染层以 rejection 到达调用方（携带主进程给的 `message`/`reason`），成功回复不受影响；`useSvgContent` 等消费方在失败时拿到可读错误而不是 `TypeError`。
- [x] R1：至少一个真实错误路径（`network:read-text` 读被拒路径）端到端复现「失败即 reject」，且 `packages/utils/transport/sdk/**` 的类型声明与实际返回值一致（或显式声明为可错误）。
- [x] R2：`/private/tmp/<profile>` 形态的插件图标在真机上正常渲染（日志无 `Blocked path`、无 `NETWORK_FILE_FORBIDDEN`）。
  - ⚠️ 实际验到的是**策略层**：经 channel 读 `/tmp/…` 与 `/private/tmp/…` 两种形态都成功 ✓；**未**单独跑一张真实插件图标的渲染。覆盖图标场景的是同一条 `isAllowedLocalFilePath`，`local-file-policy.test.ts` 已含插件图标用例 ✓。

## Verification (2026-09-26)

- 代码：`apps/core-app/src/renderer/src/modules/channel/channel-core.ts` 把「非 `SUCCESS` 回复」从 `resolve(res.data)` 改为 reject（`code: 'channel_error_reply'`，另带 `eventName`/`replyCode`/`reason`/`payload`，`reason` 仅在主进程给出时附带）；`apps/core-app/src/renderer/src/modules/hooks/useSvgContent.ts` 里那条止血守卫与其 helper `describeChannelFailure` 一并删除（治根后不再需要）。
- 真机（隔离 profile + 独占端口 9462/9463 与 CDP 9342/9345，同分支代码分别构建）：
  - 改前：`network:read-text { source: '/etc/hosts' }` **resolve** 出 `{"name":"Error","message":"NETWORK_FILE_FORBIDDEN",…}` —— 调用方拿它当文件内容，`text.trim()` 抛 TypeError。
  - 改后：同一调用 **reject**，`Error.message='NETWORK_FILE_FORBIDDEN'`、`code='channel_error_reply'`、`replyCode=100`、`eventName='network:read-text'`；`network:get-config` 仍正常 resolve。
  - SDK 声明：拒绝是带外通道，`readText(): Promise<string>` 因此在语义上不再谎报（失败不再伪装成数据）。
- 既有测试：`apps/core-app/src/renderer/src/modules/hooks/useSvgContent.test.ts` 原先把缺陷本身当成预期 —— 用 `mockResolvedValue({ message: 'ENOENT…' })` 建模「失败的读取被 resolve」，注释原文写着 *a failed readText resolves this payload rather than rejecting*。契约变更后该用例转红（收到 `text.trim is not a function`），已按新语义改写为 `mockRejectedValue` 并断言**主进程给的原因逐字透出**（不再有自造的 `Icon content request failed: ` 前缀）；成功路径那行逐字未动，未新增用例，`vitest run …/useSvgContent.test.ts` 3/3 通过。同契约的其它测试（transport/plugin/integration）无一处钉着旧行为，插件侧两个用例钉的是「主进程如何构造错误回复」，与该缺陷的消费侧无关。
- 结论：这个坑当初是**用一个测试把它固化下来**（止血）而不是修掉它，所以本次是「改测试」而不是「回退修复」。
- 已知副作用（有意，非缺陷）：拒绝会让**「发射后不管」的调用点浮出未处理拒绝**。渲染层没有 `unhandledrejection` 兜底（只有主进程 `precore.ts:43` 有），这类点会以 Chromium 的 `Uncaught (in promise)` 落到渲染层控制台。渲染层控制台**确有**既有转发通道（主日志里能读到渲染层来源的行；错误上报落在 `apps/core-app/src/main/channel/common.ts:1618` 的 `[renderer-error]`），但**未验证**它是否覆盖「未处理拒绝」这一事件类型 —— 若要保证这类失败一定可见，应显式加钩子（对齐主进程 `precore.ts:43`）。实测覆盖面：46 处 `void appSdk.openExternal(...)`（`packages/utils/transport/sdk/domains/app.ts:48` 确认为 channel 请求）。本次**不改**这些点（超出本任务范围），但这是「失败不再静默」这一方向的必然代价；若要更干净，应在渲染层加一个统一的 unhandledrejection 上报口（对齐主进程 precore 的做法）。
- 套件：渲染层 **253 文件 / 2148 用例全绿** ✓（含 `tuff-icon-rendering`、`icon-color-mode`、`home-push/icons`、`useSvgContent` 等全部图标相关用例）；整套 core-app（渲染层 + 主进程 + scripts）报 8 文件 / 23 用例失败，逐条归因后**与本次改动无关**：一类是本机 shell PATH 缺 mise shims → 测试脚本 `spawnSync corepack ENOENT`（CI 有 corepack ✓），一类是另一个会话的 31 项未提交在途。已提交树在 beta.45 的 PR #1976 上 `App suites (core-app)` 为绿 ✓。

## R3（未修，旁路发现，待定）

同一缺陷的**第二处实现**（本次反向排查发现，未在本任务要求范围内，故只记录）：

- 位置：`packages/utils/plugin/channel.ts:382-387`（`TouchChannel.send` 的 reply 回调）—— `resolve(res.data)`，**没有任何 code 判据**（比渲染层更彻底：连那条 `errorReply` 警告都没有）。主进程对插件请求同样以 `DataCode.ERROR` 回复错误，所以第三方插件拿到的是错误负载而不是结果，与 `useSvgContent` 当初撞的是同一个坑。
- 影响面：所有走 `$channel.send(...)` 的插件；插件是第三方代码，出错时同样静默。
- 建议改法：与本次渲染层一致 —— `res.code !== DataCode.SUCCESS` 时 reject，带 `code: 'plugin_channel_error_reply'` + `eventName`/`replyCode`/`reason`/`payload`；`packages/utils/plugin/channel.ts:21` 那份本地 `DataCode` 与 `packages/utils/transport/channel-types.ts` 的权威枚举应统一。
- 验证提示：`packages/utils/plugin/**` 无现成 send/reply 用例，需要用一个桩 `$plugin` + 桩 `ipcRenderer` 的脚本驱动 reply 回调。

## Notes

- R2 的验证配方：**光把 profile 放 `/tmp` 不够**。`TUFF_STARTUP_BENCHMARK_USER_DATA_DIR=/tmp/<dir>` 只把数据写到那里，实测该用户的 `/tmp/<dir>/...` 两种形态仍被判 `NETWORK_FILE_FORBIDDEN`（允许根里没有它）；加 `--user-data-dir=/tmp/<dir>` 同样不行。必须让**允许根本身**落在 `/tmp`：用 `TMPDIR=/tmp` 起 app（`os.tmpdir()` 这条根即 `/tmp`），此时 `/tmp/...` 与 `/private/tmp/...` 两种形态都能读通，后者正是别名场景。
- R1 修完前，任何依赖「错误回复会 reject」的代码都不可信；新增类似的类型守卫只能算止血。
- SDK 返回形状：决定**不做**逐 domain 的运行时形状校验。错误已走 rejection（带外通道），`Promise<T>` 因此在语义上成立；再在每个 domain 校验成功负载只会把主进程的契约复制一遍，并给每次调用加一遍分配。若某个**成功**回复出现非预期形状，那应按主进程 bug 处理，而不是在 SDK 层兜。
- 传导链已按代码核对：`renderer-transport.ts` 对 `channel.send` 的 rejection 会包装成 `[TuffTransport] Failed to send "…": <原 message>` 再 reject（线上那条 60s 超时错误即此形态），所以 SDK 调用方同样拿到拒绝，且原因文本被保留。
- 本机环境（会拖慢排查）：mise shims 里的 `pnpm` 是坏的 —— mise 试图安装 `aqua:pnpm/pnpm@11.24.0` 并向 pnpm 索取 `pnpm-macos-arm64`，而实际资产名是 `pnpm-darwin-arm64.tar.gz`，于是**任何经 shims 调 `pnpm`/`corepack` 的东西立即失败**。直接用 `~/Library/pnpm/pnpm` 正常。跑本仓库测试若见 `spawnSync corepack ENOENT`，即此因，**非代码问题**（同一用例在补上 corepack 的 CI 里是绿的）。
