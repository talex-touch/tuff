# Channel 错误回复被当作数据 resolve（附带插件图标 tfile 403）

## Goal

渲染层的 channel 层对「错误回复」与「成功回复」不做区分：`code` 非成功时仍 `resolve(res.data)`，于是每个 typed SDK 都可能把错误负载当成数据用。本次已修掉一个崩溃点，本任务负责治根，并保留已修的同源缺陷（macOS `/private` 路径别名错配）作为证据。

## Requirements

### R1（未修，本任务主体）错误回复必须 reject，而不是 resolve 成数据

- 位置：`apps/core-app/src/renderer/src/modules/channel/channel-core.ts:318-339`
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

- [ ] R1：channel 错误回复在渲染层以 rejection 到达调用方（携带主进程给的 `message`/`reason`），成功回复不受影响；`useSvgContent` 等消费方在失败时拿到可读错误而不是 `TypeError`。
- [ ] R1：至少一个真实错误路径（`network:read-text` 读被拒路径）端到端复现「失败即 reject」，且 `packages/utils/transport/sdk/**` 的类型声明与实际返回值一致（或显式声明为可错误）。
- [ ] R2：`/private/tmp/<profile>` 形态的插件图标在真机上正常渲染（日志无 `Blocked path`、无 `NETWORK_FILE_FORBIDDEN`）。

## Notes

- R2 的验证配方：隔离 profile + `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR`（profile 落在 `/tmp`）即可复现，不需要真实登录态。
- R1 修完前，任何依赖「错误回复会 reject」的代码都不可信；新增类似的类型守卫只能算止血。
