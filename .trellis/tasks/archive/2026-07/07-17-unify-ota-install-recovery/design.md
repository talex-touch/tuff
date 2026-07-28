# 技术设计：统一 OTA 安装协调与恢复

## 1. 组件

- `quit-intent.ts`：进程内 typed intent 单例，安全意图优先级防降级。
- `UpdateInstallCoordinator`：唯一 schedule/preflight/helper/health/recovery owner。
- `update-platform-adapter.ts`：纯平台命令选择，不执行。
- `update-recovery-store.ts`：storage-root 内 plan/ack/marker/previous asset 原子文件操作与路径校验。
- `update-handoff-helper.cjs`：parent 退出后的独立进程；执行 handoff、等待 ack、最多一次 recovery。
- `macos-apply-update.sh` / `macos-restore-update.sh`：macOS app 替换和 backup 恢复。

## 2. Quit intent

```ts
type QuitIntentKind =
  | "user-normal"
  | "update-now"
  | "system-shutdown"
  | "startup-failure"
  | "duplicate-instance"
  | "other";

interface QuitIntent {
  kind: QuitIntentKind;
  reason: string;
  setAt: number;
}
```

安全优先级：system-shutdown/startup-failure/duplicate-instance 高于 update-now，高于 user-normal，高于 other。`before-quit` 仅在 intent 为空时设置 user-normal。

## 3. Coordinator phases

- `scheduleInstall('install-now')`：校验 active ready/task，提交 install-scheduled，设置 update-now，调用现有 app.quit 流程。
- 普通退出：BEFORE 读取 active ready；仅设置打开时提交 install-scheduled(normal-quit)。
- BEFORE：再次流式验证；解析 verified task；创建 token/plan；选择 previous；提交 handoff-started；缓存 prepared helper spec。
- WILL：同步 spawn helper + unref，一次性清除 prepared spec。
- 新版本 startup：handoff-started 且版本匹配时提交 awaiting-health；ALL_MODULES_LOADED 后提交 healthy 并写 ack。

任何 preflight 失败提交 failed，且不准备 helper。非允许 intent 不改变 ready attempt。

## 4. Plan schema

`UpdateHandoffPlanV1` 包含：schemaVersion、attemptId、token、platform、parentPid、currentVersion、targetVersion、taskId、packagePath、createdAt、healthTimeoutMs、ackPath、markerPath、handoff command、可选 recovery command、cleanupPaths、recoveryAttempted=false。

Store 规则：

- root = `<appRoot>/modules/update-recovery`；plan/ack/marker/previous 都必须 resolve 后仍在 root 内。
- JSON 先写同目录 temp，再 rename。
- mode 0600；目录 0700（平台允许时）。
- plan 读取必须验证 schema、非空 attempt/token、PID、时间、所有内部路径和 command executable/args 类型。
- ack/marker 必须匹配当前 plan attemptId + token。

## 5. Helper

1. 安全读取 plan。
2. 等待 parent PID 退出；超时写 handoff-failed marker。
3. 执行 handoff；macOS 等待脚本退出，Windows/Linux 只确认 detached spawn/open 成功。
4. 等待 ackPath 出现并验证 token，成功后清理 backup/stage。
5. timeout/hand-off failure 且 recovery command 存在、未尝试时执行一次并写 recovery-started marker。
6. 无 previous 或 recovery 失败写 recovery-required marker；永不循环执行。

## 6. 平台命令

- macOS：bash apply script(source,dest,stage,backup,log)，recovery 为 bash restore script(backup,dest,log)。
- Windows：NSIS executable（无 silent 成功声明）或 `msiexec /i package`；previous 使用同 resolver。
- Linux：AppImage chmod + 直接 spawn；deb 使用 `xdg-open`；previous 同类型。

不支持的扩展在 BEFORE fail closed。

## 7. Previous asset

`previous/metadata.json` + 单一 package。healthy 后把本次 verified target package复制为 future previous，保存 version、sha256、filename、platform、createdAt；原子替换目录。macOS 当前 `.app` backup 独立于 package previous，并在 ack 前保留。

## 8. Recovery reconciliation

startup 先读取 active attempt 对应 marker：

- recovery-started 且运行版本为 previousVersion：handoff/awaiting -> recovery-required -> recovering -> recovered。
- recovery-required/handoff-failed：提交 recovery-required，不再次自动恢复。
- stale attempt/token marker：隔离删除/忽略，不改 SQLite。

## 9. Clean cutover

删除 MacAutoUpdaterAdapter、electron-updater dependency/runtime module、app-update.yml 探测与对应 tests。ActionController 只保留 DownloadCenter download/install schedule 路径。UpdateSystem 只负责 candidate、download 和 verification/task info，不再直接执行平台安装。
