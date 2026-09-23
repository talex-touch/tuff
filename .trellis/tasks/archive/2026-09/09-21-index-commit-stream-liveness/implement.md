# Implement — index-committed 流变聋修复

- [x] 1. 先加回归测试（`renderer-transport-stream.test.ts`）：port 投递后 channel 投递必须交付；修复前应失败。
- [x] 2. 改 `client-runtime.ts` 三个 channel 处理器的守卫；加一次性 fallback 日志。
- [x] 3. 调整 `renderer-transport-stream.test.ts` / `plugin-transport-stream.test.ts` 中「channel-duplicate 被丢弃」的断言为「被交付」。
- [x] 4. `pnpm -C packages/utils exec vitest run __tests__/renderer-transport-stream.test.ts __tests__/plugin-transport-stream.test.ts __tests__/stream-client-error-cleanup.test.ts __tests__/renderer-transport-port-lifecycle.test.ts __tests__/main-transport-stream.test.ts`。
- [x] 5. `pnpm -C packages/utils run typecheck`（若有）或 `tsc --noEmit -p packages/utils`。
- [x] 6. 真机：重启隔离栈，不重载页面，等待 ≥8 分钟后：新建 bench 文件 → `Executing precise query` +1 且 DOM 顶部更新；装探针应用 → 同上；卸载 → 同上。
- [ ] 7. （未做，见 PRD Notes）取证主进程丢记录的原因：验证运行期间在 `main-transport.ts removePort` 临时打印 index-committed 通道的移除原因（验证结束后还原）。
- [x] 8. 更新 `.trellis/spec/main-process/channel-transport-contracts.md`。
- [x] 9. `git diff --check`。
