# 验证并收口 SQLite 写竞争 #295

## Goal

验证 #295 后续提交是否已覆盖 SQLite 写竞争、主线程卡顿与相关 native icon crash 的已知失败模式；证据充分则更新并关闭，否则明确剩余缺口而不重复修复。

## Confirmed Facts

- #295 后续评论修正了最初“无 native crash”的判断：beta.20/21 还出现 macOS `SIGTRAP`，与 AppProvider icon hydration 相关。
- 关联提交至少包括 `95eee4e83`、`c86d82db5`、`c5e952c3c`，分别加入 DbWriteScheduler/QoS、search split 路由与真实 split DB 测试。
- 后续 `3414a9be8` 将 AppProvider 扫描写入改为有界 chunk transaction；`07-24-harden-app-icon-self-healing` 已记录真实 profile、icon native helper、DB handle 与 injected `SQLITE_BUSY` 验收。
- 本次 focused Vitest 已通过：`app-provider.test.ts`、`db-write-scheduler.test.ts`、`sqlite-retry.test.ts`，3 files / 75 tests。

## Requirements

- 将 #295 的 SQLite contention 与后续识别出的 macOS icon `SIGTRAP` 分别映射到已落地修复和验证证据。
- 确认配置持久化、usage aggregation、AppProvider backfill 均进入共享写调度/有界 transaction 路径，且不存在已知默认开启的旧长事务。
- 复核 `07-24-harden-app-icon-self-healing` 的真实打包验收，不只依赖单元测试。
- 若仍缺“最新版打包应用在原 profile 下无复发”的证据，先在 Issue 标明已修项和待验证项，保持开放。

## Acceptance Criteria

- [x] focused DB/AppProvider tests 通过且结果记录。
- [x] 关联提交与真实 profile/package evidence 能覆盖 writer contention、event-loop stall 诱因和 icon SIGTRAP 三类现象。
- [x] 没有未解释的默认关闭关键修复被误写为完成；search split 仍默认关闭，但 P0 scheduler/chunking 与 AppKit icon 修复均默认生效。
- [x] 证据充分时评论并关闭 #295；否则评论精确剩余验收条件并保持开放。

## Verification Evidence

- 4 focused test files / 77 tests passed：AppProvider、DbWriteScheduler、SQLite retry、real split DB routing。
- 真实 profile：stale icon pointers `41 -> 0`、current-cache pointers 134、main DB descriptors `486 -> 11`。
- 隔离 Electron profile 完成 227 次 hydration 并存活 2m29s；五进程 native stress 625/625，无新 `.ips`/`SIGTRAP`/`EXC_BREAKPOINT`。
- `95eee4e83`、`c86d82db5`、`c5e952c3c`、`3414a9be8`、`4724ad1e4` 等修复均为 `v2.4.13` release commit `9935ed49b` 的祖先；release workflow `30243898517` success。
- #295 已于 2026-07-27 评论并以 `completed` 关闭。

## Validation Commands

```bash
pnpm -C apps/core-app exec vitest run \
  src/main/modules/box-tool/addon/apps/app-provider.test.ts \
  src/main/db/db-write-scheduler.test.ts \
  src/main/db/sqlite-retry.test.ts
```
