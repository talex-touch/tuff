# Transport Wave A

## Goal

在不改变 typed transport 调用语义的前提下，完成第一波全局 IPC 收敛：让活跃高频推送/流稳定走 MessagePort 并保留可验证的 channel fallback；彻底移除同步插件通道与 retained raw event；以可审计的命中证据和关闭门禁完成 legacy alias 硬切，避免永久双监听。

## Background / Confirmed Facts

- `packages/utils/transport/sdk/port-policy.ts` 当前默认启用 clipboard change、file-index progress、CoreBox search session/index-committed，以及已经被 request-scoped search stream 取代的 `search.update/end/no-results`。
- renderer/plugin stream 已具备 MessagePort 首选和 channel fallback；普通 `on()` 同时保留 channel listener，端口发送成功时主进程不会重复走 channel。
- `CoreBoxEvents.layout.update` 是明确的高频 renderer→main 请求，当前通过 16ms latest batching 降压；现有端口协议只安全覆盖 main→renderer push/stream，Wave A 不改变 request/response 完成语义。
- `TouchChannel.sendSync` 和 Prelude `sendSync` 目前是抛错 tombstone，公开面已禁止但实现与类型仍残留。
- `CoreBoxRetainedEvents` 同时承载 canonical typed events 与 40 个 raw legacy aliases；CoreBox、Auth/Account、Sync、Terminal、Opener 仍存在生产双监听。
- `withLegacyAliasTelemetry` 已能上报不含业务 payload 的 `legacy_alias_hit`，但没有统一 alias 清单、静态 source-hit 证据或可执行关闭门禁。

## Requirements

### R14-01 MessagePort 高频通道迁移

- 以通道为单位迁移和验证，不做全局字符串替换。
- clipboard change、file-index progress、CoreBox search session、search index-committed 必须在端口可用时走 MessagePort，在端口不可用、握手失败或中途关闭后走现有 channel fallback。
- 从默认端口清单移除已由 search session stream 取代的 `search.update/end/no-results`。
- 端口与 fallback 不得双投递同一条消息；最后一个 handler/stream controller 释放、sender 销毁、端口关闭或 transport destroy 时必须关闭对应端口。
- renderer→main 的 `CoreBoxEvents.layout.update` 保持 16ms latest batching；除非能够保持 handler 完成/失败语义与 exactly-once 副作用，否则不得伪装成 fire-and-forget 端口迁移。

### R14-02 清理 `sendSync`

- 从插件 channel interface、`TouchChannel`、Prelude 注入代码、renderer 声明及所有测试/文档契约中删除 `sendSync`。
- 不保留抛错 shim、deprecated alias 或兼容 re-export；仓库生产源码不得再出现可调用的 `sendSync`。

### R14-03 retained raw event 迁到 typed builder

- 将 CoreBox 活跃事件直接归属到 `CoreBoxEvents` typed builder，不再通过 `core-box-retained.ts` 作为 canonical 中转。
- 可表达为 namespace/module/action 的 CoreBox search、input、item、clipboard、layout、provider、UI、recommendation、preview、MetaOverlay 事件不得继续使用 `defineRawEvent`。
- 跨层 payload 类型继续由 `packages/utils/transport/events/types` 或事件 owner 持有；生产 consumer 不得本地重定义 payload。

### R14-04 legacy alias hard-cut

- 对 CoreBox、Auth/Account、Sync、Terminal、Opener 的 Wave A alias 清单执行 clean cutover：迁移所有仓库内 producer/consumer，删除 legacy event exports、双监听和 legacy send。
- 不保留兼容 shim、旧名字 re-export 或 silent fallback；被移除事件名进入 tombstone audit registry，防止重新注册或发送。

### R14-05 legacy hit evidence

- 产出机器可读 `legacy-alias-evidence/v1`：每个 alias 包含 canonical event、family、direction、source owner、生产 source hit 数、测试/fixture hit 数、runtime telemetry observation（如有）与 hard-cut decision。
- 静态审计必须区分生产命中与测试/fixture 字符串；不得把测试覆盖误报为生产依赖。
- runtime telemetry 只记录 alias 元数据，禁止 payload、用户输入、路径、token 或其它敏感数据。

### R14-06 双监听关闭条件

- hard-cut gate 必须同时验证：canonical producer/consumer 已存在；生产 legacy producer 为 0；生产 legacy listener 为 0；端口/channel fallback 回归通过；alias evidence 完整；operator decision 明确为 hard-cut。
- 未满足门禁的 alias 不得“半删除”；满足门禁后必须删除双监听，不能永久依赖 250ms 去重或重复 handler。

## Quality Constraints

- 不新增 raw `ipcMain` / `ipcRenderer` / channel string 或 `window.touchChannel`。
- MessagePort 升级必须绑定 sender、scope、channel；端口关闭和 transport destroy 必须释放所有 listener、timeout、registry entry。
- 迁移后类型检查不得依赖 `any` 扩散或 payload cast 绕过。
- 变更按 clipboard、file-index、search、CoreBox control、plugin channel、legacy family 分组验证。

## Non-goals

- 不在本任务实现 plugin utilityProcess / callback RPC、Widget Sandbox、配置 SQLite SoT 或 TuffEx 发布供应链。
- 不把普通 request/response IPC 机械迁为 MessagePort；Wave A 只迁移已有安全端口语义覆盖的高频 push/stream。
- 不以生产 telemetry 零命中作未经观测的事实；缺少线上观测时 evidence 必须明确标记，并以本次用户指令作为 hard-cut operator decision。

## Acceptance Criteria

- [x] 默认端口清单只包含活跃高频 push/stream 通道，四个通道均验证 port-first、fallback、mid-stream close、无重复投递与资源释放。
- [x] `sendSync` 在生产 TypeScript、Prelude 生成代码和公开类型中为零命中。
- [x] CoreBox canonical 事件不再依赖 `CoreBoxRetainedEvents`，Wave A 范围内无 `defineRawEvent`。
- [x] CoreBox、Auth/Account、Sync、Terminal、Opener 生产源码无 legacy event producer、listener 或 export。
- [x] `legacy-alias-evidence/v1` 可生成并严格校验，清楚区分 source/test/runtime 证据且不含 payload。
- [x] hard-cut gate 对缺失 canonical mapping、任一生产 legacy hit、缺失 decision 或不完整证据均失败。
- [x] focused transport/CoreBox/plugin/auth/sync/terminal/opener 回归、CoreApp web typecheck 与应用启动 smoke 通过；node typecheck 无本切片新增诊断，仍受既有 file-index/search 基线错误阻断。
- [x] `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md` 的两条 Transport Wave A 在验证完成后勾选并附承接任务。

## Rollback / Compatibility

- MessagePort 回归可通过 `TALEX_TRANSPORT_PORT_CHANNELS` 空值回退到 channel；该开关只用于运行时回滚，不恢复已删除的 legacy aliases。
- hard-cut 回滚只能回退整个迁移提交；禁止单独恢复旧 alias listener 或 `sendSync` shim。
- evidence verifier 与 tombstone registry 保留，作为后续 Transport Wave 的防回归门禁。
