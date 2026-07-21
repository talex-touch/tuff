# 修复搜索流 MessagePort 交付 — Implementation

- [x] 在 shared transport 中增加 preload-to-renderer port handoff marker、校验、installer 与 subscriber。
- [x] 在 CoreApp preload 和 trusted plugin-view preload 安装 handoff，并在 unload 时释放监听器。
- [x] renderer/plugin transport 优先消费 window handoff，保留非 DOM/raw ipc adapter fallback。
- [x] 增加不 mock `openPort()` 的隔离世界端口转交与 stream 首批/terminal 回归测试。
- [x] 运行 utils transport 与 CoreBox/search 聚焦测试，运行 CoreApp node/web typecheck。
- [x] 生产构建 CoreApp；以隔离 profile、默认端口 allowlist 启动，建立/复用测试索引并验证 CoreBox 可见结果。

## Validation Commands

```bash
corepack pnpm -C "packages/utils" exec vitest run \
  "__tests__/transport-port-bridge.test.ts" \
  "__tests__/renderer-transport-stream.test.ts" \
  "__tests__/plugin-transport-stream.test.ts" \
  "__tests__/main-transport-stream.test.ts"

corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/box-tool/core-box/ipc.test.ts" \
  "src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts"

corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm -C "apps/core-app" run typecheck:web
corepack pnpm -C "apps/core-app" run build:mac
```

## Verification Evidence

- Utils transport：4 files / 11 tests；真实 `MessageChannel` transfer 经 installer -> window subscriber -> renderer/plugin transport，新增回归路径未 mock `openPort()`。
- CoreBox：2 files / 23 tests；覆盖 main stream IPC 与 renderer search 生命周期。
- `typecheck:node`、`typecheck:web` 与 `build:mac` 通过；sandboxed preload 产物为 standalone CJS，不依赖 `./chunks/*`。
- `TALEX_TRANSPORT_PORT_CHANNELS` 未设置。packaged `2.4.13-beta.16` 使用隔离 profile `/tmp/tuff-messageport-search-20260720-1915`，其 `search_index` 含 11 条 app 索引。
- 真实 CoreBox 查询 `TextEdit` 后，结果区 `CoreBoxRes--visible` 高 134px、窗口高 190px，可见 `/System/Applications/TextEdit.app`；运行日志无 preload shared-chunk 错误、`confirm_timeout` 或 port fallback。

## Review Gates

- 回归测试必须经过真实 `window.postMessage` transfer handoff，不得通过 mock `openPort()` 证明修复。
- 实机结果必须来自默认 MessagePort 配置；空 allowlist 只用于对照，不得作为最终方案。
- 若 shared bridge 不能同时满足 renderer/plugin parity，则停止，不以 search-only 特判交付。
