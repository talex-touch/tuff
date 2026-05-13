# 跨平台兼容与占位实现深度复核报告（2026-05-13）

> 复核范围：`apps/core-app/src`、`apps/pilot/{app,server}`、`apps/nexus/{app,server}`、`packages/*`、`plugins/*` 的源码与 `plan-prd` 活跃入口。
> 关系：本文承接 `cross-platform-compat-placeholder-review-2026-05-12.md`，不替代 Windows 真机 acceptance evidence。

## 1. 总体结论

整体跨平台兼容性已经进入“显式能力合同 + 证据门禁”阶段，代码主线没有发现新的生产 raw channel 直连或 P0 级假成功默认路径。当前最大风险不再是单点实现错误，而是：

- Windows/macOS 真实设备 evidence 仍未闭环，不能用本地 verifier 或 macOS 代跑替代正式 `2.4.10` gate。
- Pilot 仍存在少量兼容豁免/占位响应以 `quotaOk` 形态返回，虽然比固定假系统状态低风险，但仍容易被调用方当作成功业务数据消费。
- CLI / 插件侧凭据与命令执行能力还没有统一进入 secure store / platform capability 诊断模型。
- 架构 SRP 风险仍集中在 51 个生产样式源码文件超过 1200 行，后续应继续小步拆分，而不是引入新兼容层。

质量判断：`2.4.10` 仍应聚焦 Windows release evidence；`2.4.11` 再收口 Pilot 兼容占位、CLI token、插件 secret/command capability 与 retained raw definition。

## 2. 本轮代码事实

### 已确认稳定项

- `apps/pilot/server/api/system/serve/stat.get.ts` 已调用 `buildPilotServeStat()`，未再返回 `Mock CPU` / `pilot-mock` 固定资源假值。
- `apps/pilot/server/utils/pilot-payment-service.ts` 通过 `PILOT_PAYMENT_MODE=mock` 门控 mock 支付；关闭时返回 `PAYMENT_PROVIDER_UNAVAILABLE` 语义。
- `plugins/touch-image/src/App.vue` 已使用 `usePluginStorage()` 写入 `history-images.json`，旧 `historyImgs` localStorage 仅作为一次性迁移来源并删除。
- CoreApp 平台能力在 `capability-adapter.ts` 中按平台返回 `supported / best_effort / unsupported` 与 `reason / issueCode / limitations`；Linux `xdotool` 缺失为显式 unsupported。
- Sync 输出仍保持 `payload_enc` / `payload_ref`，`meta_plain` 只保留 schema、size、hash、key id 等非业务元数据；旧 `/api/sync/*` 在 Nexus 返回 retired disabled 语义。
- `packages/utils/common/utils/safe-shell.ts` 提供 `execFileSafe()` / `spawnSafe()` 的 `shell:false` 路径，并对命令、换行、空字节做基础拦截。
- `pnpm -C "packages/utils" exec vitest run "__tests__/transport-event-boundary.test.ts"` 通过：raw send allowlist 未新增未授权项，typed migration candidate 为 `0`，retained raw definition 上限保持 `265`。

### 剩余占位/假实现风险

#### P1：Pilot 兼容占位仍以成功响应形态暴露

- `apps/pilot/server/api/livechat/random.get.ts` 在没有 `wechat.livechat` 数据时返回 `quotaOk({ exempted: true, answer: "当前返回的是可消费的豁免占位响应。" })`。
- `apps/pilot/server/api/aigc/prompts/detail/[id]/index.get.ts` 返回 `M1 默认提示词` 与“占位提示词详情”。
- `apps/pilot/server/api/[...path].ts` 返回 body 内 `code=501`，但当前 handler 没有显式设置 HTTP status，调用方可能只按 HTTP 2xx 误判为成功。

建议：`2.4.11` 将这些路径切到明确 HTTP 410/501 或 `unavailable + reason + migrationTarget`；若必须保留兼容豁免，响应字段应强制 `exempted: true` 且前端不得把它渲染为真实业务数据。

#### P1：CLI token 明文 JSON 仍未收口

- `packages/tuff-cli-core/src/auth.ts` 仍将 token 写入 `$TUFF_CONFIG_DIR/auth.json` 或 `~/.tuff/auth.json`。
- `packages/unplugin-export-plugin/src/core/auth.ts` 存在相同形态的 token JSON 逻辑。

