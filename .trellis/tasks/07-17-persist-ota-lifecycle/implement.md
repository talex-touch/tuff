# 实施计划：持久化 OTA 生命周期状态机

## 1. Shared contract

1. 在 `packages/utils/types/update.ts` 增加 lifecycle phase、snapshot、error 与 command payload。
2. 更新 update transport events/SDK，`getStatus` 和动作响应统一返回 snapshot。
3. 对导出字段变更先检查全部调用点；clean cutover 旧布尔状态。

## 2. SQLite 与 repository

1. 在 Drizzle schema 增加 `appUpdateAttempts`。
2. 生成/添加 migration 与索引。
3. 新增 `UpdateAttemptRepository`：create/getActive/getById/transition/clearTerminal。
4. transition 使用 id + revision + expected phase CAS，并返回新 snapshot source row。
5. 新增 pure reducer/transition table，repository 不复制规则。

## 3. UpdateService 接入

1. 初始化时恢复 active attempt。
2. check、candidate、download start/completion、verification、install action 通过 lifecycle commands 提交。
3. `getStatus` 从 repository + DownloadCenter projection 构造 snapshot。
4. clear cache、ignore、cancel 与重复事件遵守合法转换。

## 4. 设置迁移

1. Shared/core/renderer 改为 `installOnNormalQuit`，默认 true。
2. load settings 一次性迁移旧 auto-install 字段并删除旧写出。
3. 迁移/清理 `pendingInstallVersion`；不能构造不可信 ready。
4. 更新设置页与诊断仅限字段名/默认值，不在本子任务改变安装 UI 流程。

## 5. Renderer

1. `useUpdateRuntime` 持有最后 snapshot/revision。
2. 旧 revision、unknown attempt 和 terminal 后非 terminal snapshot 被忽略。
3. UI 原有 ready/task 显示从 snapshot 派生，不自行组合 host state。

## 6. Focused verification

- Reducer：全部合法/非法转换、terminal idempotence、retry。
- Repository：migration、CAS 冲突、restart restore、active uniqueness。
- Transport：producer/consumer round-trip、stable errors。
- Settings：new/old/missing precedence、pending version 安全迁移。
- Renderer：stale revision suppression。

```bash
corepack pnpm -C "packages/utils" exec vitest run <update-lifecycle-contract-tests>
corepack pnpm -C "apps/core-app" exec vitest run <update-lifecycle-main-renderer-tests>
corepack pnpm -C "apps/core-app" exec vue-tsc --noEmit -p tsconfig.web.json --composite false
corepack pnpm -C "apps/core-app" run typecheck:node
```

## 7. Review gate

- 搜索确认无 `autoInstallDownloadedUpdates` 与长期 `pendingInstallVersion` 读取。
- phase 写入只有 repository transition 一个 owner。
- renderer 没有 lifecycle 持久化或布尔真源。
- DownloadCenter progress 不复制到 attempt 表。
