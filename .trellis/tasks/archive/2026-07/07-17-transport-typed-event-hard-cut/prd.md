# Transport Typed Event Hard Cut

## Goal

删除同步插件通道 tombstone，并把 CoreBox canonical transport 从 retained/raw 定义迁到 typed builder，使生产代码只暴露 async typed transport；legacy raw aliases 暂留给紧随其后的 evidence/hard-cut 子任务处理。

## Confirmed Facts

- `sendSync` 仍残留在 `packages/utils/plugin/channel.ts` interface/class、renderer hook 类型、transport channel types 与 Prelude 生成代码；其实现只抛错。
- CoreApp plugin runtime 的 `createRemovedChannelError` 类型仍包含 `channel.sendSync`，但运行时只读取 `channel.raw` 分支。
- `CoreBoxEvents` 仍通过 `CoreBoxRetainedEvents` re-export 29 个 canonical typed events，另有 search/input/item/clipboard 生产事件使用 `defineRawEvent`。
- `core-box-retained.ts` 同时混合 canonical definitions、payload interfaces 与 40 个 legacy raw aliases，导致 canonical owner 和兼容层不可独立删除。

## Requirements

### sendSync clean cut

- 从插件 channel interface/class、renderer hook types、transport channel types、Prelude 生成代码和 CoreApp removed-capability union 中删除 `sendSync`。
- 不保留 throw-only method、error helper、deprecated property、type alias 或 runtime stub。
- 插件 preload smoke 继续证明 page context 的 `$channel.sendSync` 为 `undefined`；生产代码不得注入该属性。

### CoreBox canonical ownership

- `CoreBoxEvents` 必须直接通过 `defineEvent(namespace).module(module).event(action)` 定义 canonical events，不得从 `CoreBoxRetainedEvents` 取值。
- 把 retained 文件中的 payload interfaces 迁到 `events/types/core-box.ts` 或既有 owner，并由 canonical 与 temporary legacy definitions 共同引用。
- 将 CoreBox search、input.change、item、clipboard.change 等 active raw events 改为 typed builder event names。
- 保持 request/response payload、batch 和 stream metadata；所有 producer/consumer 继续引用 event object，禁止手写新 channel string。
- 本子任务结束时 `CoreBoxRetainedEvents` 只允许保留 `legacy` aliases，供下一子任务执行 evidence gate 与 clean hard-cut；不得再承载 canonical 定义。

## Non-goals

- 本子任务不删除 CoreBox/Auth/Sync/Terminal/Opener legacy aliases 或双监听。
- 不改变业务 payload、permission、search session 或 plugin callback RPC。
- 不新增兼容 re-export。

## Acceptance Criteria

- [x] 生产 TypeScript、renderer hook/channel types 与 Prelude 生成代码无 callable `sendSync`。
- [x] plugin preload smoke 观察 `$channel.sendSync === undefined`，且 async send/on 仍工作。
- [x] `CoreBoxEvents` 无 `CoreBoxRetainedEvents` value dependency，canonical CoreBox event 均使用 typed builder。
- [x] `core-box-retained.ts` 的 payload types 已移入 owning type module，并在后续 alias hard-cut 完成后删除。
- [x] CoreBox event names、payloads、batch/stream metadata 的 focused contract tests更新并通过。
- [x] utils transport/plugin tests、CoreBox main/renderer tests、scoped lint、CoreApp web typecheck 通过；node typecheck不得新增本切片错误。

## Rollback

- sendSync 与 CoreBox event ownership 各自按完整 slice 回退；不得恢复单个同步方法或 raw canonical event。
- legacy alias 文件只在下一子任务的 hard-cut gate 完成后删除。
