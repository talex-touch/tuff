# 实施计划：统一 OTA 安装协调与恢复

## 1. Quit intent

1. 新增 typed store 与优先级。
2. 接入 precore before-quit/window-all-closed/power shutdown、TouchApp.quit、startup failures、duplicate instance、benchmark quit。
3. Before/WILL event 携带 intent。

## 2. 安装边界 clean cutover

1. UpdateSystem 暴露 verified handoff task info，删除直接 trigger/spawn/open。
2. ActionController 只走 DownloadCenter；install 只调用 coordinator schedule。
3. 删除 MacAutoUpdaterAdapter、electron-updater dependency 与 runtime modules。
4. 删除 app-update.yml 条件测试和旧双路径。

## 3. Recovery store 与平台 adapter

1. 实现 root/path/schema/token/atomic JSON guard。
2. 实现 previous package 单份 promote/read。
3. 实现 macOS/Windows/Linux command resolver。
4. 扩展 macOS apply backup contract并新增 restore script。

## 4. Coordinator

1. schedule install-now 与 normal-quit gating。
2. BEFORE 二次 verification、plan、CAS、prepared helper。
3. WILL 同步 detached spawn；重复事件 idempotent。
4. startup reconcile handoff/marker；ALL_MODULES_LOADED health ack。

## 5. Helper

1. 安全读取 plan、等待 parent、执行 handoff。
2. ack timeout 与一次性 recovery。
3. marker 与 cleanup。
4. helper 只用 Node built-ins；测试通过伪命令/临时目录，不碰真实系统。

## 6. Focused verification

- Quit intents：每类退出、优先级、默认归类。
- Coordinator：ready schedule、intent gate、BEFORE/WILL、重复事件、preflight fail。
- Store：escape/schema/token/stale marker/previous single asset。
- Platform：mac/NSIS/MSI/AppImage/deb/unsupported。
- Helper：parent wait、ack、timeout recovery once、recovery unavailable/fail。
- Health：target/wrong version、idempotent ack、recovered/recovery-required。
- mac scripts：fake app copy、direct failure restore、health backup retention。

```bash
corepack pnpm -C "apps/core-app" exec vitest run <ota-install-recovery-tests>
corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm -C "apps/core-app" exec vue-tsc --noEmit -p tsconfig.web.json --composite false
```

## 7. Review gate

- 仅 coordinator 监听 OTA BEFORE/WILL 并 spawn helper。
- `electron-updater` / `MacAutoUpdaterAdapter` / app-update.yml 运行时路径为零。
- 非允许 quit intent 不产生 plan/handoff。
- helper 文件全部在 storage root，token/attempt 匹配。
- recoveryAttempted 不可能从 true 回到 false。