建议：短期写入后设置 `0600` 并在 Windows 验证 ACL；中期抽 `CliCredentialStore`，优先 Keychain / Credential Locker / libsecret，保留 `TUFF_AUTH_TOKEN` 作为 CI 无头路径。

#### P1：插件 provider secret 仍可能进入普通 plugin storage

- `plugins/touch-translation/src/composables/useTranslationProvider.ts` 已用 plugin storage 替代 localStorage，但 `providers_config` 中包含 `apiKey`、`secretKey` 等 provider config。

建议：把 token/key/secret 从普通 provider config 拆出，走 plugin secure storage 或 CoreApp 统一 secret capability；普通 storage 只保留 provider id、enabled、endpoint、model 等非敏感 metadata。

#### P1：插件命令执行能力仍分散

- `touch-system-actions`、`touch-quick-actions` 仍使用 `exec` 执行平台 shell 字符串。
- `touch-workspace-scripts` 通过 `spawn(..., { shell: true })` 执行 workspace 命令。
- `touch-browser-open`、`touch-window-manager`、`touch-window-presets` 使用 `execFile` / PowerShell / AppleScript 做平台集成。

这些不是假实现，但能力边界分散。建议逐步接入统一 Native/Permission capability 诊断：每个 action 至少声明平台、权限、命令来源、unsupported/degraded reason 与审计字段；高风险 shell 字符串优先替换为参数化 `execFile` 或 `safe-shell`。

### 架构 SRP 风险

排除 `.wrangler`、VitePress cache、测试目录后，本轮生产样式源码统计：

- `>=1200` 行文件：51 个。
- `>=900` 行文件：103 个。
- 当前最大文件集中在 `file-provider.ts`、`plugin-module.ts`、`tuffIntelligenceLabService.ts`、`app-provider.ts`、Nexus docs 页面、transport event registry、authStore、UpdateService、search-core 等。

建议继续按最近路径切片：

1. `file-provider.ts`：索引调度、诊断导出、thumbnail/media、platform fast provider 边界。
2. `plugin-module.ts` / `plugin.ts`：lifecycle、runtime repair、surface/window wiring、registry update。
3. `app-provider.ts`：source scanner、launch resolver、metadata enrichment、diagnostic evidence。
4. Nexus/Pilot 大文件：request parsing、provider adapter、sanitizer、view-state composable。

## 3. 非问题或低优先级噪声

- `.fake-background` 是视觉工具类，不是 fake implementation。
- Vue `placeholder` 多为输入框占位文案，不等于未实现功能。
- Vitest `vi.mock`、测试 dummy、fixture mock 不计入生产假实现。
- `packages/tuff-native` OCR stub 是显式 unsupported 平台路径，不是 false-success；关键是 UI/SDK 必须透传 reason。
- CoreApp renderer 的语言、折叠状态、预览尺寸等 localStorage 用途属于 UI preference，不等同于敏感业务存储；路径、token、key、prompt/response 原文仍不得长期写入。

## 4. 下一步建议

1. `2.4.10` 只推进 Windows 真机 evidence：collection plan、case/manual/performance evidence、final verify、Nexus Release Evidence。
2. `2.4.11` 第一批修 Pilot 兼容占位响应：HTTP status、`unavailable` 合同、前端渲染降级。
3. 立项 CLI / 插件 secret storage：先 chmod/ACL，再抽统一 credential store，最后提供 plugin secret capability。
4. 迁移 retained raw definition 的高频路径：CoreBox、terminal、auth、sync、opener、plugin-log。
5. 继续 SRP 小切片，优先 `file-provider` 与 `plugin-module`，每次拆分只移动纯 helper 或单职责 service，并跑最近路径测试。

## 5. 本轮执行过的校验

- `pnpm -C "packages/utils" exec vitest run "__tests__/transport-event-boundary.test.ts"`：通过。
- 静态扫描：
  - 平台分支与系统命令调用。
  - `localStorage` / `payload_enc` / `/api/sync/*` / `defineRawEvent`。
  - `TODO/FIXME/placeholder/stub/fake/dummy/mock/not implemented` 生产命中抽样。
  - 生产样式源码大文件行数统计。

## 6. 本轮未执行

- 未运行完整 `pnpm lint`、`pnpm typecheck:all`、`pnpm quality:release`。
- 未执行 Windows/macOS/Linux 真机验证。
- 未修改业务代码。
- 未执行 git commit / push。
